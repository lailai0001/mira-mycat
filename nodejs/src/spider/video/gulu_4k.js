import req from '../../util/req.js';
import crypto from 'crypto';
import zlib from 'zlib';
"use strict";
// 咕噜4K —— 本地 Node 版（无需 jar / 无需 Python）
//
// 协议（1:1 复刻 gkd007.jar 里的 Gulu$GuluCrypto）：
//   1) 握手：secp256r1 ECDH + AES-256-CBC（X-Handshake-Key 是 16 字节随机数的 32 位 hex，
//      同时当作 32 字节 ASCII 密钥）+ zlib 包装的 protobuf；会话密钥由 HMAC-SHA256 两级派生。
//   2) 业务：protobuf -> raw deflate -> AES-256-GCM(12B nonce) -> POST /app/bn/v2。
//   3) 接口：boot(1/0) / 搜索(3/61) / 详情(3/62) / 列表(3/66)。
//   播放：伪直链前缀 -> 解析接口 -> 取真实地址；直链（m3u8/mp4）直接 parse=0。
//
// 会话缓存在模块级变量（3 小时），进程内复用，不落盘。

const ENDPOINT = 'http://103.45.132.22:19987/app/bn/v2';
const UA = 'Dalvik/2.1.0 (Linux; U; Android 11; Pixel 4)';
const SESSION_TTL = 3 * 3600 * 1000;
const HANDSHAKE_VERSION = '1.0.0';

// jar 里的 f：线路 code -> 中文名
const GROUP_NAME = {
  dyttm3u8: '电影天堂', bfzym3u8: '暴风资源', lzm3u8: '量子资源', ffm3u8: '非凡资源',
  qq: '腾讯视频', qiyi: '爱奇艺', youku: '优酷', newxfyun: '咕噜4K', xfyun: '咕噜4K二线',
  CO4K: '咖啡4K超清', jplink: '金牌极速', rose: '玫瑰4K', NBY: '蚂蚁资源',
  qsvip: '旋风VIP', qingshan: '青山资源',
};

// jar 里的 d：伪直链前缀 -> 采集源名
const PREFIX2SRC = {
  'CO4K_': '咖啡4K', rose_: '咖啡4K',
  'NBY-': '蚂蚁', 'qsvip-': '熊出没', 'qingshan-': '熊出没',
  'JP-': '旋风金牌', 'xfy-': '新咕噜4K',
};

// jar 里的 e：采集源名 -> 解析接口
const SRC2PARSE = {
  '咖啡4K': 'https://co4k.1ljx.com:32010/api/?key=6db7285d-c228-4cee-918e-67a01ef7c3f8&url=',
  '蚂蚁': 'https://api.nbyjson.top:7788/api/?key=8LJohkjTZHC2F9ct48&url=',
  '熊出没': 'https://jf.hxx2023.cc/api?key=Uw5rZokFSAywqcLN&url=',
  '旋风金牌': 'http://111.170.58.215:4470/api.php?id=',
  '咕噜金牌': 'http://111.170.58.215:4470/api.php?id=',
  '新咕噜4K': 'http://172.247.189.48:7788/dsxt/api.php?user=xt&key=969632c8da19b3ef8c56e5b51011d5e0&j=19227eae77225a30&url=',
  '咕噜4K': 'http://172.247.189.48:7788/dsxt/api.php?user=xt&key=e1234a9df0358c6d78f20721a1b7b055&j=b8582063bca37121&url=',
};

const CATEGORIES = [
  { type_id: '8', type_name: '电影' },
  { type_id: '9', type_name: '电视剧' },
  { type_id: '10', type_name: '综艺' },
  { type_id: '11', type_name: '动漫' },
  { type_id: '12', type_name: '短剧' },
  { type_id: '6', type_name: '纪录片' },
];

// ==================== 小工具 ====================
const buf = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(String(x == null ? '' : x), 'utf8'));
const u8 = (x) => buf(x).toString('utf8');
const isMedia = (u) => /\.m3u8|\.mp4/i.test(String(u || ''));
const pageOf = (b) => {
  const raw = b && (b.pg != null ? b.pg : b.page != null ? b.page : b.pageNum);
  const n = Math.floor(Number(raw || 1));
  return Number.isFinite(n) && n > 0 ? n : 1;
};
const idOf = (b) => {
  if (b == null) return '';
  const raw = b.id != null ? b.id : b.ids != null ? b.ids : b.vod_id != null ? b.vod_id : b.url;
  return String(Array.isArray(raw) ? (raw[0] == null ? '' : raw[0]) : raw == null ? '' : raw).trim();
};
const argOf = (b, keys, dflt) => {
  for (const k of keys) {
    const v = b && b[k];
    if (v != null && String(v) !== '') return String(Array.isArray(v) ? v[0] : v);
  }
  return dflt;
};

