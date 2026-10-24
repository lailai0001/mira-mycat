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

// 动漫巴士 · dm84.tv —— CatPaw 模块
// 站点为 maccms 风格静态 HTML：首页/分类/搜索/详情均可正则解析；
// 播放页 -> iframe(hhplayer) -> __HHJX_BOOTSTRAP__ -> /api/parse -> m3u8。
const HOST = 'https://dm84.tv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE_HEADERS = { 'User-Agent': UA, Referer: HOST + '/' };
const CLASSES = [
  { type_id: '1', type_name: '国漫' },
  { type_id: '2', type_name: '日漫' },
  { type_id: '3', type_name: '欧美动漫' },
  { type_id: '4', type_name: '电影' },
];

const clean = (s) =>
  String(s == null ? '' : s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
const attr = (tag, name) => {
  const m = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(tag || '');
  return m ? m[1].replace(/&amp;/g, '&') : '';
};
const abs = (u) => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/')) return HOST + s;
  return s;
};
const pageOf = (b) => Math.max(1, parseInt(b && (b.page || b.pg), 10) || 1);
const detailId = (v) => {
  const s = String(v == null ? '' : v);
  const m = /\/(\d+)\.html/.exec(s) || /(\d+)/.exec(s);
  return m ? m[1] : '';
};

async function get(url, opt = {}) {
  const res = await httpReq(url, {
    method: opt.method || 'GET',
    headers: { ...BASE_HEADERS, ...(opt.headers || {}) },
    body: opt.body,
    timeout: opt.timeout || 20000,
  });
  const status = res && res.status;
  if (status && status >= 400) throw new Error('HTTP ' + status + ' ' + url);
  return String(res && res.content != null ? res.content : res);
}

function parseList(html) {
  const out = [];
  const seen = new Set();
  const block = /<div class="item">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = block.exec(html))) {
    const s = m[1];
    const titleTag = /<a([^>]*\bclass="title"[^>]*)>([\s\S]*?)<\/a>/.exec(s);
    if (!titleTag) continue;
    const href = attr(titleTag[1], 'href');
    const vid = detailId(href);
    if (!vid || seen.has(vid)) continue;
    const name = clean(titleTag[2]) || clean(attr(titleTag[1], 'title'));
    if (!name) continue;
    seen.add(vid);

    let pic = '';
    const coverTag = /<a([^>]*\bclass="cover[^"]*"[^>]*)>/.exec(s);
    if (coverTag) pic = attr(coverTag[1], 'data-bg') || attr(coverTag[1], 'src');
    if (!pic || pic === '/') {
      const img = /<img[^>]*\bsrc="([^"]+)"/i.exec(s);
      if (img) pic = img[1];
    }
    const desc = /<span class="desc">([\s\S]*?)<\/span>/.exec(s);
    out.push({
      vod_id: vid,
      vod_name: name,
      vod_pic: abs(pic),
      vod_remarks: clean(desc ? desc[1] : ''),
    });
  }
  return out;
}

const listResult = (list, page, size = 20, last = 0) => ({
  list,
  page,
  pagecount: last || page + (list.length >= size ? 1 : 0),
  limit: size,
  total: last ? last * size : list.length >= size ? 9999 : list.length,
});

// 分类/搜索页底部“尾页”链接给出真实总页数（如 /list-1-10.html -> 10）。
function lastPage(html) {
  const block = /<div class="card pages[^"]*">([\s\S]*?)<\/div>/.exec(html);
  if (!block) return 0;
  const tail = /(\d+)\.html"[^>]*>\s*尾页/.exec(block[1]);
  return tail ? parseInt(tail[1], 10) || 0 : 0;
}

async function home() {
  let list = [];
  try {
    list = parseList(await get(HOST + '/'));
  } catch (e) {
    /* 首页失败再用分类兜底 */
  }
  if (!list.length) {
    try {
      list = parseList(await get(HOST + '/list-1-1.html'));
    } catch (e) {
      /* 留空 */
    }
  }
  return { class: CLASSES, filters: {}, list };
}

async function category(b) {
  const tid = String(b.id || b.tid || b.type_id || '1').replace(/\D/g, '') || '1';
  const page = pageOf(b);
  const html = await get(HOST + '/list-' + tid + '-' + page + '.html');
  return listResult(parseList(html), page, 20, lastPage(html));
}

async function search(b) {
  const wd = String(b.wd || b.keyword || b.k || '').trim();
  const page = pageOf(b);
  if (!wd) return { list: [], page, pagecount: page, limit: 20, total: 0 };
  const html = await get(HOST + '/s-' + encodeURIComponent(wd) + '---------' + page + '.html');
  return listResult(parseList(html), page, 20, lastPage(html));
}

