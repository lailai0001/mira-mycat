'use strict';
import req from '../../util/req.js';
/*
 * 荐片（jianpian）· 按 drpy 规则重写
 * ---------------------------------------------------------------------------
 * 接口（https://api.ztcgi.com）：
 *   首页轮播 /api/slide/list?pos_id=88
 *   分类列表 /api/crumb/list?fcate_pid=<tid>&category_id=&page=<pg>&area=&year=&type=&sort=
 *   短剧列表 /api/crumb/shortList?fcate_pid=67&category_id=&page=<pg>&type=67&sort=update
 *   详情     /api/video/detailv2?id=<id>        （影视）
 *   短剧详情 /api/detail?vid=<id>               （短剧，playlist[].url 为 mp4）
 *   搜索     /api/v2/search/videoV2?key=<wd>&category_id=88&page=<pg>&pageSize=20
 *   图片域名 /api/v2/settings/resourceDomainConfig  → imgDomain 逗号分隔
 *
 * 图片：三个 img 域名不是都通，/home、/category 首次用的时候并发探活一次，缓存 30 分钟。
 * 播放：详情里就是 m3u8（短剧是 mp4），/play 原样 parse:0 返回，不经过解析器。
 * 集数 id 形如 "<videoId>@<tid>"，tid=67 表示短剧，走 /api/detail。
 */

const API = 'https://api.ztcgi.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '电视剧' },
  { type_id: '3', type_name: '动漫' },
  { type_id: '67', type_name: '短剧' },
  { type_id: '4', type_name: '综艺' },
];

const PAGE_SIZE = 15;
const MEDIA_RE = /\.(?:m3u8|mp4|flv|mkv|ts)(?:[?#]|$)/i;
const IMG_FALLBACK = 'img.cqkgy.com';
const IMG_TTL = 30 * 60 * 1000;

let imgHost = '';
let imgAt = 0;
let imgTask = null;

function headers(extra) {
  return Object.assign(
    { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'zh-CN,zh;q=0.9' },
    extra || {}
  );
}

async function getText(url, timeout) {
  try {
    const r = await req.get(url, { headers: headers(), timeout: timeout || 15000, responseType: 'text', validateStatus: () => true });
    return { status: r.status || 200, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '') };
  } catch (e) { return { status: 0, text: '' }; }
}

async function getJson(url, timeout) {
  let r = await getText(url, timeout);
  if (!r.text) {
    // 站点偶尔首个连接会卡到 30s，给一次重试
    await new Promise((res) => setTimeout(res, 300));
    r = await getText(url, timeout);
  }
  if (!r.text) return null;
  try {
    return JSON.parse(r.text);
  } catch (e) {
    return null;
  }
}

function imgUrl(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const host = imgHost || IMG_FALLBACK;
  return 'https://' + host + (s.charAt(0) === '/' ? '' : '/') + s;
}

async function resolveImgHost() {
  if (imgHost && Date.now() - imgAt < IMG_TTL) return imgHost;
  if (imgTask) return imgTask;
  imgTask = (async () => {
    const cfg = await getJson(API + '/api/v2/settings/resourceDomainConfig', 10000);
    const raw = cfg && cfg.data && cfg.data.imgDomain ? String(cfg.data.imgDomain) : '';
    const list = raw
      .split(',')
      .map((s) => s.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''))
      .filter(Boolean);
    const hosts = list.length ? list : [IMG_FALLBACK];
    const probes = await Promise.all(
      hosts.map((h) =>
        getText('https://' + h + '/', 4000).then(
          (r) => ({ host: h, ok: !!r.status && r.status > 0 }),
          () => ({ host: h, ok: false })
        )
      )
    );
    const good = probes.filter((x) => x.ok).map((x) => x.host);
    // 优先 img* 开头的域名（站点配置里也是这么挑的）
    const imgs = good.filter((h) => h.indexOf('img') === 0);
    imgHost = (imgs.length ? imgs : good).length ? (imgs.length ? imgs : good)[0] : hosts[0];
    imgAt = Date.now();
    return imgHost;
  })().then(
    (h) => {
      imgTask = null;
      return h;
    },
    () => {
      imgTask = null;
      imgHost = IMG_FALLBACK;
      imgAt = Date.now();
      return imgHost;
    }
  );
  return imgTask;
}

