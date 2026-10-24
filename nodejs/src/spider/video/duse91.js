import crypto from 'crypto';
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
 * 91毒蛇（www.duse2.com）· CatPaw 迷你引擎模块
 * ---------------------------------------------------------------------------
 * 站点现状（2026-10-21 实测）：
 *   · 全站仍是 cdndefend JS 挑战：无 cookie 返回 HTTP 850，页面里给一个 40 位
 *     十六进制串 c；解出 i 使 SHA1(c+i) 的第 parseInt(c[0],16) 字节为 0xb0、
 *     下一字节为 0x0b，写 cookie cdndefend_js_cookie=c+i。本源用 node:crypto 解。
 *   · 首页 /、分类 /channel/{1电影,2连续剧,3动漫,4综艺纪录,6短剧}.html、
 *     今日更新 /label/new.html；站点**没有翻页**（?page=N 与 -2.html 都是第一页）。
 *   · 列表卡片 a.v-item；标题 .v-item-title 有隐藏水印（可可影视/kekys），要过滤；
 *     封面 data-original 是 /vod1/... 相对路径，主域会 850，改挂图片 CDN。
 *   · 详情 /detail/{id}.html：.detail-title strong 奇偶交替（奇数水印）、
 *     .detail-pic img[data-original]、.detail-desc、a.source-item 线路标签、
 *     div.episode-list 选集块（顺序与线路标签一致）。
 *   · 播放 /play/{id}-{src}-{ep}.html 页面内直接带签名 m3u8，实测免 Referer 可用。
 *   · 搜索 /search?k=关键词&t=令牌；t 是首页表单里的隐藏 input，会变。
 *
 * 2026-10-21 修复：原文件用未定义的 axios 发请求，所有请求都落到 catch，
 * 首页/分类恒为 0 条；改为只用全局 req + 正则解析，不再依赖 cheerio/axios。
 */


const HOST = 'https://www.duse2.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: HOST + '/',
};
// 站点主域的 /vod1/ 对无 cookie 请求也回 850；下面这些图床实测可直接取（206 image/*）。
const PIC_BASES = ['https://vres.xqdhkqt.cn', 'https://103.39.111.180:51050', 'https://103.39.111.184:51050'];

const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '连续剧' },
  { type_id: '3', type_name: '动漫' },
  { type_id: '4', type_name: '综艺纪录' },
  { type_id: '6', type_name: '短剧' },
  { type_id: 'label/new', type_name: '今日更新' },
];

const WATERMARK = /可可|kekys|𝕜|kys/i;

let COOKIE = '';
let COOKIE_TS = 0;
let PIC_IDX = 0;

function str(v) {
  return v == null ? '' : String(v);
}

function bodyOf(request) {
  return (request && request.body) || {};
}

function decodeEntities(s) {
  return str(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(Number(n)); } catch (e) { return ''; }
    });
}

