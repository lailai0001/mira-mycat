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

/* 臻品视频（zhenpin）· 按 drpy 规则重写：zpcxb.com stui 模板 + player_aaaa + jx */

const HOST = 'https://www.zpcxb.com';
const UA = 'Mozilla/5.0 (Linux; Android 12; NOH-AN01) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36';
const MEDIA_RE = /\.(?:m3u8|mp4|flv|mkv|ts)(?:[?#]|$)/i;
const CATS = [
  { type_id: 'dianying', type_name: '电影' },
  { type_id: 'gcj', type_name: '电视剧' },
  { type_id: 'zongyi', type_name: '综艺' },
  { type_id: 'dongmna', type_name: '动漫' },
  { type_id: 'jilupian', type_name: '纪录片' },
];

function hdr(extra) {
  return Object.assign({ 'User-Agent': UA, Referer: HOST + '/' }, extra || {});
}
async function get(url, opt) {
  try {
    const r = await httpReq(url, Object.assign({ headers: hdr(), timeout: 15000 }, opt || {}));
    return r.status >= 400 ? '' : r.text;
  } catch (e) { return ''; }
}
function abs(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return HOST + (s.charAt(0) === '/' ? '' : '/') + s;
}
function dec(s) {
  try {
    const u = String(s).replace(/%u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return decodeURIComponent(u);
  } catch (e) {
    try { return unescape(s); } catch (e2) { return String(s); }
  }
}
function b64(s) {
  try {
    return typeof base64Decode === 'function' ? base64Decode(s) : Buffer.from(s, 'base64').toString('utf8');
  } catch (e) {
    return '';
  }
}

function parseList(html) {
  const out = [];
  const parts = String(html || '').split('stui-vodlist__box');
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].split('stui-vodlist__box')[0].slice(0, 4000);
    const href = (p.match(/href="([^"]+)"/) || [])[1] || '';
    const title = (p.match(/title="([^"]+)"/) || [])[1] || '';
    const pic = (p.match(/data-original="([^"]+)"/) || [])[1] || '';
    const rem = (p.match(/class="pic-text[^"]*"[^>]*>([^<]*)</) || [])[1] || '';
    if (href && title) out.push({ vod_id: abs(href), vod_name: title.trim(), vod_pic: abs(pic), vod_remarks: rem.trim() });
  }
  return out;
}

function parseDetail(html, pageUrl) {
  const t = String(html || '');
  const vod = {
    vod_id: pageUrl,
    vod_name: (t.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '',
    vod_pic: abs((t.match(/data-original="([^"]+)"/) || [])[1] || ''),
    vod_content: '',
  };
  vod.vod_name = vod.vod_name.replace(/<[^>]*>/g, '').trim();
  const content = t.match(/<div class="stui-content__desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (content) vod.vod_content = content[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const arts = [];
  const reArt = /<div class="stui-pannel__head[^"]*"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = reArt.exec(t))) arts.push(m[1].replace(/<[^>]*>/g, '').trim());

  const froms = [];
  const urls = [];
  const reList = /<ul class="stui-content__playlist[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
  let idx = 0;
  while ((m = reList.exec(t))) {
    const items = [];
    const reA = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = reA.exec(m[1]))) {
      const name = a[2].replace(/<[^>]*>/g, '').trim();
      if (name && a[1]) items.push(name + '$' + abs(a[1]));
    }
    if (items.length) {
      froms.push(arts[idx] || '线路' + (idx + 1));
      urls.push(items.join('#'));
    }
    idx++;
  }
  if (froms.length) {
    vod.vod_play_from = froms.join('$$$');
    vod.vod_play_url = urls.join('$$$');
  }
  return vod;
}

async function resolvePlay(pageUrl) {
  const html = await get(pageUrl);
  const m = html.match(/player_\w+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/) || html.match(/player_\w+\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return '';
  let player = {};
  try {
    player = JSON.parse(m[1]);
  } catch (e) {
    const u = m[1].match(/url\s*:\s*['"]([^'"]*)['"]/);
    const f = m[1].match(/from\s*:\s*['"]([^'"]*)['"]/);
    const en = m[1].match(/encrypt\s*:\s*['"]?(\d+)['"]?/);
    player = { url: (u && u[1]) || '', from: (f && f[1]) || '', encrypt: (en && en[1]) || '2' };
  }
  let url = String(player.url || '');
  if (!url) return '';
  const enc = String(player.encrypt || '2');
  if (enc === '1') url = dec(url);
  else if (enc === '2') url = dec(b64(url));
  else if (enc === '3') url = b64(url);
  const from = String(player.from || '');
  // NOTE(D批): alizy/mgtv/qq/qiyi/sohu/youku/leduo 的第三方解析分支已剥离；
  // 解码后若非直链，play 侧回落 parse:1 到站方详情页。
  return url;
}

export default function createSpider() {
  return {
  meta: { key: 'py_zhenpin_video', name: '💎臻品 - 极速', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
  api: async (fastify) => {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => {
      const html = await get(HOST + '/zptop/dianying/page/1.html');
      return { class: CATS, filters: {}, list: parseList(html) };
    });
    fastify.post('/category', async (request) => {
      const b = request.body || {};
      const tid = String(b.id || b.type_id || 'dianying');
      const page = Math.max(1, parseInt(b.page, 10) || 1);
      const area = (b.filters && b.filters.area) || (b.extend && b.extend.area) || '';
      const path = area || tid;
      const html = await get(HOST + '/zptop/' + encodeURIComponent(path) + '/page/' + page + '.html');
      const list = parseList(html);
      return { page, pagecount: list.length >= 20 ? page + 1 : page, limit: 30, total: list.length ? 9999 : 0, list };
    });
    fastify.post('/search', async (request) => {
      const b = request.body || {};
      const wd = String(b.wd || b.keyword || '').trim();
      const page = Math.max(1, parseInt(b.page, 10) || 1);
      if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
      const html = await get(HOST + '/sosou/page/' + page + '.html?wd=' + encodeURIComponent(wd));
      const list = parseList(html);
      return { page, pagecount: page, limit: 20, total: list.length, list };
    });
    fastify.post('/detail', async (request) => {
      const b = request.body || {};
      const raw = Array.isArray(b.id) ? b.id[0] : b.id || b.ids;
      const id = abs(String(raw || '').split('@')[0]);
      if (!id) return { list: [] };
      const html = await get(id);
      if (!html) return { list: [] };
      return { list: [parseDetail(html, id)] };
    });
    fastify.post('/play', async (request) => {
      const b = request.body || {};
      const raw = String(b.id || b.play || '').split('@')[0];
      if (!raw) return { parse: 1, url: '' };
      if (MEDIA_RE.test(raw)) return { parse: 0, url: raw, header: hdr() };
      const url = abs(raw);
      const real = await resolvePlay(url);
      if (real && MEDIA_RE.test(real)) return { parse: 0, url: real, header: hdr() };
      return { parse: 1, url, header: hdr() };
    });
  },
};
}
