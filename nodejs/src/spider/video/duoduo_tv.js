'use strict';
// 多多影视（duoduo_tv）：滴源 Node 源，单文件、零第三方依赖、纯正则/JSON 解析。
// 站点：https://dduotv01.top
// 接口：/api.php/web/index/home、/filter/vod、/vod/get_detail、/search/index、
//       /internal/search_aggregate、/decode/url
//
// 播放说明：站内线路的播放地址是加密串，官方网页用 wasm + protobuf 向
// /api.php/web/decode/url 换直链。鸿蒙壳子禁用 wasm，这里把 protobuf 编解码、
// 请求签名（finger/id/nonce/sk/time/v 拼接后 SHA-256）全部用纯 JS 复刻，不再依赖 wasm。
// 换出来的直链统一走引擎内代理：抖音 CDN 等 mp4 不带 UA 会断开、带 Referer 会 403，
// 部分线路的 m3u8 还返回 octet-stream；代理负责固定 UA/去 Referer/透传 Range，
// 并把 m3u8 的分片与密钥地址重写成代理地址，壳子播放器无需再带任何头。

import req from '../../util/req.js';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import zlib from 'node:zlib';

const HOST = 'https://dduotv01.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'X-Client': '8f3d2a1c7b6e5d4c9a0b1f2e3d4c5b6a',
  'web-sign': 'ddtvf65f3a83d6d9ad6f',
};

// ================================================================
// 纯 JS SHA-256（鸿蒙运行时未必带 crypto，这里不依赖任何原生模块）
// ================================================================
const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256Hex(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  const len = bytes.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = Buffer.alloc(total);
  bytes.copy(buf);
  buf[len] = 0x80;
  const bitsHi = Math.floor(len / 536870912);
  const bitsLo = (len * 8) >>> 0;
  buf.writeUInt32BE(bitsHi >>> 0, total - 8);
  buf.writeUInt32BE(bitsLo, total - 4);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = buf.readInt32BE(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + (w[i - 7] | 0) + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

function randomHex(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// ================================================================
// protobuf（只有 string/varint 两种 wire type）
// ================================================================
function pbVarint(num) {
  let n = Math.floor(Number(num) || 0);
  const out = [];
  while (n > 127) { out.push((n % 128) | 128); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
}
function pbStr(field, value) {
  const b = Buffer.from(String(value == null ? '' : value), 'utf8');
  return Buffer.concat([pbVarint(field * 8 + 2), pbVarint(b.length), b]);
}
function pbNum(field, value) {
  return Buffer.concat([pbVarint(field * 8), pbVarint(value)]);
}
function pbDecode(buf) {
  const out = {};
  let i = 0;
  while (i < buf.length) {
    let tag = 0, shift = 0, b;
    do { b = buf[i++]; tag |= (b & 127) << shift; shift += 7; } while (b & 128);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      let v = 0, s = 0;
      do { b = buf[i++]; v += (b & 127) * Math.pow(2, s); s += 7; } while (b & 128);
      out[field] = v;
    } else if (wire === 2) {
      let n = 0, s = 0;
      do { b = buf[i++]; n |= (b & 127) << s; s += 7; } while (b & 128);
      out[field] = buf.subarray(i, i + n);
      i += n;
    } else if (wire === 5) {
      i += 4;
    } else if (wire === 1) {
      i += 8;
    } else break;
  }
  return out;
}

// ================================================================
// HTTP：文本请求优先用引擎全局 req；二进制（protobuf/代理）用 node 内置模块
// ================================================================
function rawRequest(url, opt) {
  const options = opt || {};
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(String(url)); } catch (e) { return reject(e); }
    const lib = u.protocol === 'http:' ? http : https;
    const headers = Object.assign({}, HEADERS, options.headers || {});
    const body = options.body == null ? null : (Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body)));
    if (body) headers['Content-Length'] = body.length;
    const r = lib.request(u, { method: options.method || (body ? 'POST' : 'GET'), headers, timeout: options.timeout || 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (options.depth || 0) < 3) {
        res.resume();
        const next = new URL(res.headers.location, u).href;
        return resolve(rawRequest(next, Object.assign({}, options, { depth: (options.depth || 0) + 1 })));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString('utf8') });
      });
    });
    r.on('timeout', () => r.destroy(new Error('请求超时')));
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function textRequest(url, opt) {
  const options = opt || {};
  const headers = Object.assign({}, HEADERS, options.headers || {});
  try {
    const r = await req({ method: options.method || 'GET', url, headers, data: options.body || undefined, timeout: options.timeout || 15000, responseType: 'text', validateStatus: () => true });
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' ' + url);
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    const r = await rawRequest(url, options);
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' ' + url);
    return r.text;
  }
}