// ==================== protobuf ====================
function wv(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}

class PB {
  constructor() { this.parts = []; }
  var(f, n) { this.parts.push(wv((f << 3) >>> 0), wv(n)); return this; }
  byt(f, v) {
    const d = v == null ? Buffer.alloc(0) : buf(v);
    this.parts.push(wv(((f << 3) | 2) >>> 0), wv(d.length), d);
    return this;
  }
  s(f, v) { return this.byt(f, Buffer.from(String(v == null ? '' : v), 'utf8')); }
  out() { return Buffer.concat(this.parts); }
}

// 按字段顺序解出 {f, w, v}；w=0 时 v 是数字，其余是 Buffer
function pbDecode(data) {
  const d = data || Buffer.alloc(0);
  const out = [];
  let i = 0;
  const n = d.length;
  const readVar = () => {
    let v = 0, sh = 0, b;
    do {
      if (i >= n) throw new Error('pb varint truncated');
      b = d[i++];
      v += (b & 0x7f) * Math.pow(2, sh);
      sh += 7;
      if (sh > 70) throw new Error('pb varint too long');
    } while (b & 0x80);
    return v;
  };
  while (i < n) {
    const tag = readVar();
    const f = Math.floor(tag / 8), w = tag % 8;
    if (w === 0) {
      out.push({ f, w, v: readVar() });
    } else if (w === 2) {
      const ln = readVar();
      if (ln < 0 || i + ln > n) throw new Error('pb length overflow');
      out.push({ f, w, v: d.subarray(i, i + ln) });
      i += ln;
    } else if (w === 5) {
      out.push({ f, w, v: d.subarray(i, i + 4) });
      i += 4;
    } else if (w === 1) {
      out.push({ f, w, v: d.subarray(i, i + 8) });
      i += 8;
    } else {
      throw new Error('pb wire ' + w);
    }
  }
  return out;
}

const safePb = (d) => { try { return pbDecode(d); } catch (e) { return []; } };

function pbf(data, num, wt = 2) {
  for (const x of pbDecode(data)) {
    if (x.f === num && x.w === wt) return x.v;
  }
  return null;
}

const ps = (data, num) => {
  const v = pbf(data, num, 2);
  return v == null ? '' : u8(v);
};

// ==================== 压缩 ====================
const pkcs7Pad = (b, size) => {
  const n = size - (b.length % size || size) || size;
  return Buffer.concat([b, Buffer.alloc(n, n)]);
};

// 服务端握手响应没做 PKCS#7 填充（实测），但也兼容带填充的情况
function inflateTolerant(b, raw) {
  const fn = raw ? zlib.inflateRawSync : zlib.inflateSync;
  try {
    return fn(b);
  } catch (e) {
    const pad = b.length ? b[b.length - 1] : 0;
    if (pad >= 1 && pad <= 16 && pad <= b.length) {
      try { return fn(b.subarray(0, b.length - pad)); } catch (e2) { /* 落回原错误 */ }
    }
    throw e;
  }
}

// ==================== 网络 ====================
async function request(url, opt = {}) {
  const method0 = (opt.method || 'GET').toUpperCase();
  const body = opt.body == null ? undefined : opt.body;
  const method = (body && method0 === 'GET') ? 'POST' : method0;
  const headers = Object.assign({}, opt.headers || {});
  const timeout = opt.timeout || 30000;
  try {
    const r = await req({ method, url, headers, data: body, timeout, responseType: 'arraybuffer', maxRedirects: 5, validateStatus: () => true });
    return { status: r.status, headers: r.headers || {}, body: Buffer.from(r.data || []) };
  } catch (e) {
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const tt = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body, signal: ctl.signal, redirect: 'follow' });
        const buf = Buffer.from(await r.arrayBuffer());
        const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
        return { status: r.status, headers: h, body: buf };
      } finally { clearTimeout(tt); }
    }
    throw e;
  }
}

const post = (url, body, headers) => request(url, { method: 'POST', headers, body });

// ==================== 握手 + 会话 ====================
let SESSION = null;
let HANDSHAKING = null;

