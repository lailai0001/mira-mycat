import req from '../../util/req.js';
async function reqTextAx(url, opt = {}) {
  const method = (opt.method || 'GET').toUpperCase();
  const headers = Object.assign({}, opt.headers || {});
  const timeout = opt.timeout || 20000;
  const body = opt.body !== undefined ? opt.body : opt.data;
  try {
    const r = await req({ method, url, headers, data: body, timeout, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

'use strict';
/*
 * 爱看机器人 · 猫源 node 版
 * ------------------------------------------------------------
 * 由 drpy(dr2) 源「爱看机器人[虫]」移植而来，改成猫源引擎能直接吃的
 * { meta, api } 插件形态。原文件用的是 var rule = {...}，猫源没有 drpy
 * 运行时，只能这样移植。
 *
 * 移植时按现网站（www1.ikanbot.com）重新校对过：
 *   - 原 host v.aikanbot.com 已失效 → www1.ikanbot.com
 *   - 列表 URL 由 /hot/index-{cls}-{tag}-p-{n}.html 改为 p=1 时无 -p- 段
 *   - 搜索由 /search?q= 改为 /search/?q=（旧的会 403）
 *   - 详情 #current_id / #e_token 取签名 token 的逻辑保持不变
 *
 * 用法：放到能被手机访问的地方（例如 GitHub 仓库的 spiders/ 目录），
 * 把 raw 地址填进 index.config.js 的 customSpiders.urls。
 */


const HOST = 'https://www1.ikanbot.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1';

// 线路优先顺序（没列出的排后面）
const LINE_ORDER = [
  'bfzym3u8', '1080zyk', 'kuaikan', 'lzm3u8', 'ffm3u8', 'snm3u8', 'qhm3u8',
  'gsm3u8', 'zuidam3u8', 'bjm3u8', 'wolong', 'xlm3u8', 'yhm3u8',
];
// 直接丢弃的线路（原源 tab_remove）
const LINE_DROP = new Set(['wjm3u8', 'ikm3u8', 'sdm3u8', 'M3U8', 'jinyingm3u8', 'fsm3u8', 'ukm3u8']);

const LINE_NAME = {
  bfzym3u8: '暴风', '1080zyk': '优质', kuaikan: '快看', lzm3u8: '量子', ffm3u8: '非凡',
  haiwaikan: '海外看', gsm3u8: '光速', zuidam3u8: '最大', bjm3u8: '八戒', wolong: '卧龙',
  xlm3u8: '新浪', yhm3u8: '樱花', tkm3u8: '天空', jsm3u8: '极速', wjm3u8: '无尽',
  sdm3u8: '闪电', kcm3u8: '快车', jinyingm3u8: '金鹰', fsm3u8: '飞速', tpm3u8: '淘片',
  lem3u8: '鱼乐', dbm3u8: '百度', tomm3u8: '番茄', ukm3u8: 'U酷', ikm3u8: '爱坤',
  hnzym3u8: '红牛资源', hnm3u8: '红牛', '68zy_m3u8': '68', kdm3u8: '酷点',
  bdxm3u8: '北斗星', qhm3u8: '奇虎', hhm3u8: '豪华',
};

const CLASSES = [
  { type_id: 'movie', type_name: '电影' },
  { type_id: 'tv', type_name: '剧集' },
];

const TAGS = {
  movie: ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本',
    '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈', '豆瓣top250'],
  tv: ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'],
};

// ---------------------------------------------------------------- 请求

function request(url, options = {}) {
  const headers = Object.assign(
    {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: HOST + '/',
    },
    (options && options.headers) || {}
  );
  return reqTextAx(url, { headers, method: (options && options.method) || 'GET', timeout: (options && options.timeout) || 20000 });
}

// ---------------------------------------------------------------- 解析小工具

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function stripTags(s) {
  return decodeEntities(
    String(s || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(u) {
  const s = decodeEntities(String(u || '')).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/')) return HOST + s;
  return s;
}

function firstMatch(text, re) {
  const m = re.exec(text);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------- 列表页

function parseList(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\s+class="item"\s+href="(\/play\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[2];
    if (seen.has(id)) continue;
    const block = m[3];
    const name = stripTags(firstMatch(block, /<p[^>]*>([\s\S]*?)<\/p>/i)) || stripTags(firstMatch(block, /alt="([^"]*)"/i));
    if (!name) continue;
    const pic = absUrl(firstMatch(block, /data-src="([^"]*)"/i) || firstMatch(block, /src="([^"]*)"/i));
    const remark = stripTags(firstMatch(block, /class="[^"]*remark[^"]*"[^>]*>([\s\S]*?)<\//i));
    seen.add(id);
    out.push({
      vod_id: id,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: remark,
      vod_year: '',
      vod_area: '',
    });
  }
  return out;
}

function listUrl(cls, tag, page) {
  const c = cls === 'tv' ? 'tv' : 'movie';
  const t = tag || (c === 'tv' ? '国产剧' : '热门');
  const base = HOST + '/hot/index-' + c + '-' + encodeURIComponent(t);
  return page > 1 ? base + '-p-' + page + '.html' : base + '.html';
}

// 搜索结果页是另一种版式（.media 列表），跟首页 /hot 的 a.item 不一样
function parseSearch(html) {
  const out = [];
  const seen = new Set();
  const parts = String(html || '').split('<div class="media">').slice(1);
  for (const part of parts) {
    const block = part.slice(0, 2000);
    const id = firstMatch(block, /href="(?:https?:\/\/[^"]*)?\/play\/(\d+)"/i);
    if (!id || seen.has(id)) continue;
    const name =
      stripTags(firstMatch(block, /<h5[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)) ||
      decodeEntities(firstMatch(block, /alt="([^"]*)"/i));
    if (!name) continue;
    seen.add(id);
    out.push({
      vod_id: id,
      vod_name: name,
      vod_pic: absUrl(firstMatch(block, /data-src="([^"]*)"/i) || firstMatch(block, /src="([^"]*)"/i)),
      vod_remarks: stripTags(firstMatch(block, /class="[^"]*\blabel\b[^"]*"[^>]*>([\s\S]*?)<\//i)),
      vod_year: '',
      vod_area: '',
    });
  }
  return out;
}

// ---------------------------------------------------------------- 详情页

function getToken(html) {
  const currentId = firstMatch(html, /id="current_id"[^>]*value="([^"]*)"/i);
  let eToken = firstMatch(html, /id="e_token"[^>]*value="([^"]*)"/i);
  if (!currentId || !eToken) return '';
  const sub = currentId.slice(-4);
  let key = '';
  for (let i = 0; i < sub.length; i++) {
    const pos = (parseInt(sub[i], 10) % 3) + 1;
    key += eToken.substring(pos, pos + 8);
    eToken = eToken.substring(pos + 8);
  }
  return key;
}

function parseDetailMeta(html) {
  const name = stripTags(firstMatch(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i));
  const pic = absUrl(
    firstMatch(html, /class="item-root"[\s\S]{0,400}?data-src="([^"]*)"/i) ||
      firstMatch(html, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i)
  );
  const content = stripTags(firstMatch(html, /id="line-tips"[^>]*>([\s\S]*?)<\//i));
  // 站点用 <h2 class="meta title"> / <h3 class="meta"> 排元信息，顺序为
  // 标题, 别名, 年份, 地区, 演员，所以按「年份出现的位置」往后取最稳。
  const metas = [];
  const re = /<(span|h2|h3|h4|div)[^>]*class="[^"]*\bmeta\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) metas.push(stripTags(m[2]));
  let year = '';
  let area = '';
  let actor = '';
  const yearIdx = metas.findIndex((x) => /^(19|20)\d{2}$/.test(x));
  if (yearIdx >= 0) {
    year = metas[yearIdx];
    area = metas[yearIdx + 1] || '';
    actor = metas[yearIdx + 2] || '';
  } else if (metas.length) {
    area = metas[0] || '';
    actor = metas[1] || '';
  }
  return { name, pic, content, year, area, actor };
}

function orderLines(entries) {
  const rank = new Map(LINE_ORDER.map((k, i) => [k, i]));
  const seen = new Set();
  return entries
    .filter((e) => e && e.flag && e.url)
    .map((e) => ({ flag: e.flag, url: String(e.url).replace(/##/g, '#') }))
    .filter((e) => !LINE_DROP.has(e.flag))
    .filter((e) => {
      // 同一个线路可能被多个上游重复提供，只保留第一个
      if (seen.has(e.flag)) return false;
      seen.add(e.flag);
      return true;
    })
    .sort((a, b) => {
      const ai = rank.has(a.flag) ? rank.get(a.flag) : 99;
      const bi = rank.has(b.flag) ? rank.get(b.flag) : 99;
      return ai - bi;
    });
}

async function fetchLines(videoId) {
  const pageUrl = HOST + '/play/' + videoId;
  const html = await request(pageUrl, { headers: { Referer: HOST + '/' } });
  const meta = parseDetailMeta(html);
  const token = getToken(html);
  if (!token) throw new Error('未取到播放签名 token');

  const api =
    HOST + '/api/getResN?videoId=' + encodeURIComponent(videoId) + '&mtype=2&token=' + encodeURIComponent(token);
  const raw = await request(api, {
    headers: { 'User-Agent': MOBILE_UA, Referer: pageUrl, Accept: 'application/json, text/plain, */*' },
  });
  const json = JSON.parse(raw);
  if (!json || json.state !== 1 || !json.data || !Array.isArray(json.data.list)) {
    throw new Error('接口没返回剧集（state=' + (json && json.state) + '）');
  }

  const entries = [];
  for (const item of json.data.list) {
    let arr;
    try {
      arr = JSON.parse(item.resData);
    } catch {
      continue;
    }
    if (Array.isArray(arr)) for (const x of arr) if (x && x.flag) entries.push(x);
  }
  return { meta, lines: orderLines(entries) };
}

function buildVod(meta, lines, videoId) {
  const from = [];
  const urls = [];
  const used = new Set();
  for (const line of lines) {
    let name = LINE_NAME[line.flag] || line.flag;
    let n = 1;
    while (used.has(name)) name = (LINE_NAME[line.flag] || line.flag) + '(' + n++ + ')';
    used.add(name);
    from.push(name);
    urls.push(line.url);
  }
  return {
    vod_id: String(videoId),
    vod_name: meta.name || String(videoId),
    vod_pic: meta.pic || '',
    vod_year: meta.year || '',
    vod_area: meta.area || '',
    vod_actor: meta.actor || '',
    vod_remarks: from.length ? from.length + ' 条线路' : '',
    vod_content: meta.content || '',
    vod_play_from: from.join('$$$'),
    vod_play_url: urls.join('$$$'),
  };
}

// ---------------------------------------------------------------- 插件

export default function createSpider() {
  return {
  meta: {
    key: 'py_aikanbot',
    name: '🤖机器人 - 极速',
    type: 3,
    searchable: 1,
    quickSearch: 1,
    filterable: 1,
  },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));

    fastify.post('/home', async (req) => {
      const wantFilter = !!(req.body && req.body.filter);
      const filters = {};
      if (wantFilter) {
        for (const c of CLASSES) {
          filters[c.type_id] = [
            { key: 'tag', name: '标签', value: TAGS[c.type_id].map((t) => ({ n: t, v: t })) },
          ];
        }
      }
      return { class: CLASSES, filters };
    });

    fastify.post('/category', async (req) => {
      const body = req.body || {};
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      const tag = (body.filters && (body.filters.tag || body.filters['标签'])) || '';
      const html = await request(listUrl(String(body.id || 'movie'), tag, page));
      const list = parseList(html);
      return {
        page,
        pagecount: list.length >= 20 ? page + 1 : page,
        limit: list.length,
        total: list.length ? 9999 : 0,
        list,
      };
    });

    fastify.post('/search', async (req) => {
      const body = req.body || {};
      const wd = String(body.wd || body.keyword || '').trim();
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      if (!wd) return { page, pagecount: page, limit: 0, total: 0, list: [] };
      const url = HOST + '/search/?q=' + encodeURIComponent(wd) + '&p=' + page;
      const html = await request(url, { headers: { Referer: HOST + '/' } });
      const list = parseSearch(html);
      return { page, pagecount: list.length >= 20 ? page + 1 : page, limit: list.length, total: list.length ? 9999 : 0, list };
    });

    fastify.post('/detail', async (req) => {
      const body = req.body || {};
      const ids = Array.isArray(body.id) ? body.id : [body.id];
      const list = [];
      for (const raw of ids) {
        const videoId = String(raw || '').replace(/^.*?\/play\//, '').replace(/[^\d]/g, '');
        if (!videoId) continue;
        try {
          const { meta, lines } = await fetchLines(videoId);
          list.push(buildVod(meta, lines, videoId));
        } catch (e) {
          list.push({
            vod_id: videoId,
            vod_name: '加载失败：' + (e && e.message ? e.message : e),
            vod_play_from: '',
            vod_play_url: '',
          });
        }
      }
      return { list };
    });

    fastify.post('/play', async (req) => {
      const id = String((req.body && req.body.id) || '');
      if (!/^https?:\/\//i.test(id)) return { parse: 1, url: id, jx: '1' };
      return {
        parse: 0,
        url: id,
        header: {
          'User-Agent': UA,
          Referer: HOST + '/',
        },
      };
    });
  },
};
}