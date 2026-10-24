import req from '../../util/req.js';
function normHeaders(h) {
  const o = {};
  try { for (const [k, v] of Object.entries(h || {})) o[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v; } catch (e) {}
  return o;
}
// Cat-contract transport: axios (req) first, typeof-guarded fetch fallback only.
// Returns engine-style { status, headers, text, content, data, buf } so the
// original hmtv call sites keep working. HTTP error statuses are returned,
// not thrown (original engine req resolved with status); network failures throw.
async function httpReq(url, opt = {}) {
  const o = opt || {};
  const headers = Object.assign({}, o.headers || {});
  delete headers['Accept-Encoding']; delete headers['accept-encoding'];
  const timeout = o.timeout || 20000;
  const binary = !!o.binary;
  const method = (o.method || (o.body != null ? 'POST' : 'GET')).toUpperCase();
  const data = o.body !== undefined ? o.body : o.data;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: binary ? 'arraybuffer' : 'text', maxRedirects: 5 });
    const buf = binary ? Buffer.from(r.data || []) : undefined;
    const text = binary ? '' : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
    return { status: r.status || 200, headers: normHeaders(r.headers), text, content: text, data: r.data, buf };
  } catch (e) {
    if (e && e.response) {
      const d = e.response.data;
      const buf = binary ? Buffer.from(d || []) : undefined;
      const text = binary ? '' : (typeof d === 'string' ? d : JSON.stringify(d ?? ''));
      return { status: e.response.status || 0, headers: normHeaders(e.response.headers), text, content: text, data: d, buf };
    }
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: (method === 'GET' || method === 'HEAD') ? undefined : data, signal: ctl.signal, redirect: 'follow' });
        const headers2 = {}; try { r.headers.forEach((v, k) => { headers2[String(k).toLowerCase()] = v; }); } catch (e2) {}
        if (binary) { const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: headers2, text: '', content: '', data: buf, buf }; }
        const text = await r.text(); return { status: r.status, headers: headers2, text, content: text, data: text };
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

/*
 * 多源短剧（duoju_local_node）· 多站聚合（MacCMS 采集接口）
 * ---------------------------------------------------------------------------
 * 数据源：7 个采集站，全部是标准苹果CMS 采集接口：
 *   ?ac=list           → 分类表
 *   ?ac=detail&t=&pg=  → 分类列表
 *   ?ac=videolist&pg=  → 最新列表
 *   ?ac=detail&ids=    → 详情（含 vod_play_url）
 *   ?ac=detail&wd=     → 搜索
 *
 * 频道：首页推荐 / 短剧精选 / 电影 / 连续剧 / 综艺 / 动漫 / 纪录片 /
 *       都市言情 / 穿越重生 / 反转爽剧 / 脑洞悬疑 / AI漫剧
 *
 * 同名片子跨站合并，多站都收录的排前面；详情与播放按 `站点key:vod_id` 定位。
 */

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const SITES = [
  { key: 'lz', name: '量子', api: 'https://cj.lziapi.com/api.php/provide/vod/', main: true },
  { key: 'ff', name: '非凡', api: 'https://api.ffzyapi.com/api.php/provide/vod/', main: true },
  { key: 'bf', name: '暴风', api: 'https://bfzyapi.com/api.php/provide/vod/', main: true },
  { key: 'dy', name: '天堂', api: 'https://caiji.dyttzyapi.com/api.php/provide/vod/', main: true },
  { key: 'wj', name: '无尽', api: 'https://api.wujinapi.me/api.php/provide/vod/', main: true },
  { key: 'gs', name: '光速', api: 'https://api.guangsuapi.com/api.php/provide/vod/', main: false },
  { key: 'bd', name: '百度', api: 'https://api.apibdzy.com/api.php/provide/vod/', main: false },
];