function dumpResponse(tag, resp) {
  try {
    console.error('[咕噜4K] ' + tag + ' 服务端状态: ' + resp.status + ' ctype=' + (resp.headers && resp.headers['content-type']));
    console.error('[咕噜4K] 原始响应(base64): ' + resp.body.toString('base64'));
    console.error('[咕噜4K] 原始响应(text): ' + resp.body.toString('utf8').slice(0, 500));
  } catch (e) { /* 忽略 */ }
}

async function handshake() {
  // Node 里这条曲线叫 prime256v1（等价 secp256r1）
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const pub = ecdh.getPublicKey(null, 'uncompressed'); // 65 字节 04||X||Y
  const inner = new PB().var(1, 1).var(2, 1).var(3, 1).out();
  const body = new PB().byt(1, pub).s(2, HANDSHAKE_VERSION).byt(3, inner).out();

  // 注意：必须是 16 字节随机数的 32 位 hex；服务端按 32 字节 ASCII 当 AES-256 密钥，
  // 16 位 hex 会直接 400 invalid handshake key。
  const hk = crypto.randomBytes(16).toString('hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(hk, 'utf8'), iv);
  const ct = Buffer.concat([cipher.update(pkcs7Pad(zlib.deflateSync(body, { level: 5 }), 16)), cipher.final()]);
  const payload = Buffer.from(Buffer.concat([iv, ct]).toString('base64'), 'utf8');

  const resp = await post(ENDPOINT, payload, {
    'Content-Type': 'text/plain',
    'User-Agent': UA,
    'X-Player-Page-Protection': '1',
    'X-Handshake-Key': hk,
  });
  if (resp.status !== 200) {
    dumpResponse('握手', resp);
    throw new Error('握手失败 HTTP ' + resp.status + ' ' + resp.body.toString('utf8').slice(0, 100));
  }

  let session = '';
  let spub = null;
  try {
    const raw = Buffer.from(resp.body.toString('utf8').trim(), 'base64');
    if (raw.length < 32 || (raw.length - 16) % 16 !== 0) throw new Error('响应长度异常 ' + raw.length);
    const dec = crypto.createDecipheriv('aes-256-cbc', Buffer.from(hk, 'utf8'), raw.subarray(0, 16));
    const plain = Buffer.concat([dec.update(raw.subarray(16)), dec.final()]);
    const data = inflateTolerant(plain, false);
    session = ps(data, 1);
    spub = pbf(data, 2, 2);
  } catch (e) {
    dumpResponse('握手解密', resp);
    throw new Error('握手响应解析失败: ' + e.message);
  }
  if (!session || !spub || spub.length !== 65 || spub[0] !== 4) {
    dumpResponse('握手字段', resp);
    throw new Error('握手失败：session/spub 无效');
  }

  const shared = ecdh.computeSecret(spub);
  const mac1 = crypto.createHmac('sha256', Buffer.from(session, 'utf8')).update(shared).digest();
  const key = crypto.createHmac('sha256', mac1).update(Buffer.from('v2-session\x01', 'utf8')).digest().subarray(0, 32);

  return {
    session,
    key,
    d: crypto.randomBytes(16).toString('hex'),
    expires: Date.now() + SESSION_TTL,
  };
}

async function ensure() {
  if (SESSION && SESSION.expires > Date.now()) return SESSION;
  if (!HANDSHAKING) {
    HANDSHAKING = handshake()
      .then((s) => { SESSION = s; return s; })
      .finally(() => { HANDSHAKING = null; });
  }
  return HANDSHAKING;
}

async function callOnce(s, api, action, body) {
  const ts = Date.now();
  const inner = new PB()
    .var(1, ts)
    .var(2, api)
    .var(3, action)
    .s(4, s.d)
    .byt(5, Buffer.alloc(0))
    .byt(6, body || Buffer.alloc(0))
    .var(7, ts)
    .out();

  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', s.key, nonce);
  const enc = Buffer.concat([cipher.update(zlib.deflateRawSync(inner)), cipher.final(), cipher.getAuthTag()]);
  const outer = new PB().var(1, ts).byt(2, Buffer.concat([nonce, enc])).out();

  const resp = await post(ENDPOINT, outer, {
    'Content-Type': 'application/x-protobuf',
    'User-Agent': UA,
    'X-Player-Page-Protection': '1',
    'X-Session-Id': s.session,
  });
  if (resp.status !== 200) {
    throw new Error('请求失败 HTTP ' + resp.status + ' ' + resp.body.toString('utf8').slice(0, 120));
  }
  const blob = pbf(resp.body, 2, 2);
  if (!blob || blob.length < 28) {
    throw new Error('响应异常 ' + resp.body.toString('base64').slice(0, 120));
  }
  const dec = crypto.createDecipheriv('aes-256-gcm', s.key, blob.subarray(0, 12));
  dec.setAuthTag(blob.subarray(blob.length - 16));
  const plain = Buffer.concat([dec.update(blob.subarray(12, blob.length - 16)), dec.final()]);
  const outerPlain = inflateTolerant(plain, true);
  const data = pbf(outerPlain, 4, 2);
  return data == null ? null : data;
}

async function call(api, action, body) {
  const s = await ensure();
  try {
    return await callOnce(s, api, action, body);
  } catch (e) {
    // 会话过期/被踢：清缓存重握手一次
    if (SESSION === s) {
      SESSION = null;
      const s2 = await ensure();
      return callOnce(s2, api, action, body);
    }
    throw e;
  }
}

// ==================== 数据映射 ====================
function item(b) {
  let vid = '', name = '', pic = '', desc = '', remark = '', year = '', area = '';
  const tags = [];
  for (const { f, w, v } of safePb(b)) {
    if (w === 0 && f === 1) vid = String(v);
    else if (w === 0 && f === 2) year = String(v);
    else if (w === 2 && f === 3) name = u8(v);
    else if (w === 2 && f === 6) pic = u8(v);
    else if (w === 2 && f === 7 && !pic) pic = u8(v);
    else if (w === 2 && (f === 9 || f === 20) && !desc) desc = u8(v);
    else if (w === 2 && f === 11) remark = u8(v);
    else if (w === 2 && f === 16 && !area) area = u8(v);
    else if (w === 2 && f === 17) tags.push(u8(v));
  }
  if (!vid || !name) return null;
  return {
    vod_id: vid,
    vod_name: name,
    vod_pic: pic || '',
    vod_remarks: remark || desc || '',
    vod_year: year || '',
    vod_area: area || '',
    type_name: tags.slice(0, 2).join('、'),
  };
}

function itemsOf(resp, limit = 60) {
  const out = [];
  if (!resp) return out;
  for (const want of [66, 1]) {
    for (const { f, w, v } of safePb(resp)) {
      if (f !== want || w !== 2 || v.length < 20) continue;
      const it = item(v);
      if (it) out.push(it);
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }
  // 兜底：更老的嵌套结构
  for (const { f, w, v } of safePb(resp)) {
    if (w !== 2 || v.length < 30) continue;
    for (const x of safePb(v)) {
      if (x.f === 3 && x.w === 2 && x.v.length > 30) {
        const it = item(x.v);
        if (it) out.push(it);
      }
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

async function listByType(typeId, page) {
  const body = new PB().var(1, Number(typeId) || 8).var(2, Number(page) || 1).out();
  return itemsOf(await call(3, 66, body));
}

async function searchBy(keyword, page) {
  const body = new PB()
    .s(1, keyword)
    .var(2, Number(page) || 1)
    .byt(5, new PB().var(1, 1).var(2, 0).s(3, 'vod_hits_week').out())
    .out();
  return itemsOf(await call(3, 61, body));
}

async function detailOf(vid) {
  const body = new PB()
    .var(1, Number(vid) || 0)
    .s(4, 'APP_PLATFORM_ANDROID_TV')
    .var(5, 0)
    .out();
  const resp = await call(3, 62, body);
  if (!resp) return null;

  const vod = { vod_id: String(vid) };
  const actors = [], directors = [], groups = [], tags = [];
  const strip = (s) => s.replace(/<[^>]+>/g, '');

  for (const { f, w, v } of safePb(resp)) {
    if (w !== 2) continue;
    if (f === 75) {
      let gname = '';
      const eps = [];
      for (const g of safePb(v)) {
        if (g.w === 2 && g.f === 1) {
          gname = u8(g.v);
        } else if (g.w === 2 && g.f === 2 && g.v.length > 10) {
          let title = '', url = '', idx = '';
          for (const e of safePb(g.v)) {
            if (e.w === 0 && e.f === 1) idx = String(e.v);
            else if (e.w === 2 && e.f === 3) url = u8(e.v);
            else if (e.w === 2 && e.f === 4) title = u8(e.v);
          }
          if (url) {
            if (!title || /^\d+$/.test(title)) title = '第' + (title || idx || eps.length + 1) + '集';
            eps.push(title + '$' + url);
          }
        }
      }
      if (eps.length) groups.push([GROUP_NAME[gname] || gname || '线路', eps]);
      continue;
    }
    const txt = u8(v);
    if (f === 5) vod.vod_name = txt;
    else if (f === 13) vod.vod_pic = txt;
    else if (f === 21) vod.vod_content = strip(txt);
    else if (f === 6 && vod.vod_content == null) vod.vod_content = strip(txt);
    else if (f === 22) vod.vod_remarks = txt;
    else if (f === 30) vod.vod_year = txt;
    else if (f === 11) tags.push(txt);
    else if (f === 17) actors.push(txt);
    else if (f === 18) directors.push(txt);
  }

  vod.vod_actor = actors.join('、');
  vod.vod_director = directors.join('、');
  vod.type_name = tags.slice(0, 3).join('、');
  vod.vod_play_from = groups.map((g) => g[0]).join('$$$');
  vod.vod_play_url = groups.map((g) => g[1].join('#')).join('$$$');
  return vod;
}

// ==================== 播放解析 ====================
async function playOf(rawIn) {
  const raw = String(rawIn == null ? '' : rawIn);
  const header = { 'User-Agent': 'Mozilla/5.0' };
  if (isMedia(raw)) return { parse: 0, url: raw, header };

  let src = null;
  for (const prefix of Object.keys(PREFIX2SRC)) {
    if (raw.startsWith(prefix)) { src = PREFIX2SRC[prefix]; break; }
  }
  const base = src ? SRC2PARSE[src] : null;
  if (!base) return { parse: 1, jx: 1, url: raw, header };

  const target = base + encodeURIComponent(raw);
  try {
    const resp = await request(target, {
      headers: { 'User-Agent': 'okhttp/4.1.0', Referer: 'https://glgl.tv/' },
      timeout: 15000,
    });
    const txt = resp.body.toString('utf8');
    const m = /"url"\s*:\s*"([^"]+)"/.exec(txt);
    if (m) {
      const url = m[1].replace(/\\\//g, '/');
      return { parse: 0, url, header };
    }
    try {
      const j = JSON.parse(txt);
      if (j && j.url) return { parse: 0, url: String(j.url).replace(/\\\//g, '/'), header };
    } catch (e) { /* 不是 JSON */ }
  } catch (e) {
    console.error('[咕噜4K] 播放解析失败:', e.message);
  }
  return { parse: 1, url: target, header };
}

// ==================== 路由 ====================
const meta = {
  key: 'py_gulu_4k',
  name: '💧咕噜 - 4K',
  type: 3,
  searchable: 1,
  quickSearch: 1,
  filterable: 1,
};

async function home() {
  let list = [];
  try {
    list = await listByType(9, 1);
  } catch (e) {
    console.error('[咕噜4K] 首页失败:', e.message);
  }
  return { class: CATEGORIES, filters: {}, list };
}

async function category(b) {
  const page = pageOf(b);
  const tid = argOf(b, ['tid', 'type_id', 'id'], '8');
  try {
    const list = await listByType(tid, page);
    return { list, page, pagecount: list.length >= 10 ? page + 1 : page, limit: 20, total: list.length < 10 ? list.length : 9999 };
  } catch (e) {
    console.error('[咕噜4K] 分类失败:', e.message);
    return { list: [], page, pagecount: 1, limit: 20, total: 0 };
  }
}

async function search(b) {
  const page = pageOf(b);
  const wd = argOf(b, ['wd', 'keyword', 'key', 'searchKey'], '');
  try {
    const list = await searchBy(wd, page);
    return { list, page, pagecount: list.length >= 10 ? page + 1 : page, limit: 20, total: list.length < 10 ? list.length : 9999 };
  } catch (e) {
    console.error('[咕噜4K] 搜索失败:', e.message);
    return { list: [], page, pagecount: 1, limit: 20, total: 0 };
  }
}

async function detail(b) {
  const vid = idOf(b);
  if (!vid) return { list: [] };
  try {
    const vod = await detailOf(vid);
    return { list: vod ? [vod] : [] };
  } catch (e) {
    console.error('[咕噜4K] 详情失败:', e.message);
    return { list: [] };
  }
}

async function play(b) {
  const raw = idOf(b);
  try {
    return await playOf(raw);
  } catch (e) {
    console.error('[咕噜4K] 播放失败:', e.message);
    return { parse: 1, url: raw, header: { 'User-Agent': 'Mozilla/5.0' } };
  }
}

export default function createSpider() {
  return {
  meta,
  api: async (fastify) => {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => home());
    fastify.post('/category', async (req) => category(req.body || {}));
    fastify.post('/search', async (req) => search(req.body || {}));
    fastify.post('/detail', async (req) => detail(req.body || {}));
    fastify.post('/play', async (req) => play(req.body || {}));
  },
};
}
