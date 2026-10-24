'use strict';
import req from '../../util/req.js';
import crypto from 'crypto';
/*
 * 悦听吧（yuetingba）· 有声书 / 评书
 * ---------------------------------------------------------------------------
 * 站点：http://www.yuetingba.cn（HTML 采集，无 JSON 列表接口）
 *   首页 /                     书架 + 排行榜
 *   分类 /book/<tid>/<pg>      10 条/页，共 N 条
 *   搜索 /Search?type=1&name=<wd>&pageIndex=<pg>
 *   详情 /book/detail/<bookId>/<offset>   offset 步长 200，一页 200 集
 *
 * 播放：音频地址不是静链，要走站点自己的加密 Scheme：
 *   1) /api/app/docs-listen/<tingId>/ting-with-efi 拿到 efi + creationTime + bookId + tingNo
 *   2) 详情页里的 var assl / var py：assl 用固定 key/iv AES-128-CBC 解出音频服务器列表
 *      （先去掉页面里的 marker 字符串 xMiP5W1DHBxC5PwQ5oj5QfRn0tsT5UBk）
 *   3) efi 用 (tingId 去横线) 与 creationTime 逐位相加派生 key/iv，AES-256-CBC 解出源路径
 *   4) 按服务器 Name 里的 _p / _b 重写路径，md5(filename|expire|marker) 签名，拼成直链
 *   直链是 mp3（audio/mpeg），/play 直接 parse:0 返回，带 UA/Referer。
 *
 * 只用全局 req + node:crypto，不依赖 cheerio。
 */

const SITE = 'http://www.yuetingba.cn';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const MARKER = 'xMiP5W1DHBxC5PwQ5oj5QfRn0tsT5UBk';
const ASSL_KEY = 'le95G3hnFDJsBE+1/v9eYw==';
const ASSL_IV = 'IvswQFEUdKYf+d1wKpYLTg==';

const CLASSES = [
  { type_id: '1', type_name: '玄幻' },
  { type_id: '4', type_name: '都市' },
  { type_id: '2', type_name: '历史' },
  { type_id: '6', type_name: '名著' },
  { type_id: '7', type_name: '女频' },
  { type_id: '5', type_name: '科幻' },
  { type_id: '3', type_name: '武侠' },
  { type_id: 'a', type_name: '评书' },
  { type_id: '8', type_name: '社科' },
];

const PAGE_SIZE = 10;
const MAX_DETAIL_PAGES = 15; // 15 * 200 = 3000 集，够用且不至于把详情拖死
const RUNTIME_TTL = 30 * 60 * 1000;

const runtimeCache = new Map(); // bookId -> {servers, py, at}

// ------------------------------------------------------------------ 工具

function headers(extra) {
  return Object.assign({ 'User-Agent': UA, Referer: REFERER, 'Accept-Language': 'zh-CN,zh;q=0.9' }, extra || {});
}

async function getText(url, timeout) {
  try {
    const r = await req.get(url, { headers: headers(), timeout: timeout || 15000, responseType: 'text', validateStatus: () => true });
    return { status: r.status || 200, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '') };
  } catch (e) { return { status: 0, text: '' }; }
}

function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function clean(s) {
  return decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function abs(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf('//') === 0) return 'http:' + s;
  return SITE + (s.charAt(0) === '/' ? '' : '/') + s;
}

function pageNo(v) {
  const n = parseInt(v, 10);
  return n > 0 ? n : 1;
}

function listResult(list, page, size, total) {
  const len = list.length;
  const all = Math.max(Number(total) || 0, len);
  return {
    page,
    pagecount: total ? Math.max(page, Math.ceil(all / size)) : page + (len >= size ? 1 : 0),
    limit: size,
    total: total || (len >= size ? page * size + 1 : (page - 1) * size + len),
    list,
  };
}

function playName(name) {
  return String(name || '').replace(/\$/g, '￥').replace(/#/g, '﹟').trim();
}

// ------------------------------------------------------------------ HTML 解析

// 列表卡片：以 section-box-list-item 切块，每块里取 详情链接 / 标题 / 封面 / 作者+主播
function parseBooks(html) {
  const out = [];
  const seen = new Set();
  const parts = String(html || '').split(/section-box-list-item/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const link = /href="([^"]*\/book\/detail\/([^/"']+)\/\d+)"/.exec(block);
    if (!link) continue;
    const id = link[2];
    if (!id || seen.has(id)) continue;
    const titleM = /box-list-item-text-title[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!titleM) continue;
    const name = clean(titleM[1]);
    if (!name) continue;
    const imgM = /<img[^>]+src=['"]([^'"]+)['"]/i.exec(block);
    const remarks = [];
    const spanRe = /<span[^>]+title="([^"]+)"/gi;
    let sm;
    while ((sm = spanRe.exec(block)) && remarks.length < 2) {
      const v = decodeEntities(sm[1]).trim();
      if (v && v !== '作者' && v !== '主播') remarks.push(v);
    }
    seen.add(id);
    out.push({
      vod_id: id,
      vod_name: name,
      vod_pic: imgM ? abs(imgM[1]) : '',
      vod_remarks: remarks.join(' / '),
    });
  }
  return out;
}