function splitId(raw) {
  const s = String(raw || '').trim();
  const at = s.lastIndexOf('@');
  if (at > 0 && /^\d+$/.test(s.slice(at + 1))) {
    return { id: s.slice(0, at), tid: s.slice(at + 1) };
  }
  return { id: s, tid: '' };
}

function cardOf(item, tid) {
  if (!item || item.id == null) return null;
  const short = String(tid) === '67';
  const title = String(item.title || item.name || '').trim();
  if (!title) return null;
  const cover = short ? item.cover_image || item.path || item.thumbnail : item.thumbnail || item.tvimg || item.path;
  const desc = item.mask || (item.playlist && item.playlist.title) || '';
  const score = item.score && parseFloat(item.score) > 0 ? ' ⭐' + item.score : '';
  return {
    vod_id: String(item.id) + (tid ? '@' + tid : ''),
    vod_name: title,
    vod_pic: imgUrl(cover),
    vod_remarks: desc + score,
  };
}

function listResult(list, page, size, total) {
  return {
    page,
    pagecount: page + (list.length >= size ? 1 : 0),
    limit: size,
    total: total || (page - 1) * size + list.length,
    list,
  };
}

function shortPlaylist(data) {
  const eps = (data.playlist || [])
    .filter((ep) => ep && ep.url)
    .map((ep, i) => (ep.title || i + 1) + '$' + ep.url);
  return eps.length ? [{ name: '边下边播', urls: eps.join('#') }] : [];
}

async function detailOf(raw) {
  const { id, tid } = splitId(raw);
  if (!id) return null;
  const isShort = String(tid) === '67';
  let data = null;
  let short = isShort;

  if (!isShort) {
    const j = await getJson(API + '/api/video/detailv2?id=' + encodeURIComponent(id), 30000);
    data = j && j.data ? j.data : null;
    const hasSource = !!(data && (data.source_list_source || []).some((s) => s && (s.source_list || []).length));
    if (!hasSource && tid === '') {
      const js = await getJson(API + '/api/detail?vid=' + encodeURIComponent(id), 30000);
      const sd = js && js.data ? js.data : null;
      // 短剧接口有 playlist；而且标题必须对得上，避免 id 撞号拿到别的片子
      if (sd && (sd.playlist || []).length) {
        data = sd;
        short = true;
      }
    }
  } else {
    const j = await getJson(API + '/api/detail?vid=' + encodeURIComponent(id), 15000);
    data = j && j.data ? j.data : null;
  }
  if (!data || !data.title) return null;

  const vod = {
    vod_id: String(raw),
    vod_name: String(data.title || ''),
    vod_pic: imgUrl(short ? data.cover_image || data.path : data.thumbnail || data.tvimg || data.path),
    type_name: (data.types || []).map((t) => t.name).filter(Boolean).join('/') || '',
    vod_year: String(data.year || ''),
    vod_area: String(data.area || ''),
    vod_remarks: String(data.update_cycle || data.mask || ''),
    vod_actor: (data.actors || []).map((a) => a.name || a).filter(Boolean).join('/'),
    vod_director: (data.directors || []).map((d) => d.name || d).filter(Boolean).join('/'),
    vod_content: String(data.description || ''),
  };

  const lines = [];
  if (short) {
    for (const l of shortPlaylist(data)) lines.push(l);
  } else {
    for (const src of data.source_list_source || []) {
      const eps = (src.source_list || [])
        .filter((ep) => ep && ep.url)
        .map((ep, i) => (ep.source_name || ep.weight || i + 1) + '$' + ep.url);
      if (!eps.length) continue;
      const name = String(src.name || '').replace('常规线路', '边下边播') || '线路' + (lines.length + 1);
      lines.push({ name, urls: eps.join('#') });
    }
  }
  if (lines.length) {
    vod.vod_play_from = lines.map((l) => l.name).join('$$$');
    vod.vod_play_url = lines.map((l) => l.urls).join('$$$');
  }
  return vod;
}