async function api(path) {
  const text = await textRequest(HOST + path);
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('接口返回非 JSON：' + String(text).slice(0, 80)); }
  if (Number(j.code) !== 200) throw new Error('接口 ' + j.code + ' ' + (j.msg || ''));
  return j;
}

// ================================================================
// /decode/url 请求签名（从官方 web wasm 反推的纯 JS 版本）
// ================================================================
const SIGN_FINGER = 'WF-2c064bc5b3400788f31b848849bc3a60f835423ba2dfe69d7ea93974c216e4f2';
const SIGN_SK = 'WEB-50a8e9c84a1dc05669a692ded99a2dac46527229e607a7be15db88dbc59059d1';

function decodeBody(payload, from) {
  const time = Date.now();
  const nonce = randomHex(32);
  const pre = 'finger=' + SIGN_FINGER + '&id=com.web.player&nonce=' + nonce + '&sk=' + SIGN_SK + '&time=' + time + '&v=1';
  const sign = sha256Hex(pre).toUpperCase();
  return Buffer.concat([
    pbStr(1, payload),
    pbStr(2, from || ''),
    pbNum(3, time),
    pbStr(4, nonce),
    pbStr(5, sign),
    pbStr(6, 'com.web.player'),
    pbNum(7, 1),
  ]);
}

async function decodeUrl(payload, from) {
  const r = await rawRequest(HOST + '/api.php/web/decode/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-protobuf', Accept: 'application/x-protobuf' },
    body: decodeBody(payload, from),
    timeout: 12000,
  });
  if (r.status !== 200 && r.status !== 401) throw new Error('decode HTTP ' + r.status);
  const f = pbDecode(r.body);
  return {
    code: Number(f[1] || 0),
    msg: f[2] ? f[2].toString('utf8') : '',
    data: f[3] ? f[3].toString('utf8') : '',
  };
}

// ================================================================
// 站点数据
// ================================================================
const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '剧集' },
  { type_id: '3', type_name: '动漫' },
  { type_id: '4', type_name: '综艺' },
];
const TYPE_NAME = { 1: '电影', 2: '剧集', 3: '动漫', 4: '综艺' };
const LINE_NAME = {
  BBA: 'BB蓝光', qsvip: '青山蓝光', NBY: 'NB蓝光', co: 'CO蓝光', CO4K: 'CO4K', zijianm3u8: 'ZJ4K',
  PAN1: 'PO蓝光', qq: '腾讯', bilibili: 'bilibili', qiyi: '奇艺', youku: '优酷', mgtv: '芒果',
  jsm3u8: '站外-极速', rym3u8: '站外-如意', lzm3u8: '站外-量子', bfzym3u8: '站外-暴风',
  ikm3u8: '站外-ikun', modum3u8: '站外-魔都', subm3u8: '站外-速播', gsm3u8: '站外-光速', hnm3u8: '站外-红牛',
};