function clean(s) {
  return decodeEntities(str(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function safeName(s) {
  return clean(s).replace(/[#$]/g, ' ').trim();
}

// ---------------------------------------------------------------- 请求 / 挑战
async function reqText(url, opt) {
  const o = opt || {};
  const headers = Object.assign({}, HEADERS, o.headers || {});
  if (COOKIE) headers.Cookie = COOKIE;
  try {
    const r = await httpReq(url, { method: o.method || 'GET', headers, body: o.body, timeout: o.timeout || 20000 });
    const text = str((r && (r.content != null ? r.content : r.text != null ? r.text : r.data)) || '');
    return { status: Number(r && r.status) || 0, text, headers: (r && r.headers) || {} };
  } catch (e) {
    return { status: 0, text: '', error: str((e && e.message) || e) };
  }
}

function sha1Bytes(text) {
  return crypto.createHash('sha1').update(String(text)).digest();
}

function solveChallenge(html) {
  const m = str(html).match(/'([0-9A-Fa-f]{40})'/);
  if (!m) return '';
  const c = m[1];
  const n1 = parseInt(c[0], 16);
  for (let i = 0; i < 3000000; i += 1) {
    const d = sha1Bytes(c + i);
    if (d[n1] === 0xb0 && d[n1 + 1] === 0x0b) {
      const nm = (str(html).match(/'([a-z0-9_]*(?:cookie)[a-z0-9_]*=)'/i) || [])[1] || 'cdndefend_js_cookie=';
      return nm + c + i;
    }
  }
  return '';
}

async function getHtml(url, ref) {
  const headers = ref ? { Referer: ref } : {};
  let r = await reqText(url, { headers });
  if (r.status === 200 && r.text.length > 500) return r.text;
  if (r.status === 850 || /cdndefend|verifying your browser/i.test(r.text)) {
    const ck = solveChallenge(r.text);
    if (ck) {
      COOKIE = ck;
      COOKIE_TS = Date.now();
      r = await reqText(url, { headers });
      if (r.status === 200 && r.text.length > 500) return r.text;
    }
  }
  if (r.status === 200) return r.text;
  console.log('[91毒蛇] 取页失败', url, r.status, r.text.slice(0, 120));
  return '';
}

async function ensureCookie() {
  if (COOKIE && Date.now() - COOKIE_TS < 20 * 60 * 1000) return COOKIE;
  await getHtml(HOST + '/');
  return COOKIE;
}

// ---------------------------------------------------------------- URL / 图片
function fixUrl(u) {
  const s = str(u).trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  return HOST + (s.startsWith('/') ? '' : '/') + s;
}

function picUrl(u) {
  const s = str(u).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  const path = s.startsWith('/') ? s : '/' + s;
  // 已经是 /vod1/...；图床域名不带 /vod1 前缀
  const base = PIC_BASES[PIC_IDX++ % PIC_BASES.length];
  return base + path;
}

function searchToken(html) {
  const s = str(html);
  const m1 = s.match(/name=["']t["'][^>]*value=["']([^"']+)["']/i);
  if (m1) return m1[1];
  const m2 = s.match(/value=["']([^"']+)["'][^>]*name=["']t["']/i);
  if (m2) return m2[1];
  const m3 = s.match(/\/search\?k=[^"'&]{0,60}&(?:amp;)?t=([^"'&]{6,100})/);
  return m3 ? m3[1] : '';
}

// ---------------------------------------------------------------- 列表
function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<a href="\/detail\/(\d+)\.html" class="([^"]*)">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(str(html))) !== null) {
    const id = m[1];
    const cls = m[2] || '';
    if (!/(^|\s)(v-item|search-result-item)(\s|$)/.test(cls)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const block = m[3];
    const names = [];
    for (const x of block.matchAll(/class="(?:v-item-title|title)"[^>]*>([^<]{1,100})</g)) {
      names.push(clean(x[1]));
    }
    const am = block.match(/<img[^>]+(?:alt|title)="([^"]{1,100})"/);
    if (am) names.push(clean(am[1]));
    let name = names.find((n) => n && !WATERMARK.test(n)) || names.find(Boolean) || '';
    if (!name) {
      const tm = block.match(/title="([^"]{1,100})"/);
      if (tm) name = clean(tm[1]);
    }
    let pic = '';
    for (const x of block.matchAll(/(?:data-original|data-src|src)="([^"]+)"/g)) {
      if (x[1] && !/placeholder|logo_placeholder|noneCoverImg/i.test(x[1])) {
        pic = x[1];
        break;
      }
    }
    const remark = (block.match(/class="v-item-bottom"[^>]*>\s*<span>\s*([^<]{0,60})/) || [])[1] || '';
    const score = (block.match(/class="v-item-top-left"[^>]*>\s*<span>\s*([^<]{0,30})/) || [])[1] || '';
    out.push({
      vod_id: id,
      vod_name: safeName(name),
      vod_pic: picUrl(pic),
      vod_remarks: clean(remark) || clean(score),
    });
  }
  return out.filter((x) => x.vod_id && x.vod_name);
}

// ---------------------------------------------------------------- 详情
function detailOf(html, id) {
  const s = str(html);
  const vod = {
    vod_id: str(id),
    vod_name: '',
    vod_pic: '',
    vod_content: '',
    vod_remarks: '',
    vod_play_from: '',
    vod_play_url: '',
  };

  const titleBlock = (s.match(/class="detail-title"[^>]*>([\s\S]{0,800}?)<\/div>/) || [])[1] || '';
  const names = [...titleBlock.matchAll(/<strong[^>]*>([^<]{1,80})<\/strong>/g)].map((x) => clean(x[1]));
  vod.vod_name = names.find((n) => n && !WATERMARK.test(n)) || '';
  if (!vod.vod_name) {
    const tm = s.match(/<title>([^<]{1,100})</);
    if (tm) vod.vod_name = clean(tm[1]).split(/[-_－]/)[0].trim();
  }

  const pm = s.match(/class="detail-pic"[\s\S]{0,1200}?data-original="([^"]+)"/);
  if (pm) vod.vod_pic = picUrl(pm[1]);

  const dm = s.match(/class="detail-desc"[^>]*>([\s\S]{0,6000}?)<\/div>/);
  if (dm) vod.vod_content = clean(dm[1]);

  const labels = [];
  for (const x of s.matchAll(/<a href="#" class="source-item[^"]*">([\s\S]*?)<\/a>/g)) {
    const lm = x[1].match(/class="source-item-label"[^>]*>([^<]{1,30})</);
    labels.push(clean(lm ? lm[1] : ''));
  }

  const blocks = s.split(/<div class="episode-list"/).slice(1);
  const froms = [];
  const urls = [];
  const count = Math.min(labels.length, blocks.length);
  for (let i = 0; i < count; i += 1) {
    const eps = [];
    const seen = new Set();
    for (const e of blocks[i].matchAll(/<a[^>]*href="([^"]*\/play\/[^"]+)"[^>]*class="episode-item"[^>]*>([\s\S]*?)<\/a>/g)) {
      const link = e[1];
      if (!link || seen.has(link)) continue;
      seen.add(link);
      const nm = (e[2].match(/<span[^>]*>([^<]{0,60})<\/span>/) || [])[1] || ('第' + (eps.length + 1) + '集');
      eps.push(safeName(nm) + '$' + link);
    }
    if (!eps.length) {
      for (const e of blocks[i].matchAll(/<a[^>]*href="([^"]*\/play\/[^"]+)"/g)) {
        if (!e[1] || seen.has(e[1])) continue;
        seen.add(e[1]);
        eps.push('第' + (eps.length + 1) + '集$' + e[1]);
      }
    }
    if (!eps.length) continue;
    froms.push(labels[i] || ('线路' + (froms.length + 1)));
    urls.push(eps.join('#'));
  }

  vod.vod_play_from = froms.join('$$$');
  vod.vod_play_url = urls.join('$$$');
  return vod;
}

// ---------------------------------------------------------------- 播放
function noteOf(message) {
  return message ? { note: message } : {};
}

async function probeMedia(url, ref) {
  let cur = str(url);
  for (let hop = 0; hop < 4; hop += 1) {
    const r = await reqText(cur, {
      headers: {
        'User-Agent': UA,
        Referer: ref || HOST + '/',
        Range: 'bytes=0-1024',
      },
      timeout: 15000,
    });
    if (!r.status) return false;
    if (r.status >= 300 && r.status < 400) {
      const loc = str(r.headers.location || r.headers.Location);
      if (!loc) return false;
      try { cur = new URL(loc, cur).href; } catch (e) { return false; }
      continue;
    }
    if (r.status !== 200 && r.status !== 206) return false;
    if (/mpegurl|video|octet-stream|dash|mp2t/i.test(str(r.headers['content-type'] || r.headers['Content-Type']))) return true;
    return /#EXTM3U|<MPD|<video/i.test(r.text.slice(0, 512));
  }
  return false;
}

async function playOf(raw) {
  let id = str(raw).trim();
  if (id.includes('$')) id = id.slice(id.lastIndexOf('$') + 1).trim();
  try { id = decodeURIComponent(id); } catch (e) { /* 保持原样 */ }
  if (!id) return { parse: 1, url: '', ...noteOf('缺少播放地址') };

  // 直接就是媒体直链
  if (/^https?:\/\//i.test(id)) {
    if (/\.(?:m3u8|mp4|flv|mkv)(?:[?#]|$)/i.test(id)) {
      if (await probeMedia(id)) return { parse: 0, url: id, header: { 'User-Agent': UA, Referer: HOST + '/' } };
      return { parse: 1, url: id, ...noteOf('直链探测未通过（非 200/206 或不是媒体内容）') };
    }
    if (!/^https?:\/\/[^/]*duse2\.com\//i.test(id)) {
      // 不是本站播放页，交给壳子嗅探
      return { parse: 1, url: id, ...noteOf('非本站播放页，未确认媒体直链') };
    }
  }

  const page = /^https?:\/\//i.test(id) ? id : HOST + (id.startsWith('/') ? id : '/' + id);
  const html = await getHtml(page, HOST + '/');
  const text = str(html).replace(/\\\//g, '/').replace(/&amp;/g, '&');
  if (!text) return { parse: 1, url: page, ...noteOf('播放页取不到（可能触发 cdndefend 挑战）') };

  const mm = text.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i) ||
    text.match(/["'](\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']/i);
  if (mm) {
    const found = mm[1] || mm[0];
    const u = found.startsWith('//') ? 'https:' + found : found;
    // 播放页里的地址是签名 m3u8，服务端会 302 到最终清单；probeMedia 会跟 3 跳。
    if (await probeMedia(u, page)) {
      return { parse: 0, url: u, header: { 'User-Agent': UA, Referer: HOST + '/' } };
    }
  }
  const mp = text.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i);
  if (mp && await probeMedia(mp[0], page)) {
    return { parse: 0, url: mp[0], header: { 'User-Agent': UA, Referer: HOST + '/' } };
  }
  return { parse: 1, url: page, ...noteOf('播放页未找到可直连的 m3u8/mp4，已返回播放页交给壳子嗅探') };
}

function pageOf(body) {
  return Math.max(1, parseInt(body.page || body.pg, 10) || 1);
}

function idOf(body) {
  const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids || body.vod_id || '';
  const s = str(raw).trim();
  const m = s.match(/\/detail\/(\d+)\.html/);
  if (m) return m[1];
  const m2 = s.match(/^(\d+)$/);
  return m2 ? m2[1] : s;
}

// ---------------------------------------------------------------- 模块入口
export default function createSpider() {
  return {
  meta: { key: 'py_duse91', name: '🐍毒蛇- 极速', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      const html = await getHtml(HOST + '/');
      return { class: CLASSES, filters: {}, list: parseCards(html).slice(0, 80) };
    });

    fastify.post('/category', async (request) => {
      const body = bodyOf(request);
      const tid = str(body.id || body.tid || body.type_id || '1').trim() || '1';
      const page = pageOf(body);
      if (page > 1) {
        return { page, pagecount: 1, limit: 0, total: 0, list: [] };
      }
      const path = tid === 'label/new' ? '/label/new.html' : '/channel/' + tid.replace(/\/.*$/, '') + '.html';
      const html = await getHtml(HOST + path);
      const list = parseCards(html);
      return { page: 1, pagecount: 1, limit: list.length, total: list.length ? 9999 : 0, list };
    });

    fastify.post('/detail', async (request) => {
      const id = idOf(bodyOf(request));
      if (!id) return { list: [] };
      const html = await getHtml(HOST + '/detail/' + id + '.html');
      if (!html) return { list: [] };
      return { list: [detailOf(html, id)] };
    });

    fastify.post('/search', async (request) => {
      const body = bodyOf(request);
      const wd = str(body.wd || body.keyword || body.searchKey || '').trim();
      if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };
      const home = await getHtml(HOST + '/');
      const token = searchToken(home);
      let list = [];
      const urls = [];
      if (token) urls.push(HOST + '/search?k=' + encodeURIComponent(wd) + '&t=' + encodeURIComponent(token));
      urls.push(HOST + '/search?k=' + encodeURIComponent(wd));
      for (const u of urls) {
        const html = await getHtml(u, HOST + '/');
        list = parseCards(html);
        if (list.length) break;
      }
      return { page: 1, pagecount: 1, limit: list.length, total: list.length ? list.length : 0, list };
    });

    fastify.post('/play', async (request) => {
      const body = bodyOf(request);
      const raw = body.id || body.play || body.url || '';
      try {
        return await playOf(raw);
      } catch (e) {
        return { parse: 1, url: str(raw), ...noteOf('播放解析异常: ' + str((e && e.message) || e)) };
      }
    });
  },
};
}