const CHANNELS = [
  { id: 'home', name: '🏠 首页推荐', mode: 'latest' },
  { id: 'short', name: '🔥 短剧精选', aliases: ['短剧', '微短剧'] },
  { id: 'movie', name: '🎬 电影', aliases: ['电影'] },
  { id: 'tv', name: '📺 连续剧', aliases: ['连续剧', '电视剧'] },
  { id: 'show', name: '🎭 综艺', aliases: ['综艺'] },
  { id: 'anime', name: '🎌 动漫', aliases: ['动漫', '动画'] },
  { id: 'doc', name: '🎞 纪录片', aliases: ['纪录片', '记录片'] },
  { id: 'dushi', name: '💕 都市言情', aliases: ['都市', '言情'] },
  { id: 'chuanyue', name: '⏳ 穿越重生', aliases: ['穿越', '重生'] },
  { id: 'fanzhuan', name: '🔥 反转爽剧', aliases: ['爽剧', '反转', '逆袭'] },
  { id: 'xuanyi', name: '🧠 脑洞悬疑', aliases: ['悬疑', '脑洞'] },
  { id: 'aiman', name: '🎨 AI漫剧', aliases: ['AI漫剧', '漫剧', 'AI'] },
];

const PAGE_SIZE = 30;
const PER_SITE = 10;

const classCache = new Map();