// ------------------------------------------------------------------ 站点

const __spider = {
  meta: { key: 'py_jianpian', name: '📽荐片- 极速', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },

  api: async (fastify) => {
    fastify.post('/init', async () => {
      resolveImgHost().catch(() => {});
      return {};
    });

    fastify.post('/home', async () => {
      await resolveImgHost();
      const j = await getJson(API + '/api/slide/list?pos_id=88', 15000);
      const rows = (j && j.data) || [];
      const list = rows
        .map((it) => {
          const id = it && (it.jump_id || it.id);
          if (!id || !it.title) return null;
          return {
            vod_id: String(id) + '@1',
            vod_name: String(it.title),
            vod_pic: imgUrl(it.thumbnail || it.pc_thumbnail || it.tvimg),
            vod_remarks: '',
          };
        })
        .filter(Boolean);
      return { class: CLASSES, filters: {}, list };
    });

    fastify.post('/category', async (request) => {
      const b = request.body || {};
      const tid = String(b.id || b.type_id || b.tid || '1').trim() || '1';
      const page = Math.max(1, parseInt(b.page || b.pg, 10) || 1);
      const ext = Object.assign({}, b.filters || b.filter || {}, b.extend || {});
      const area = String(ext.area || '0');
      const year = String(ext.year || '0');
      const type = String(ext.type || ext.cateId || tid);
      const sort = String(ext.sort || 'update');
      await resolveImgHost();
      const short = tid === '67';
      const url =
        API +
        (short ? '/api/crumb/shortList' : '/api/crumb/list') +
        '?fcate_pid=' + encodeURIComponent(tid) +
        '&category_id=&page=' + page +
        '&area=' + encodeURIComponent(area) +
        '&year=' + encodeURIComponent(year) +
        '&type=' + encodeURIComponent(type) +
        '&sort=' + encodeURIComponent(sort);
      const j = await getJson(url, 15000);
      const list = ((j && j.data) || []).map((it) => cardOf(it, tid)).filter(Boolean);
      return listResult(list, page, PAGE_SIZE);
    });

    fastify.post('/search', async (request) => {
      const b = request.body || {};
      const wd = String(b.wd || b.keyword || b.key || '').trim();
      const page = Math.max(1, parseInt(b.page || b.pg, 10) || 1);
      if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
      await resolveImgHost();
      const url =
        API + '/api/v2/search/videoV2?key=' + encodeURIComponent(wd) +
        '&category_id=88&page=' + page + '&pageSize=20';
      const j = await getJson(url, 15000);
      const list = ((j && j.data) || [])
        .map((it) => {
          const cats = it.res_categories || [];
          const top = it.top_category || cats[0] || {};
          // 短剧命中时走 /api/detail，影视走 detailv2
          const tid = String(top.id || (cats[0] && cats[0].id) || '');
          return cardOf(it, tid);
        })
        .filter(Boolean);
      return listResult(list, page, 20);
    });

    fastify.post('/detail', async (request) => {
      const b = request.body || {};
      const raw = Array.isArray(b.id) ? b.id[0] : b.ids || b.id;
      await resolveImgHost();
      const vod = await detailOf(String(raw || ''));
      return { list: vod ? [vod] : [] };
    });

    fastify.post('/play', async (request) => {
      const b = request.body || {};
      const raw = String(b.id || b.play || b.url || '').trim();
      if (!raw) return { parse: 1, url: '' };
      const url = raw.indexOf('//') === 0 ? 'https:' + raw : raw;
      if (MEDIA_RE.test(url)) return { parse: 0, url, header: headers() };
      return { parse: 1, url, header: headers() };
    });
  },
};

export default function createSpider() { return __spider; }