const YEAR = ['', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015-2011', '2010-2000', '90年代', '80年代'];
function filterGroup(cls, area, years) {
  const g = [
    { key: 'sort', name: '排序', value: [{ n: '人气', v: 'hits' }, { n: '最新', v: 'time' }, { n: '评分', v: 'score' }, { n: '年份', v: 'year' }] },
    { key: 'class', name: '类型', value: [{ n: '全部', v: '' }].concat(cls.map((n) => ({ n, v: n }))) },
    { key: 'area', name: '地区', value: [{ n: '全部', v: '' }].concat(area.map((n) => ({ n, v: n }))) },
    { key: 'year', name: '年份', value: years.map((y) => ({ n: y || '全部', v: y })) },
  ];
  return g;
}
const FILTERS = {
  1: filterGroup(['动作', '喜剧', '爱情', '科幻', '恐怖', '悬疑', '犯罪', '战争', '动画', '冒险', '历史', '灾难', '纪录', '剧情'], ['大陆', '香港', '台湾', '美国', '日本', '韩国', '泰国', '印度', '英国', '法国', '德国', '加拿大', '西班牙', '意大利', '澳大利亚'], YEAR),
  2: filterGroup(['爱情', '古装', '武侠', '历史', '家庭', '喜剧', '悬疑', '犯罪', '战争', '奇幻', '科幻', '恐怖'], ['大陆', '香港', '台湾', '美国', '日本', '韩国', '泰国', '英国'], YEAR),
  3: filterGroup(['真人秀', '音乐', '脱口秀', '歌舞', '爱情'], ['大陆', '香港', '台湾', '美国', '日本', '韩国'], YEAR),
  4: filterGroup(['冒险', '奇幻', '科幻', '武侠', '悬疑'], ['大陆', '日本', '欧美'], YEAR),
};

function pageNum(b) {
  return Math.max(1, parseInt((b && (b.page || b.pg)) || 1, 10) || 1);
}
function oneId(b) {
  const v = b && (b.id != null ? b.id : (b.ids != null ? b.ids : b.vod_id));
  return String(Array.isArray(v) ? v[0] || '' : v || '');
}
function absUrl(u) {
  const s = String(u || '').replace(/&amp;/g, '&').trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return HOST + s;
  return s;
}
function stripTags(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function toVod(it) {
  return {
    vod_id: String((it && (it.vod_id || it.id)) || ''),
    vod_name: String((it && (it.vod_name || it.name)) || ''),
    vod_pic: absUrl(it && (it.vod_pic || it.vod_pic_slide || it.pic)),
    vod_remarks: String((it && it.vod_remarks) || ''),
    vod_year: String((it && it.vod_year) || ''),
    vod_area: Array.isArray(it && it.vod_area) ? it.vod_area.join(',') : String((it && it.vod_area) || ''),
  };
}
function listResult(list, page, size, pagecount) {
  const n = list.length;
  return {
    list,
    page,
    pagecount: pagecount || page + (n >= size ? 1 : 0),
    limit: size,
    total: n ? 9999 : 0,
  };
}

// ================================================================
// 本地播放代理：固定 UA、去掉 Referer、透传 Range、重写 HLS、SSRF 防护
// 抖音 CDN 的 mp4 不带 UA 会直接断开、带 Referer 会 403，NB 等线路的 m3u8 又返回
// application/octet-stream，壳子播放器不可控，所以所有直链统一返回引擎内代理地址：
// mp4 透传 Range，m3u8 由代理补正确的 Content-Type 并把分片/密钥地址重写成代理地址。
// ================================================================
const PROXY_KEY = 'py_duoduo_tv';
const PROXY_UA = UA;
const MAX_REDIRECT = 4;

function ipPrivate(ip) {
  const s = String(ip || '').toLowerCase();
  if (net.isIPv4(s)) {
    const p = s.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
    if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;
    if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (!net.isIPv6(s)) return false;
  if (s === '::' || s === '::1') return true;
  const dotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return ipPrivate(dotted[1]);
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = parseInt(hex[1], 16) * 65536 + parseInt(hex[2], 16);
    return ipPrivate([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s)) return true;
  return false;
}

async function checkProxyTarget(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch (e) { throw new Error('bad url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
  if (u.username || u.password) throw new Error('bad url');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(?:localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('private host');
  let addrs;
  const family = net.isIP(host);
  if (family) addrs = [{ address: host, family }];
  else {
    addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
    addrs.sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
  }
  if (!addrs || !addrs.length) throw new Error('dns');
  for (const a of addrs) if (ipPrivate(a.address)) throw new Error('private address');
  return { url: u, addresses: addrs };
}

function pinnedLookup(addrs) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    const fam = options && options.family ? Number(options.family) : 0;
    const a = addrs.find((x) => !fam || x.family === fam) || addrs[0];
    if (options && options.all) return cb(null, addrs.map((x) => ({ address: x.address, family: x.family })));
    cb(null, a.address, a.family);
  };
}

function localProxyHost(host) {
  const h = String(host || '').trim();
  if (!/^(?:[a-zA-Z0-9.\-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/.test(h)) return '';
  const m = h.match(/^\[([0-9a-fA-F:]+)\](?::\d{1,5})?$/);
  const hp = m ? m[1] : h.split(':')[0];
  if (/^localhost$/i.test(hp)) return h;
  if (net.isIP(hp) && ipPrivate(hp)) return h;
  return '';
}

function proxyBase(request) {
  const host = localProxyHost(request && request.headers && request.headers.host) || '127.0.0.1:9988';
  return 'http://' + host + '/spider/' + PROXY_KEY + '/3/proxy?url=';
}

function rewriteHls(text, playlistUrl, base) {
  const prox = (raw) => {
    try {
      const abs = new URL(String(raw).replace(/&amp;/g, '&'), playlistUrl).href;
      if (!/^https?:\/\//i.test(abs) || /\/spider\/[^/]+\/\d+\/proxy\?/i.test(abs)) return raw;
      return base + encodeURIComponent(abs);
    } catch (e) { return raw; }
  };
  return String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.charAt(0) === '#') return line.replace(/URI="([^"]*)"/g, (m, uri) => 'URI="' + prox(uri) + '"');
    return prox(t);
  }).join('\n');
}

// 上游响应头原样回吐会踩坑：部分 CDN 的 content-disposition 带非 Latin-1 字符，
// Node 的 writeHead 会直接抛 ERR_INVALID_CHAR，所以只透传播放需要的头。
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-encoding', 'last-modified', 'etag', 'cache-control', 'expires', 'content-language'];
function passHeaders(src) {
  const out = {};
  for (const k of PASS_HEADERS) if (src && src[k] != null) out[k] = src[k];
  out['access-control-allow-origin'] = '*';
  return out;
}

async function playProxy(request, reply) {
  let checked;
  try { checked = await checkProxyTarget(request.query && request.query.url); }
  catch (e) { return reply.code(400).type('text/plain; charset=utf-8').send('bad url'); }
  reply.hijack();
  const res = reply.raw;
  const base = proxyBase(request);
  const range = request.headers && request.headers.range ? String(request.headers.range) : '';
  const isHead = String(request.method || 'GET').toUpperCase() === 'HEAD';
  let done = false;
  const fail = (code, msg) => {
    if (done) return;
    done = true;
    try {
      if (!res.headersSent) res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(msg || 'proxy error');
    } catch (e) { /* 忽略 */ }
  };
  const go = (urlObj, addrs, depth) => {
    let up;
    try {
      const headers = { 'User-Agent': PROXY_UA, Accept: '*/*', 'Accept-Encoding': 'identity' };
      if (isHead) headers.Range = 'bytes=0-0';
      else if (range && !/\.m3u8(?:$|[?#])/i.test(urlObj.href)) headers.Range = range;
      up = (urlObj.protocol === 'http:' ? http : https).request(urlObj, {
        method: 'GET', headers, lookup: pinnedLookup(addrs), rejectUnauthorized: false, timeout: 25000,
      }, (ur) => {
        const code = ur.statusCode || 502;
        ur.on('error', () => {
          try {
            if (!res.headersSent) fail(502, 'upstream stream error');
            else res.destroy();
          } catch (e) { /* 忽略 */ }
        });
        if (code >= 300 && code < 400 && ur.headers.location && depth < MAX_REDIRECT) {
          ur.resume();
          let next;
          try { next = new URL(ur.headers.location, urlObj).href; } catch (e) { return fail(502, 'bad redirect'); }
          checkProxyTarget(next).then((c) => go(c.url, c.addresses, depth + 1)).catch(() => fail(502, 'redirect blocked'));
          return;
        }
        // 播放器探测用的 HEAD 只回响应头，不能把整个 mp4 拉下来
        if (isHead) {
          const h = passHeaders(ur.headers);
          delete h['content-encoding'];
          const cr = String(h['content-range'] || '');
          const total = cr.split('/')[1];
          delete h['content-range'];
          if (/^\d+$/.test(total || '')) h['content-length'] = total;
          try { res.writeHead(200, h); } catch (e) { done = false; return fail(502); }
          done = true;
          try { ur.destroy(); } catch (e) { /* 忽略 */ }
          res.end();
          return;
        }
        const ct = String(ur.headers['content-type'] || '');
        const isHls = /mpegurl/i.test(ct) || /\.m3u8(?:$|[?#])/i.test(urlObj.href);
        if (!isHls) {
          try { res.writeHead(code, passHeaders(ur.headers)); } catch (e) { done = false; return fail(502, 'bad upstream headers'); }
          done = true;
          ur.pipe(res);
          return;
        }
        const chunks = [];
        let size = 0;
        ur.on('data', (c) => {
          size += c.length;
          if (size > 8 * 1024 * 1024) { try { ur.destroy(); } catch (e) { /* 忽略 */ } return; }
          chunks.push(c);
        });
        ur.on('end', () => {
          if (done) return;
          let body = Buffer.concat(chunks);
          const enc = String(ur.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc === 'gzip') body = zlib.gunzipSync(body);
            else if (enc === 'deflate') body = zlib.inflateSync(body);
            else if (enc === 'br') body = zlib.brotliDecompressSync(body);
          } catch (e) { /* 保持原样 */ }
          const text = body.toString('utf8');
          const h = passHeaders(ur.headers);
          delete h['content-range']; delete h['accept-ranges']; delete h['content-length']; delete h['content-encoding'];
          if (!/^\s*#EXTM3U/i.test(text)) {
            h['content-length'] = body.length;
            try { res.writeHead(code, h); } catch (e) { done = false; return fail(502); }
            done = true;
            res.end(body);
            return;
          }
          const out = Buffer.from(rewriteHls(text, urlObj.href, base), 'utf8');
          h['content-type'] = 'application/vnd.apple.mpegurl';
          h['content-length'] = out.length;
          h['cache-control'] = 'no-store';
          try { res.writeHead(200, h); } catch (e) { done = false; return fail(502); }
          done = true;
          res.end(out);
        });
      });
    } catch (e) { return fail(502, 'upstream error'); }
    up.setTimeout(25000, () => { try { up.destroy(new Error('timeout')); } catch (e) { /* 忽略 */ } });
    up.on('error', () => fail(502, 'upstream error'));
    up.end();
  };
  go(checked.url, checked.addresses, 0);
}

function toProxyUrl(request, u) {
  const s = String(u || '');
  if (!/^https?:\/\//i.test(s)) return s;
  if (/\/spider\/[^/]+\/\d+\/proxy\?/i.test(s)) return s;
  return proxyBase(request) + encodeURIComponent(s);
}

// ================================================================
// 各接口实现
// ================================================================
async function home() {
  const j = await api('/api.php/web/index/home');
  const data = j.data || {};
  const seen = {};
  const list = [];
  const push = (it) => {
    if (!it || !it.vod_id || seen[it.vod_id]) return;
    seen[it.vod_id] = 1;
    list.push(toVod(it));
  };
  (data.recommend || []).forEach(push);
  (data.categories || []).forEach((c) => (c.videos || []).forEach(push));
  return { class: CLASSES.slice(), filters: FILTERS, list };
}

async function category(body) {
  const b = body || {};
  const page = pageNum(b);
  const idRaw = Array.isArray(b.id) ? b.id[0] : (b.id != null ? b.id : b.tid);
  const tid = String(idRaw == null ? '1' : idRaw).replace(/[^\d]/g, '') || '1';
  const ext = b.extend || b.filters || b.ext || {};
  const params = new URLSearchParams();
  params.set('type_id', tid);
  params.set('page', String(page));
  params.set('sort', String(ext.sort || 'hits'));
  params.set('type_name', TYPE_NAME[tid] || '电影');
  for (const k of ['class', 'area', 'year']) {
    const v = ext[k];
    if (v != null && String(v).trim() !== '') params.set(k, String(v).trim());
  }
  const j = await api('/api.php/web/filter/vod?' + params.toString());
  const list = (Array.isArray(j.data) ? j.data : []).map(toVod);
  // 站点接口的 pageCount 恒为 1，网页自己用「本页条数 >= 18」判断还有下一页
  let pagecount = Number(j.pageCount || j.pagecount || 0) || 0;
  if (list.length >= 18) pagecount = Math.max(pagecount, page + 1);
  if (pagecount < page) pagecount = page;
  return listResult(list, page, 24, pagecount);
}

async function search(body) {
  const b = body || {};
  const wd = String(b.wd || b.keyword || b.word || '').trim();
  const page = pageNum(b);
  if (!wd) return { list: [], page, pagecount: page, limit: 15, total: 0 };
  const j = await api('/api.php/web/search/index?wd=' + encodeURIComponent(wd) + '&page=' + page + '&limit=15');
  const list = (Array.isArray(j.data) ? j.data : []).map(toVod);
  return listResult(list, page, 15);
}

function episodesOf(group) {
  const out = [];
  for (const part of String(group || '').split('#')) {
    const raw = String(part || '').trim();
    if (!raw) continue;
    const at = raw.indexOf('$');
    const title = (at >= 0 ? raw.slice(0, at) : raw).trim();
    const payload = at >= 0 ? raw.slice(at + 1).trim() : '';
    if (!title || !payload) continue;
    out.push({ title, payload });
  }
  return out;
}

// 播放 id：线路key|vodId|集数下标|原始加密串（兼容旧的 线路key|加密串）
function makeEpisodeId(lineKey, vodId, index, payload) {
  return String(lineKey || '') + '|' + String(vodId || '') + '|' + String(index) + '|' + String(payload || '');
}

async function buildDetail(vodId) {
  const j = await api('/api.php/web/vod/get_detail?vod_id=' + encodeURIComponent(vodId));
  const vod = Array.isArray(j.data) ? j.data[0] : null;
  if (!vod) return null;

  const froms = String(vod.vod_play_from || '').split('$$$').map((s) => s.trim()).filter(Boolean);
  const groups = String(vod.vod_play_url || '').split('$$$').map((s) => s.trim()).filter(Boolean);
  const vp = {};
  (Array.isArray(j.vodplayer) ? j.vodplayer : []).forEach((p) => { if (p && p.from) vp[p.from] = p; });

  const lines = [];
  for (let i = 0; i < froms.length && i < groups.length; i++) {
    const key = froms[i];
    const group = groups[i];
    if (!key || !group) continue;
    const p = vp[key] || {};
    const show = String(p.show || LINE_NAME[key] || key).trim() || key;
    const sort = parseFloat(p.sort);
    lines.push({ name: show, key, group, sort: Number.isFinite(sort) ? sort : 9999 });
  }

  // 站外聚合线路：多数直接给 m3u8，少数仍是站内加密串
  try {
    const a = await api('/api.php/web/internal/search_aggregate?vod_id=' + encodeURIComponent(vodId));
    (Array.isArray(a.data) ? a.data : []).forEach((s) => {
      if (!s || !s.vod_play_url) return;
      const key = String(s.vod_play_from || s.site_key || '').trim();
      const name = String(s.site_name || LINE_NAME[key] || key).trim();
      if (!key || !name) return;
      const sort = parseFloat(s.sort);
      lines.push({ name, key, group: String(s.vod_play_url), sort: Number.isFinite(sort) ? sort : 9999 });
    });
  } catch (e) { /* 站外线路失败不影响站内 */ }

  lines.sort((a, b) => a.sort - b.sort);
  return { vod, lines };
}

async function detail(body) {
  const vodId = oneId(body);
  if (!vodId) return { list: [] };
  const built = await buildDetail(vodId);
  if (!built) return { list: [] };
  const { vod, lines } = built;

  const names = [];
  const urls = [];
  const used = {};
  for (const line of lines) {
    if (used[line.name]) continue;
    const eps = episodesOf(line.group);
    if (!eps.length) continue;
    used[line.name] = 1;
    names.push(line.name);
    urls.push(eps.map((e, i) => e.title + '$' + makeEpisodeId(line.key, vodId, i, e.payload)).join('#'));
  }

  const v = toVod(vod);
  v.vod_id = String(vod.vod_id || vodId);
  v.vod_content = stripTags(vod.vod_content);
  v.vod_actor = String(vod.vod_actor || '');
  v.vod_director = String(vod.vod_director || '');
  v.vod_class = Array.isArray(vod.vod_class) ? vod.vod_class.join(',') : String(vod.vod_class || '');
  v.vod_remarks = String(vod.vod_remarks || '');
  v.vod_play_from = names.join('$$$');
  v.vod_play_url = urls.join('$$$');
  return { list: [v] };
}

function flagKey(flag) {
  const f = String(flag || '').trim();
  if (!f) return '';
  if (LINE_NAME[f]) return f;
  for (const k of Object.keys(LINE_NAME)) if (LINE_NAME[k] === f) return k;
  return f;
}

function isMediaUrl(u) {
  const s = String(u || '');
  if (!/^https?:\/\//i.test(s)) return false;
  if (/\.(?:m3u8|mp4|flv|mkv|ts|m4a|mp3)(?:[?#]|$)/i.test(s)) return true;
  if (/[?&]url=[^&]*\.m3u8/i.test(s)) return true;
  // 腾讯/爱奇艺/芒果/B站等线路解出来的是官方网页，不是直链
  if (/\.(?:html?|shtml)(?:[?#]|$)/i.test(s)) return false;
  if (/^https?:\/\/(?:www\.)?(?:mgtv\.com|v\.qq\.com|www\.iqiyi\.com|v\.youku\.com|www\.bilibili\.com|b23\.tv)\//i.test(s)) return false;
  return true;
}

// 换出来的直链统一走代理：mp4 透传 Range，m3u8 由代理重写分片地址并补 Content-Type
function playResult(request, url) {
  if (!/^https?:\/\//i.test(url)) return { parse: 1, url: String(url || '') };
  return { parse: 0, url: toProxyUrl(request, url), header: { 'User-Agent': UA } };
}

function parsePlayId(raw) {
  const p = String(raw || '').split('|');
  let key = p[0] || '';
  const dollar = key.lastIndexOf('$'); // 兼容壳子把「集名$id」整串传进来的情况
  if (dollar >= 0) key = key.slice(dollar + 1);
  if (p.length >= 4 && /^\d+$/.test(p[1] || '') && /^\d+$/.test(p[2] || '')) {
    return { key, vodId: p[1], epIndex: parseInt(p[2], 10) || 0, payload: p.slice(3).join('|') };
  }
  if (p.length >= 2) return { key, vodId: '', epIndex: -1, payload: p.slice(1).join('|') };
  return { key: '', vodId: '', epIndex: -1, payload: String(raw || '') };
}

async function resolveLine(key, payload) {
  if (/^https?:\/\//i.test(payload)) return { ok: isMediaUrl(payload), url: payload };
  try {
    const out = await decodeUrl(payload, key);
    if (out.code === 1 && /^https?:\/\//i.test(out.data)) return { ok: isMediaUrl(out.data), url: out.data };
    return { ok: false, url: '', code: out.code, msg: out.msg };
  } catch (e) {
    return { ok: false, url: '', err: e && e.message ? e.message : String(e) };
  }
}

async function play(request, body) {
  const b = body || {};
  const raw = String(Array.isArray(b.id) ? b.id[0] : (b.id != null ? b.id : (b.play || b.url || ''))).trim();
  const flag = String(b.flag || b.from || '');
  if (!raw) return { parse: 1, url: '' };

  const info = parsePlayId(raw);
  if (!info.key) info.key = flagKey(flag);

  const first = await resolveLine(info.key, info.payload);
  if (first.ok) return playResult(request, first.url);
  if (first.msg || first.err) console.warn('[多多影视] 线路 ' + info.key + ' 解码失败: ' + (first.msg || first.err));
  let pageUrl = first.url || '';

  // 第一条线路可能是 CO4K（网页端限制）或腾讯/芒果等官方页，换同集的其它线路重试
  if (info.vodId && info.epIndex >= 0) {
    try {
      const built = await buildDetail(info.vodId);
      if (built) {
        // 已知会失败/只给网页的线路排到最后，优先直链线路
        const delayed = { CO4K: 1, qq: 1, qiyi: 1, youku: 1, mgtv: 1, bilibili: 1 };
        const cands = built.lines
          .filter((line) => line.key !== info.key)
          .sort((a, b) => (delayed[a.key] ? 1 : 0) - (delayed[b.key] ? 1 : 0));
        let tries = 0;
        for (const line of cands) {
          if (tries >= 8) break;
          const eps = episodesOf(line.group);
          const ep = eps[info.epIndex];
          if (!ep) continue;
          tries++;
          const r = await resolveLine(line.key, ep.payload);
          if (r.ok) {
            console.warn('[多多影视] 线路回退 ' + info.key + ' -> ' + line.key);
            return playResult(request, r.url);
          }
          if (!pageUrl && r.url) pageUrl = r.url;
        }
      }
    } catch (e) {
      console.warn('[多多影视] 线路回退失败: ' + (e && e.message ? e.message : e));
    }
  }

  // 只剩官方网页（腾讯/爱奇艺/芒果等）时交给壳子嗅探，不再套代理
  if (pageUrl) return { parse: 1, url: pageUrl, header: { 'User-Agent': UA } };
  return { parse: 1, url: raw, header: { 'User-Agent': UA } };
}

// ================================================================
// 源入口
// ================================================================
const __spider = {
  meta: { key: 'py_duoduo_tv', name: '📺多多影视 - 极速', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => {
      try {
        return await home();
      } catch (e) {
        // 首页接口抖动时至少保留分类和筛选，站点不至于整块消失
        console.warn('[多多影视] 首页加载失败: ' + (e && e.message ? e.message : e));
        return { class: CLASSES.slice(), filters: FILTERS, list: [] };
      }
    });
    fastify.post('/category', async (req) => category((req && req.body) || {}));
    fastify.post('/search', async (req) => search((req && req.body) || {}));
    fastify.post('/detail', async (req) => detail((req && req.body) || {}));
    fastify.post('/play', async (req) => play(req, (req && req.body) || {}));
    fastify.get('/proxy', playProxy);
    if (typeof fastify.head === 'function') fastify.head('/proxy', playProxy);
  },
};

export default function createSpider() { return __spider; }