async function fetchText(url, timeout) {
  try {
    const r = await httpReq(url, { headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' }, timeout: timeout || 12000 });
    return r.status >= 400 ? '' : r.text;
  } catch (e) { return ''; }
}

function parseJson(text) {
  let t = String(text || '').trim();
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  try { return JSON.parse(t); } catch (e) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

async function api(site, params) {
  const qs = Object.keys(params).map((k) => k + '=' + encodeURIComponent(String(params[k] ?? ''))).join('&');
  const url = site.api + (site.api.includes('?') ? '&' : '?') + qs;
  const text = await fetchText(url);
  return parseJson(text) || {};
}

async function siteClasses(site) {
  const hit = classCache.get(site.key);
  if (hit && Date.now() - hit.at < 3600 * 1000) return hit.list;
  const j = await api(site, { ac: 'list' });
  const list = (j.class || []).map((c) => ({ tid: String(c.type_id), name: String(c.type_name || '') }));
  classCache.set(site.key, { at: Date.now(), list });
  return list;
}

async function findTid(site, aliases) {
  const list = await siteClasses(site);
  for (const a of aliases) {
    const hit = list.find((c) => c.name.includes(a));
    if (hit) return hit.tid;
  }
  return '';
}

const clean = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const normName = (s) => clean(s).replace(/[【】\[\]（）()·:：\-—\s]/g, '').toLowerCase();

function toItem(site, v) {
  if (!v || !v.vod_id) return null;
  const remarks = clean(v.vod_remarks || '');
  return {
    vod_id: site.key + ':' + String(v.vod_id),
    vod_name: clean(v.vod_name),
    vod_pic: String(v.vod_pic || ''),
    vod_remarks: remarks,
  };
}

// 跨站合并：同名保留条目最多的一版，多站收录的排前面
function mergeItems(buckets) {
  const map = new Map();
  buckets.forEach((list, idx) => {
    for (const it of list || []) {
      if (!it) continue;
      const key = normName(it.vod_name);
      if (!key) continue;
      const cur = map.get(key);
      if (cur) {
        cur.sites.add(idx);
        if (!cur.item.vod_pic && it.vod_pic) cur.item.vod_pic = it.vod_pic;
        if (!cur.item.vod_remarks && it.vod_remarks) cur.item.vod_remarks = it.vod_remarks;
      } else {
        map.set(key, { item: { ...it }, sites: new Set([idx]) });
      }
    }
  });
  return [...map.values()]
    .sort((a, b) => b.sites.size - a.sites.size || String(b.item.vod_remarks).localeCompare(String(a.item.vod_remarks)))
    .map((x) => x.item);
}

async function fetchChannel(ch, pg) {
  const sites = ch.mode === 'latest' ? SITES.filter((s) => s.main) : SITES;
  const buckets = await Promise.all(
    sites.map(async (site) => {
      try {
        if (ch.mode === 'latest') {
          const j = await api(site, { ac: 'videolist', pg });
          let list = j.list || [];
          if (!list.length) {
            const j2 = await api(site, { ac: 'detail', pg });
            list = j2.list || [];
          }
          return list.slice(0, PER_SITE).map((v) => toItem(site, v)).filter(Boolean);
        }
        const tid = await findTid(site, ch.aliases || []);
        if (!tid) return [];
        const j = await api(site, { ac: 'detail', t: tid, pg });
        return (j.list || []).slice(0, PER_SITE).map((v) => toItem(site, v)).filter(Boolean);
      } catch (e) {
        return [];
      }
    })
  );
  return mergeItems(buckets);
}

async function detailOf(vodId) {
  const i = vodId.indexOf(':');
  const key = i < 0 ? 'lz' : vodId.slice(0, i);
  const id = i < 0 ? vodId : vodId.slice(i + 1);
  const site = SITES.find((s) => s.key === key) || SITES[0];
  const j = await api(site, { ac: 'detail', ids: id });
  const v = (j.list || [])[0];
  if (!v) return null;

  const eps = String(v.vod_play_url || '')
    .split('#')
    .map((seg) => {
      const parts = seg.split('$');
      const name = clean(parts[0] || '');
      const url = String(parts[1] || '').trim();
      return url ? { name: name || '播放', url } : null;
    })
    .filter(Boolean);

  const from = site.name;
  return {
    vod_id: vodId,
    vod_name: clean(v.vod_name),
    vod_pic: String(v.vod_pic || ''),
    vod_year: String(v.vod_year || ''),
    vod_area: clean(v.vod_area || ''),
    vod_actor: clean(v.vod_actor || ''),
    vod_director: clean(v.vod_director || ''),
    vod_content: clean(v.vod_content || ''),
    vod_remarks: clean(v.vod_remarks || ''),
    vod_play_from: from,
    vod_play_url: eps.map((e) => e.name.replace(/[$#]/g, '_') + '$' + e.url).join('#'),
  };
}

export default function createSpider() {
  return {
  meta: { key: 'py_duoju_local_node', name: '🎬多源 - 短剧', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => {
      let list = [];
      try { list = await fetchChannel(CHANNELS[0], 1); } catch (e) { list = []; }
      return { class: CHANNELS.map((c) => ({ type_id: c.id, type_name: c.name })), filters: {}, list: list.slice(0, PAGE_SIZE) };
    });

    fastify.post('/category', async (request) => {
      const body = (request.body) || {};
      const id = String(body.id || body.type_id || 'home');
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      const ch = CHANNELS.find((c) => c.id === id) || CHANNELS[0];
      const list = await fetchChannel(ch, page);
      return {
        page,
        pagecount: list.length >= PAGE_SIZE ? page + 1 : page,
        limit: PAGE_SIZE,
        total: list.length ? 9999 : 0,
        list: list.slice(0, PAGE_SIZE),
      };
    });

    fastify.post('/search', async (request) => {
      const body = (request.body) || {};
      const wd = String(body.wd || body.keyword || '').trim();
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      if (!wd) return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
      const buckets = await Promise.all(
        SITES.map(async (site) => {
          try {
            const j = await api(site, { ac: 'detail', wd, pg: page });
            return (j.list || []).slice(0, PER_SITE).map((v) => toItem(site, v)).filter(Boolean);
          } catch (e) { return []; }
        })
      );
      const list = mergeItems(buckets);
      return { page, pagecount: page, limit: PAGE_SIZE, total: list.length, list: list.slice(0, PAGE_SIZE) };
    });

    fastify.post('/detail', async (request) => {
      const body = (request.body) || {};
      const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids;
      const vodId = String(raw || '');
      if (!vodId) return { list: [] };
      const v = await detailOf(vodId);
      return { list: v ? [v] : [] };
    });

    fastify.post('/play', async (request) => {
      const body = (request.body) || {};
      const raw = String(Array.isArray(body.id) ? body.id[0] : body.id || body.ids || '');
      if (!raw) return { parse: 0, url: '' };
      const header = { 'User-Agent': UA };
      if (/\.(m3u8|mp4|mkv)(\?|$)/i.test(raw)) return { parse: 0, url: raw, header };

      if (/^https?:\/\//i.test(raw)) {
        // 分享页：里面通常写着 const url = "/xxx/index.m3u8?sign=..."
        const html = await fetchText(raw, 12000);
        if (html) {
          const m =
            html.match(/const\s+url\s*=\s*[\"']([^\"']+)[\"']/i) ||
            html.match(/[\"'](https?:\/\/[^\"']+\.m3u8[^\"']*)[\"']/i);
          if (m && m[1]) {
            let u = m[1];
            if (u.startsWith('//')) u = 'https:' + u;
            else if (!/^https?:/i.test(u)) { try { u = new URL(u, raw).href; } catch (e) { u = ''; } }
            if (u) return { parse: 0, url: u, header };
          }
        }
        return { parse: 1, url: raw, header };
      }
      return { parse: 0, url: '' };
    });
  },
};
}