function parseDetail(html, vid) {
  const titleTag = /<h1 class="v_title">([\s\S]*?)<\/h1>/.exec(html);
  const name = clean(titleTag ? titleTag[1] : '');
  const img = /<div class="cover">\s*<img[^>]*\bsrc="([^"]+)"/i.exec(html);
  const descBlock = /<p class="v_desc">([\s\S]*?)<\/p>/.exec(html);
  const descText = descBlock ? descBlock[1] : '';
  const remarks = clean((/<span class="desc">([\s\S]*?)<\/span>/.exec(descText) || [])[1] || '');
  const ems = [];
  const emRe = /<em[^>]*>[^<]*<\/em>([\s\S]*?)(?=<em|$)/g;
  let em;
  while ((em = emRe.exec(descText))) ems.push(clean(em[1]));
  const year = (ems[0] || '').match(/\d{4}/) ? ems[0].match(/\d{4}/)[0] : '';
  const area = ems[1] || '';

  const introStart = html.search(/<div[^>]*id="intro"[^>]*>/i);
  let content = '';
  if (introStart >= 0) {
    const tail = html.slice(introStart);
    const end = tail.search(/<div class="card/i);
    content = clean(tail.slice(0, end > 0 ? end : 20000));
  }

  const tabs = [];
  const tabsBlock = /<ul class="tab_control play_from">([\s\S]*?)<\/ul>/.exec(html);
  if (tabsBlock) {
    const li = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let t;
    while ((t = li.exec(tabsBlock[1]))) tabs.push(clean(t[1]));
  }

  const lines = [];
  const panel = /<ul class="play_list[^"]*">([\s\S]*?)<\/ul>/g;
  let p;
  while ((p = panel.exec(html))) {
    const eps = [];
    const a = /<a[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let e;
    while ((e = a.exec(p[1]))) {
      const href = attr(e[0], 'href');
      if (!href || /^javascript:/i.test(href)) continue;
      const u = abs(href);
      const n = clean(e[2]);
      if (u) eps.push((n || '播放') + '$' + u);
    }
    if (eps.length) lines.push(eps.join('#'));
  }
  if (!name || !lines.length) return null;

  return {
    vod_id: vid,
    vod_name: name,
    vod_pic: abs(img ? img[1] : ''),
    vod_remarks: remarks,
    vod_year: year,
    vod_area: area,
    vod_content: content,
    vod_play_from: lines.map((x, i) => tabs[i] || '线路' + (i + 1)).join('$$$'),
    vod_play_url: lines.join('$$$'),
  };
}

async function detail(b) {
  const vid = detailId(b.id || b.ids || b.url || '');
  if (!vid) return [];
  const html = await get(HOST + '/v/' + vid + '.html');
  const one = parseDetail(html, vid);
  return one ? [one] : [];
}

async function youkuLine(vid) {
  const utid = Math.random().toString(36).slice(2);
  const cb = 'jsonp_' + utid;
  const qs =
    'vid=' + encodeURIComponent(vid) +
    '&ccode=0564&client_ip=192.168.1.1&utid=' + utid +
    '&client_ts=' + Math.floor(Date.now() / 1000) + '&callback=' + cb;
  const raw = await get('https://ups.youku.com/ups/get.json?' + qs, {
    headers: { 'User-Agent': UA, Referer: 'https://hhjx.hhplayer.com/' },
  });
  let data;
  try {
    data = JSON.parse(String(raw).replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, ''));
  } catch (e) {
    return '';
  }
  if (!data || !data.data || data.data.error) return '';
  const streams = (data.data.stream || []).filter((s) => s && s.m3u8_url);
  if (!streams.length) return '';
  streams.sort(
    (a, b) =>
      Number(b.width || 0) * Number(b.height || 0) - Number(a.width || 0) * Number(a.height || 0) ||
      Number(b.size || 0) - Number(a.size || 0)
  );
  return String(streams[0].m3u8_url).replace(/^http:\/\//i, 'https://');
}

async function play(b) {
  const id = String(b.id || b.url || b.ids || '');
  const playUrl = abs(id);
  if (!playUrl || !/^https?:/i.test(playUrl)) return { parse: 1, url: playUrl };
  if (/\.(m3u8|mp4)(\?|$)/i.test(playUrl)) return { parse: 0, url: playUrl, header: { 'User-Agent': UA } };
  try {
    const html = await get(playUrl, { headers: { Referer: HOST + '/' } });
    const iframeMatch = /<iframe[^>]+src=["']([^"']+)["']/i.exec(html);
    if (!iframeMatch) return { parse: 1, url: playUrl };
    const iframe = abs(iframeMatch[1]);

    const playerHtml = await get(iframe, { headers: { Referer: playUrl } });
    const bootMatch = /__HHJX_BOOTSTRAP__\s*=\s*(\{[\s\S]*?\})\s*;/.exec(playerHtml);
    if (!bootMatch) return { parse: 1, url: iframe };
    let boot;
    try {
      boot = JSON.parse(bootMatch[1]);
    } catch (e) {
      return { parse: 1, url: iframe };
    }

    const origin = (/^https?:\/\/[^/]+/.exec(iframe) || [])[0];
    if (!origin) return { parse: 1, url: iframe };
    const body = JSON.stringify({ url: boot.url, t: boot.t, key: boot.key, client_fallback: false });
    const raw = await get(origin + '/api/parse', {
      method: 'POST',
      headers: { Referer: iframe, Origin: origin, 'Content-Type': 'application/json' },
      body,
    });
    let resp;
    try {
      resp = JSON.parse(raw);
    } catch (e) {
      return { parse: 1, url: iframe };
    }
    if (!resp || resp.code !== 200 || !resp.url) return { parse: 1, url: iframe };

    const target = String(resp.url);
    if (/^https?:\/\//i.test(target)) {
      return { parse: 0, url: target.replace(/^http:\/\//i, 'https://'), header: { 'User-Agent': UA } };
    }
    const youku = await youkuLine(target);
    if (youku) return { parse: 0, url: youku, header: { 'User-Agent': UA } };
    return { parse: 1, url: iframe };
  } catch (e) {
    return { parse: 1, url: playUrl };
  }
}

export default function createSpider() {
  return {
  meta: { key: 'py_dongman_bashi', name: '🚌动漫 - 巴士', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
  api: async (fastify) => {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => home());
    fastify.post('/category', async (request) => category(request.body || {}));
    fastify.post('/search', async (request) => search(request.body || {}));
    fastify.post('/detail', async (request) => ({ list: await detail(request.body || {}) }));
    fastify.post('/play', async (request) => play(request.body || {}));
  },
};
}