function bookIdOf(raw) {
  const s = String(raw || '').trim();
  const m = /\/book\/detail\/([^/"']+)/.exec(s);
  if (m) return m[1];
  const m2 = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(s);
  return m2 ? m2[1] : s.replace(/^.*\//, '');
}

// 每集：<div id="item_<uuid>" class="ting-list-content-item"> ... <a title="0001_xxx" ...>
function parseEpisodes(html) {
  const text = String(html || '');
  const out = [];
  const marks = [];
  const idRe = /<div\s+id="item_([0-9a-f-]{36})"/gi;
  let m;
  while ((m = idRe.exec(text))) marks.push({ id: m[1], index: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].index : Math.min(text.length, marks[i].index + 4000);
    const chunk = text.slice(marks[i].index, end);
    let name = '';
    const titles = [];
    const tRe = /title="([^"]+)"/g;
    let tm;
    while ((tm = tRe.exec(chunk))) titles.push(decodeEntities(tm[1]).trim());
    if (titles.length) name = titles[titles.length - 1];
    out.push({ name: clean(name) || marks[i].id, id: marks[i].id });
  }
  return out;
}

function fieldOf(html, label) {
  const re = new RegExp('text-desc-title[^>]*>\\s*' + label + '\\s*：?\\s*<\\/span>([\\s\\S]*?)<\\/div>');
  const m = re.exec(String(html || ''));
  return m ? clean(m[1]) : '';
}

function detailInfo(html, id) {
  const h = String(html || '');
  const titleM = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
  let name = titleM ? clean(titleM[1]) : '';
  if (!name) {
    const h2 = /book-detail-title[^>]*>([\s\S]*?)<\/h2>/i.exec(h);
    if (h2) name = clean(h2[1]);
  }
  const picM = /books-detail-img[\s\S]{0,300}?<img[^>]+src=["']([^"']+)["']/i.exec(h);
  const descM = /内容简介：<\/h4>[\s\S]*?text-desc-content[^>]*>\s*<p>([\s\S]*?)<\/p>/i.exec(h);
  return {
    vod_id: id,
    vod_name: name,
    vod_pic: picM ? abs(picM[1]) : '',
    type_name: fieldOf(h, '分\\s*类'),
    vod_year: '',
    vod_area: '',
    vod_remarks: [fieldOf(h, '状\\s*态'), fieldOf(h, '集\\s*数')].filter(Boolean).join(' · '),
    vod_actor: fieldOf(h, '演\\s*播'),
    vod_director: fieldOf(h, '作\\s*者'),
    vod_content: descM ? clean(descM[1]) : '',
  };
}

function offsetsOf(html, id) {
  const text = String(html || '');
  const re = new RegExp('/book/detail/' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d+)', 'g');
  const set = new Set();
  let m;
  while ((m = re.exec(text))) set.add(parseInt(m[1], 10) || 0);
  return Array.from(set).sort((a, b) => a - b);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length || 1)).fill(0).map(async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ------------------------------------------------------------------ 音频解析

function aesDecrypt(cipherText, key, iv) {
  const encrypted = Buffer.from(String(cipherText || '').replace(/\s+/g, ''), 'base64');
  if (!encrypted.length) return '';
  const d = crypto.createDecipheriv('aes-' + key.length * 8 + '-cbc', key, iv);
  d.setAutoPadding(false);
  let p = Buffer.concat([d.update(encrypted), d.final()]);
  const pad = p[p.length - 1];
  if (pad >= 1 && pad <= 16) p = p.subarray(0, p.length - pad);
  return p.toString('utf8');
}

function jsVar(html, name) {
  const m = new RegExp('\\b(?:var|let|const)\\s+' + name + '\\s*=\\s*["\']([^"\']*)["\']').exec(String(html || ''));
  return m ? decodeEntities(m[1]) : '';
}

async function bookRuntime(bookId, offset) {
  const hit = runtimeCache.get(bookId);
  if (hit && Date.now() - hit.at < RUNTIME_TTL) return hit;
  const page = await getText(SITE + '/book/detail/' + bookId + '/' + (offset || 0), 20000);
  if (!page.text || (page.status && page.status !== 200)) return hit || null;
  const assl = jsVar(page.text, 'assl').replace(MARKER, '');
  const py = jsVar(page.text, 'py');
  if (!assl) return hit || null;
  const servers = JSON.parse(
    aesDecrypt(assl, Buffer.from(ASSL_KEY, 'base64'), Buffer.from(ASSL_IV, 'base64'))
  );
  const rt = { servers: Array.isArray(servers) ? servers : [], py: py, at: Date.now() };
  runtimeCache.set(bookId, rt);
  return rt;
}

function serverCandidates(servers, bookId) {
  const available = (servers || []).filter((x) => String(x.AsType) === '1' && x.Type === 'A');
  const parts = String(bookId).split('-');
  const group = parts.length > 4 ? parts[4] : '';
  const dedicated = (x) => !!(group && x.BookIds && String(x.BookIds).indexOf(group) >= 0);
  const uniq = new Map();
  for (const s of available) {
    const key = String(s.Name) + '|' + s.Value + '|' + s.Port;
    if (!uniq.has(key)) uniq.set(key, s);
  }
  return Array.from(uniq.values()).sort((a, b) => {
    const da = dedicated(a) ? 1 : 0;
    const db = dedicated(b) ? 1 : 0;
    if (da !== db) return db - da;
    return (parseInt(b.Ratio, 10) || 0) - (parseInt(a.Ratio, 10) || 0);
  });
}

function audioUrlFor(server, rt, bookId, sourcePath, filename) {
  const name = String(server.Name || '');
  let path = sourcePath;
  if (name.indexOf('_p') >= 0) {
    path = '/' + rt.py + '_' + bookId + '/' + filename;
  } else if (name.indexOf('_b') >= 0) {
    path = '/myfiles/host/listen/booksdir/' + rt.py + '_' + bookId + '/' + filename;
  }
  const expires = Math.floor(Date.now() / 1000) + 600;
  const token = crypto.createHash('md5').update(filename + '|' + expires + '|' + MARKER).digest('hex');
  return String(server.Scheme) + '://' + server.Value + ':' + server.Port + path + '?token=' + token + '&expire=' + expires;
}

async function headStatus(url, timeout) {
  try {
    const r = await req.head(url, { headers: headers(), timeout: timeout || 5000, validateStatus: () => true });
    return r.status || 0;
  } catch (e) { return 0; }
}

async function resolveAudio(tingId) {
  const raw = String(tingId || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const api = await getText(SITE + '/api/app/docs-listen/' + encodeURIComponent(raw) + '/ting-with-efi', 20000);
  if (!api.text) return '';
  let d = null;
  try {
    d = JSON.parse(api.text);
  } catch (e) {
    return '';
  }
  if (d && d.data) d = d.data;
  if (!d || !d.id || !d.efi || !d.bookId) return '';
  const bookId = String(d.bookId);
  const tingNo = parseInt(d.tingNo, 10) || 1;
  const offset = Math.floor((tingNo - 1) / 200) * 200;
  const rt = await bookRuntime(bookId, offset);
  if (!rt) return '';

  const plainId = String(d.id).replace(/-/g, '');
  const stamp = String(d.creationTime || '').replace(/[-:T. ]/g, '').padEnd(20, '0');
  const keyBytes = [];
  for (let i = 0; i < plainId.length; i++) {
    keyBytes.push((plainId.charCodeAt(i) + (parseInt(stamp[i % 20], 10) || 0)) & 0xff);
  }
  const ivBytes = [];
  for (let i = 20; i > 4; i--) {
    ivBytes.push((plainId.charCodeAt(i) + (parseInt(stamp[i - 1], 10) || 0)) & 0xff);
  }
  const sourcePath = aesDecrypt(d.efi, Buffer.from(keyBytes), Buffer.from(ivBytes)).trim();
  if (!sourcePath) return '';

  let filename = sourcePath.replace(/\/+$/, '').split('/').pop();
  try {
    filename = decodeURIComponent(filename);
  } catch (e) {
    /* 保持原样 */
  }
  const cands = serverCandidates(rt.servers, bookId);
  if (!cands.length) return '';
  // 上次验证通过的服务器优先；站点给的「专属服务器」不一定真有文件，逐个 HEAD 探活
  const order = cands.slice();
  if (rt.picked && Date.now() - (rt.pickedAt || 0) < 5 * 60 * 1000) {
    const i = order.findIndex(
      (s) => s.Name === rt.picked.Name && s.Value === rt.picked.Value && s.Port === rt.picked.Port
    );
    if (i > 0) order.unshift(order.splice(i, 1)[0]);
  }
  let firstUrl = '';
  let maybeUrl = '';
  for (const server of order) {
    const url = audioUrlFor(server, rt, bookId, sourcePath, filename);
    if (!firstUrl) firstUrl = url;
    const st = await headStatus(url, 5000);
    if (st >= 200 && st < 300) {
      rt.picked = server;
      rt.pickedAt = Date.now();
      return url;
    }
    if ((st === 405 || st === 501) && !maybeUrl) maybeUrl = url;
  }
  return maybeUrl || firstUrl;
}

// ------------------------------------------------------------------ 站点

const __spider = {
  meta: { key: 'py_yueting', name: '🎧悦听 - 听书', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      const r = await getText(SITE + '/', 20000);
      return { class: CLASSES, filters: {}, list: parseBooks(r.text).slice(0, 30) };
    });

    fastify.post('/category', async (request) => {
      const b = request.body || {};
      const tid = String(b.id || b.type_id || b.tid || '1').trim() || '1';
      const page = pageNo(b.page || b.pg);
      const r = await getText(SITE + '/book/' + encodeURIComponent(tid) + '/' + page, 20000);
      const list = parseBooks(r.text);
      const tm = /共\s*(\d+)\s*条/.exec(r.text);
      return listResult(list, page, PAGE_SIZE, tm ? parseInt(tm[1], 10) : 0);
    });

    fastify.post('/search', async (request) => {
      const b = request.body || {};
      const wd = String(b.wd || b.keyword || b.key || '').trim();
      const page = pageNo(b.page || b.pg);
      if (!wd) return { page, pagecount: page, limit: PAGE_SIZE, total: 0, list: [] };
      const url =
        SITE + '/Search?' + 'type=1&name=' + encodeURIComponent(wd) + '&pageIndex=' + page;
      const r = await getText(url, 20000);
      const list = parseBooks(r.text);
      const tm = /共\s*(\d+)\s*条/.exec(r.text);
      return listResult(list, page, PAGE_SIZE, tm ? parseInt(tm[1], 10) : 0);
    });

    fastify.post('/detail', async (request) => {
      const b = request.body || {};
      const raw = Array.isArray(b.id) ? b.id[0] : b.ids || b.id;
      const bookId = bookIdOf(raw);
      if (!bookId) return { list: [] };
      const first = await getText(SITE + '/book/detail/' + encodeURIComponent(bookId) + '/0', 25000);
      if (!first.text || (first.status && first.status !== 200)) return { list: [] };
      const vod = detailInfo(first.text, bookId);
      const episodes = parseEpisodes(first.text);
      const seen = new Set(episodes.map((e) => e.id));
      let offsets = offsetsOf(first.text, bookId).filter((o) => o > 0).slice(0, MAX_DETAIL_PAGES - 1);
      if (offsets.length) {
        const pages = await mapLimit(offsets, 4, (off) =>
          getText(SITE + '/book/detail/' + encodeURIComponent(bookId) + '/' + off, 25000)
        );
        for (const p of pages) {
          for (const ep of parseEpisodes(p.text)) {
            if (!seen.has(ep.id)) {
              seen.add(ep.id);
              episodes.push(ep);
            }
          }
        }
      }
      if (!vod.vod_name && !episodes.length) return { list: [] };
      if (!vod.vod_name) vod.vod_name = bookId;
      vod.vod_play_from = '悦听吧';
      vod.vod_play_url = episodes.map((e) => playName(e.name) + '$' + e.id).join('#');
      return { list: [vod] };
    });

    fastify.post('/play', async (request) => {
      const b = request.body || {};
      const raw = String(b.id || b.play || b.url || '').trim();
      if (!raw) return { parse: 1, url: '' };
      if (/\.(?:mp3|m4a|aac|flac|wav)(?:[?#]|$)/i.test(raw)) {
        return { parse: 0, url: raw, header: headers() };
      }
      try {
        const url = await resolveAudio(raw);
        if (url) return { parse: 0, url, header: headers() };
      } catch (e) {
        /* 落到网页地址 */
      }
      const fallback = /^https?:\/\//i.test(raw)
        ? raw
        : /^[0-9a-f-]{36}$/i.test(raw)
          ? SITE + '/book/ting/' + encodeURIComponent(raw)
          : SITE + '/';
      return { parse: 1, url: fallback, header: headers() };
    });
  },
};

export default function createSpider() { return __spider; }
