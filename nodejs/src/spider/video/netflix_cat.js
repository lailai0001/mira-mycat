import zlib from 'zlib';
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
 * 网飞猫（ncat）· CatPaw 迷你引擎模块
 * ---------------------------------------------------------------------------
 * 站点现状（2026-10-21 实测）：
 *   · 手机 App API，接口返回 Encrypted:1 的 AES-256-CBC 二进制密文（部分再 zlib），
 *     不是文本；必须用 arrayBuffer 取原始字节再解密（全局 req 按 UTF-8 转文本会毁字节）。
 *   · 签名：HMAC-SHA1(signStr, hmacKey) 放 sign 头；signStr =
 *     get|path|排序后的query|ts|appId=ncat&deviceCreatedAt=..&deviceId=..&st=2[&userId=..]|
 *     POST /user/anonymous 同理（post|/user/anonymous||ts|...）。
 *   · 配置 /v4/config/appInit? → groups（vod1/sres 图床）、urls（cache/logic）；
 *     首页 /v4/vod/home? → blocks[]；分类 /vod/channel/list?... → items[]；
 *     详情 /v2/vod/detail?vodId= → playSources[].list[].playUrls[].url；
 *     搜索走 vlogic 域 /vod/search/query?channelId=0&k=...（不带 .capi）。
 *   · 详情里的 playUrls 直接是真实 m3u8（实测 206 application/vnd.apple.mpegurl）。
 *
 * 2026-10-21 修复：原文件用全局 req（buffer:2 不被迷你引擎支持）拿密文，
 * 文本解码后 AES 必然失败，首页/分类/详情全空；搜索也因登录失败而空。
 * 现改为 fetch(...).arrayBuffer() 取二进制 + node:crypto 解密，正则/JSON 解析。
 */


const DEFAULT_HOST1 = 'https://vcache.mjrlin.cn';
const DEFAULT_HOST2 = 'https://vlogic.mjrlin.cn';
const PATH1 = 'os=android&appId=ncat&userLevel=0';
const PATH2 = 'os=android&appId=ncat&userChannel=c200000&userLevel=0';
const AES_KEY = 'ayt5wy5afwmwrpb19k9s3psx3dymyd0n';
const AES_IV = 'b3t069ijy7pirw0j';
const HMAC_KEY = 'ksggsr4tp6difdo1c3im8fqd3g';

const DEVICE_ID = '0bae5781e3efe9da';
const DEVICE_CREATED_AT = '1785239862097';
const APP_VERSION = '3.5.0';
const PACKAGE = 'com.ncatC200000V260728.T180135';
const UA = PACKAGE + '/3.5.0 Dalvik/2.1.0 (Linux; U; Android 12; NOH-AN01 Build/HUAWEINOH-AN01)';
const DEVICE_INFO = 'eyJicmFuZCI6IkhVQVdFSSIsIm1vZGVsIjoiTk9ILUFOMDEiLCJ0eXBlIjoicGhvbmUiLCJyZXNvbHV0aW9uWCI6IjExNTIiLCJyZXNvbHV0aW9uWSI6IjIyNTYiLCJvcmllbnRhdGlvbiI6IjEiLCJvc05hbWUiOiJhbmRyb2lkIiwib3NWZXJzaW9uIjoiMTIiLCJvc0xldmVsIjoiMzEiLCJhYmkiOiJhcm02NC12OGEsYXJtZWFiaS12N2EsYXJtZWFiaSIsImFuZHJvaWRJZCI6IjBiYWU1NzgxZTNmZWU5ZGEiLCJ1dWlkIjoiNWQyYzc0MzUtNzRjZC00NzFmLThiNDEtZWQ1OGM5ZTdlZjU4IiwiZ2FpZCI6IiJ9';

const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '剧集' },
  { type_id: '3', type_name: '动漫' },
  { type_id: '4', type_name: '综艺' },
  { type_id: '2002', type_name: '韩剧' },
  { type_id: '6', type_name: '短剧' },
];

let HOST1 = DEFAULT_HOST1;
let HOST2 = DEFAULT_HOST2;
let USER = { id: '', token: '' };
let USER_AT = 0;
let GROUPS = {};
let READY = false;
let READY_P = null;

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

function stripTags(s) {
  return decodeEntities(str(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function safeName(s) {
  return stripTags(s).replace(/[#$]/g, ' ').trim();
}

function normHost(v) {
  let s = str(v).trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  return s.replace(/\/+$/, '');
}

function hmac(text) {
  return crypto.createHmac('sha1', HMAC_KEY).update(String(text)).digest('hex');
}

function buildSuffix() {
  return 'appId=ncat&deviceCreatedAt=' + DEVICE_CREATED_AT + '&deviceId=' + DEVICE_ID + '&st=2' +
    (USER.id ? '&userId=' + USER.id : '') + '|';
}

function buildHeaders(ts, sign, extra) {
  const h = {
    'user-agent': UA,
    appId: 'ncat',
    os: 'android',
    appVersion: APP_VERSION,
    package: PACKAGE,
    deviceId: DEVICE_ID,
    deviceCreatedAt: DEVICE_CREATED_AT,
    deviceInfo: DEVICE_INFO,
    channelId: 'c200000',
    'x-d-video': '1',
    apiVer: 'v2',
    st: '2',
    ts: str(ts),
    sign: str(sign),
  };
  if (USER.id) h.userid = USER.id;
  if (USER.token) h['x-token'] = USER.token;
  return Object.assign(h, extra || {});
}

function paixu(text) {
  return str(text) ? str(text).split('&').sort().join('&') : '';
}

function decSafe(text) {
  try { return decodeURIComponent(text); } catch (e) { return str(text); }
}

// ---------------------------------------------------------------- 二进制请求 / 解密
async function binGet(url, opt) {
  const o = opt || {};
  const r = await httpReq(url, { method: o.method || 'GET', headers: o.headers || {}, body: o.body != null ? o.body : undefined, timeout: o.timeout || 20000, binary: true });
  return { status: r.status, buf: r.buf || Buffer.alloc(0), headers: r.headers, url };
}

function decryptPayload(buf) {
  const tryDecrypt = (input) => {
    const d = crypto.createDecipheriv('aes-256-cbc', Buffer.from(AES_KEY, 'utf8'), Buffer.from(AES_IV, 'utf8'));
    let out = Buffer.concat([d.update(input), d.final()]);
    if (out.length >= 2 && out[0] === 0x78 && (out[1] === 0x01 || out[1] === 0x9c || out[1] === 0xda)) {
      out = zlib.inflateSync(out);
    }
    return out.toString('utf8');
  };
  // 常规：接口直接回原始密文字节
  try { return JSON.parse(tryDecrypt(buf)); } catch (e) { /* 继续 */ }
  // 兼容个别节点回 base64 文本
  try {
    const b64 = buf.toString('utf8').replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(b64) && b64.length % 4 === 0) {
      return JSON.parse(tryDecrypt(Buffer.from(b64, 'base64')));
    }
  } catch (e) { /* 继续 */ }
  return null;
}

function unwrap(obj) {
  if (!obj) return null;
  if (obj.data !== undefined) return obj.data;
  return obj;
}

async function anonymousLogin(force) {
  if (!force && USER.id && Date.now() - USER_AT < 20 * 60 * 1000) return true;
  const ts = String(Date.now());
  const signStr = 'post|/user/anonymous||' + ts + '|' + buildSuffix();
  try {
    const r = await binGet(HOST1 + '/user/anonymous', {
      method: 'POST',
      headers: buildHeaders(ts, hmac(signStr), {
        'x-cdn': '1',
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: '',
      timeout: 20000,
    });
    if (r.status !== 200 || !r.buf.length) return false;
    const j = decryptPayload(r.buf);
    const d = j && j.data;
    if (!d || !d.id || !d.token) {
      console.log('[网飞猫] 匿名登录失败', j && j.code, j && j.msg);
      return false;
    }
    USER = { id: String(d.id), token: String(d.token) };
    USER_AT = Date.now();
    return true;
  } catch (e) {
    console.log('[网飞猫] 匿名登录异常', str((e && e.message) || e));
    return false;
  }
}

function applyConfig(data) {
  if (!data) return;
  const groups = data.groups;
  if (Array.isArray(groups)) {
    const map = {};
    for (const g of groups) {
      if (!g || !g.id) continue;
      const first = Array.isArray(g.url) ? g.url[0] : g.url;
      const domain = first && (first.domain || first.url || first);
      if (domain) map[g.id] = normHost(domain);
    }
    GROUPS = map;
  }
  const urls = data.urls || {};
  const pick = (v) => {
    if (Array.isArray(v)) return v[0];
    if (v && typeof v === 'object') return v.domain || v.url || v.value || '';
    return v;
  };
  const cache = normHost(pick(urls.cache));
  const logic = normHost(pick(urls.logic));
  if (cache && /^https?:\/\//i.test(cache)) HOST1 = cache;
  if (logic && /^https?:\/\//i.test(logic)) HOST2 = logic;
}

async function loadInit() {
  await anonymousLogin(false);
  const urlPath = '/v4/config/appInit?';
  const p = urlPath.replace('?', '.capi?');
  const path = decSafe(p) + PATH1;
  const url = HOST1 + p + PATH1;
  const ts = String(Date.now());
  const q = path.split('?');
  const signStr = 'get|' + q[0] + '|' + paixu(q[1] || '') + '|' + ts + '|' + buildSuffix();
  const r = await binGet(url, { headers: buildHeaders(ts, hmac(signStr)), timeout: 20000 });
  if (r.status !== 200 || !r.buf.length) throw new Error('appInit HTTP ' + r.status);
  const j = decryptPayload(r.buf);
  if (!j) throw new Error('appInit 解密失败');
  applyConfig(unwrap(j));
}

async function ensureReady() {
  if (READY) return;
  if (!READY_P) {
    READY_P = (async () => {
      await loadInit();
      READY = true;
    })().finally(() => { READY_P = null; });
  }
  await READY_P;
}

async function getData(urlPath, retry) {
  await ensureReady();
  const isSearch = urlPath.includes('/search/') || urlPath.includes('/cinema/');
  let path;
  let url;
  if (isSearch) {
    path = decSafe(urlPath) + PATH2;
    url = HOST2 + urlPath + PATH2;
  } else {
    const p = urlPath.replace('?', '.capi?');
    path = decSafe(p) + PATH1;
    url = HOST1 + p + PATH1;
  }
  const ts = String(Date.now());
  const q = path.split('?');
  const signStr = 'get|' + q[0] + '|' + paixu(q[1] || '') + '|' + ts + '|' + buildSuffix();
  const r = await binGet(url, { headers: buildHeaders(ts, hmac(signStr)), timeout: 20000 });
  if (r.status !== 200 || !r.buf.length) {
    if (retry !== false) {
      await anonymousLogin(true);
      return getData(urlPath, false);
    }
    return null;
  }
  const j = decryptPayload(r.buf);
  if (!j) {
    if (retry !== false) {
      await anonymousLogin(true);
      return getData(urlPath, false);
    }
    return null;
  }
  const code = Number(j.code);
  if (code && code !== 200) {
    if (retry !== false && (code === 401 || code === 403 || /登录|token|授权/i.test(str(j.msg)))) {
      await anonymousLogin(true);
      return getData(urlPath, false);
    }
    console.log('[网飞猫] 接口返回', code, str(j.msg).slice(0, 120));
    return null;
  }
  return unwrap(j);
}

// ---------------------------------------------------------------- 数据映射
function imageBase(group) {
  return GROUPS[group] || GROUPS.vod1 || '';
}

function picUrl(path, group) {
  const s = str(path).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const base = imageBase(group || 'vod1');
  if (!base) return s;
  return base.replace(/\/+$/, '') + (s.startsWith('/') ? s : '/' + s);
}

function mapItem(it) {
  if (!it || typeof it !== 'object') return null;
  // 首页的「每日推荐」里混着 article/detail 的图文帖（id 会与 vodId 撞车），
  // 只接受真正的 vod 详情地址：url=vod/detail?vodId=... 或带 vodId 字段。
  const itUrl = str(it.url);
  const isVodUrl = /(^|\/)vod\/detail\?vodId=/.test(itUrl);
  if (!it.vodId && !isVodUrl) return null;
  let id = it.vodId || it.id || '';
  if (!id && itUrl) {
    const m = itUrl.match(/vodId=([^&]+)/);
    if (m) id = m[1];
  }
  const name = stripTags(it.title || it.name || '');
  if (!id || !name) return null;
  return {
    vod_id: str(id),
    vod_name: safeName(name),
    vod_pic: picUrl(it.imagePath || it.coverPath || '', it.imageGroup),
    vod_remarks: stripTags(it.bottomLabel || it.dateLabel || it.topLeftLabel || ''),
    type_name: Array.isArray(it.labels) ? it.labels.map((x) => stripTags(x && x.name)).filter(Boolean).join(',') : '',
  };
}

function mapList(arr) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const one = mapItem(it);
    if (!one || seen.has(one.vod_id)) continue;
    seen.add(one.vod_id);
    out.push(one);
  }
  return out;
}

function buildFilters() {
  const genres = [
    ['', '全部'], ['action', '动作'], ['comedy', '喜剧'], ['romance', '爱情'], ['sci-fi', '科幻'],
    ['mystery', '悬疑'], ['horror', '恐怖'], ['drama', '剧情'], ['war', '战争'], ['crime', '犯罪'],
    ['fantasy', '奇幻'], ['adventure', '冒险'], ['animation', '动画'], ['documentary', '纪录片'],
  ].map(([v, n]) => ({ n, v }));
  const areas = [['', '全部'], ['大陆', '大陆'], ['香港', '香港'], ['台湾', '台湾'], ['美国', '美国'], ['韩国', '韩国'], ['日本', '日本'], ['英国', '英国'], ['泰国', '泰国'], ['其他', '其他']].map(([v, n]) => ({ n, v }));
  const years = [{ n: '全部', v: '' }];
  const now = new Date().getFullYear();
  for (let y = now; y >= now - 15; y -= 1) years.push({ n: String(y), v: String(y) });
  years.push({ n: '更早', v: '2000' });
  const sorts = [{ n: '最新', v: '1' }, { n: '最热', v: '2' }, { n: '推荐', v: '3' }];
  const one = [
    { key: 'class', name: '类型', value: genres },
    { key: 'area', name: '地区', value: areas },
    { key: 'year', name: '年份', value: years },
    { key: 'sort', name: '排序', value: sorts },
  ];
  const out = {};
  for (const c of CLASSES) out[c.type_id] = one;
  return out;
}

// ---------------------------------------------------------------- 业务
async function homeList() {
  const data = await getData('/v4/vod/home?');
  const blocks = (data && data.blocks) || [];
  const out = [];
  const seen = new Set();
  for (const block of blocks) {
    if (!block || !Array.isArray(block.data)) continue;
    for (const it of block.data) {
      const one = mapItem(it);
      if (!one || seen.has(one.vod_id)) continue;
      seen.add(one.vod_id);
      out.push(one);
      if (out.length >= 100) return out;
    }
  }
  return out;
}

async function categoryList(tid, page, extend) {
  const ext = extend || {};
  const enc = (v) => encodeURIComponent(str(v));
  const q = 'channelId=' + enc(tid) +
    '&sort=' + enc(ext.sort || '1') +
    '&category=' + enc(ext.class || ext.category || '') +
    '&area=' + enc(ext.area || '') +
    '&language=' + enc(ext.language || '') +
    '&year=' + enc(ext.year || '') +
    '&next=' + encodeURIComponent('page=' + page) + '&';
  const data = await getData('/vod/channel/list?' + q);
  const list = mapList(data && data.items);
  const hasNext = !!(data && data.next);
  return {
    page,
    pagecount: hasNext ? page + 1 : page,
    limit: list.length,
    total: parseInt(data && data.total, 10) || (hasNext ? 9999 : list.length),
    list,
  };
}

async function detailData(id) {
  const data = await getData('/v2/vod/detail?vodId=' + encodeURIComponent(id) + '&');
  if (!data || !data.id) return null;
  const vod = {
    vod_id: str(data.id),
    vod_name: safeName(data.title || ''),
    vod_pic: picUrl(data.imagePath || '', data.imageGroup),
    vod_content: stripTags(data.summary || ''),
    vod_remarks: stripTags(data.bottomLabel || data.topLeftLabel || ''),
    vod_score: str(data.scoreText || data.score || ''),
    vod_year: str(data.year || (data.premiereDate ? String(data.premiereDate).split('-')[0] : '')),
    vod_area: str(data.area || ''),
    vod_actor: Array.isArray(data.actors) ? data.actors.map((x) => stripTags(x && x.name)).filter(Boolean).join(',') : '',
    vod_director: Array.isArray(data.directors) ? data.directors.map((x) => stripTags(x && x.name)).filter(Boolean).join(',') : '',
    type_name: Array.isArray(data.labels) ? data.labels.map((x) => stripTags(x && x.name)).filter(Boolean).join(',') : '',
    vod_play_from: '',
    vod_play_url: '',
  };

  const froms = [];
  const urls = [];
  for (const source of data.playSources || []) {
    const eps = [];
    const seen = new Set();
    for (const item of (source && source.list) || []) {
      const rawUrl = item && item.playUrls && item.playUrls[0] ? item.playUrls[0].url : '';
      let u = str(rawUrl).replace(/&amp;/g, '&').trim();
      if (u.startsWith('//')) u = 'https:' + u;
      if (!u || seen.has(u)) continue;
      seen.add(u);
      const nm = safeName(item.title || ('第' + (eps.length + 1) + '集')) || '正片';
      eps.push(nm + '$' + u);
    }
    if (!eps.length) continue;
    froms.push(safeName(source.name || ('线路' + (froms.length + 1))) || ('线路' + (froms.length + 1)));
    urls.push(eps.join('#'));
  }
  const magnet = str(data.magnetUrl || '').trim();
  if (magnet) {
    froms.push('磁力');
    urls.push('磁力$' + magnet.replace(/&amp;/g, '&'));
  }
  vod.vod_play_from = froms.join('$$$');
  vod.vod_play_url = urls.join('$$$');
  return vod;
}

async function searchList(wd, page) {
  const q = 'channelId=0&k=' + encodeURIComponent(wd) + '&next=' + encodeURIComponent('page=' + page) + '&';
  const data = await getData('/vod/search/query?' + q);
  return mapList(data && data.items);
}

// ---------------------------------------------------------------- 播放
function noteOf(message) {
  return message ? { note: message } : {};
}

async function probeMedia(url, ref) {
  try {
    const r = await binGet(url, {
      headers: {
        'User-Agent': UA,
        Referer: ref || HOST1 + '/',
        Range: 'bytes=0-1024',
      },
      timeout: 15000,
    });
    if (r.status !== 200 && r.status !== 206) return false;
    if (/mpegurl|video|octet-stream|dash|mp2t/i.test(str(r.headers['content-type']))) return true;
    return /#EXTM3U|<MPD|<video/i.test(r.buf.toString('utf8').slice(0, 512));
  } catch (e) {
    return false;
  }
}

async function playOf(raw) {
  let id = str(raw).trim();
  if (id.includes('$')) id = id.slice(id.lastIndexOf('$') + 1).trim();
  try { id = decodeURIComponent(id); } catch (e) { /* 保持原样 */ }
  if (!id) return { parse: 1, url: '', ...noteOf('缺少播放地址') };
  const header = { 'User-Agent': UA, Referer: HOST1 + '/' };
  if (/(magnet:|ed2k:|ftp:|push:\/\/)/i.test(id)) {
    return { parse: 1, url: id, header, ...noteOf('磁力/网盘链接，不是 m3u8/mp4 直链') };
  }
  if (!/^https?:\/\//i.test(id)) {
    return { parse: 1, url: id, header, ...noteOf('不是 http(s) 媒体地址') };
  }
  if (await probeMedia(id)) return { parse: 0, url: id, header };
  return { parse: 1, url: id, header, ...noteOf('未探测到可用的 m3u8/mp4（HTTP 非 200/206 或内容不是媒体）') };
}

// ---------------------------------------------------------------- 模块入口
export default function createSpider() {
  return {
  meta: { key: 'py_netflix_cat', name: '🌐飞猫- 极速', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },

  api: async (fastify) => {
    fastify.post('/init', async () => {
      await ensureReady();
      return {};
    });

    fastify.post('/home', async () => {
      try {
        await ensureReady();
        return { class: CLASSES, filters: buildFilters(), list: await homeList() };
      } catch (e) {
        console.log('[网飞猫] home 失败', str((e && e.message) || e));
        return { class: CLASSES, filters: buildFilters(), list: [] };
      }
    });

    fastify.post('/category', async (request) => {
      const body = bodyOf(request);
      const tid = str(body.id || body.tid || body.type_id || '1').trim() || '1';
      const page = Math.max(1, parseInt(body.page || body.pg, 10) || 1);
      try {
        await ensureReady();
        return await categoryList(tid, page, body.extend || body.filters || body.ext || {});
      } catch (e) {
        console.log('[网飞猫] category 失败', str((e && e.message) || e));
        return { page, pagecount: page, limit: 0, total: 0, list: [] };
      }
    });

    fastify.post('/detail', async (request) => {
      const body = bodyOf(request);
      const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids || body.vod_id || '';
      const id = str(raw).trim();
      if (!id) return { list: [] };
      try {
        await ensureReady();
        const vod = await detailData(id);
        return { list: vod ? [vod] : [] };
      } catch (e) {
        console.log('[网飞猫] detail 失败', str((e && e.message) || e));
        return { list: [] };
      }
    });

    fastify.post('/search', async (request) => {
      const body = bodyOf(request);
      const wd = str(body.wd || body.keyword || body.searchKey || '').trim();
      const page = Math.max(1, parseInt(body.page || body.pg, 10) || 1);
      if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };
      try {
        await ensureReady();
        const list = await searchList(wd, page);
        return { page, pagecount: list.length >= 20 ? page + 1 : page, limit: list.length, total: list.length, list };
      } catch (e) {
        console.log('[网飞猫] search 失败', str((e && e.message) || e));
        return { page, pagecount: page, limit: 0, total: 0, list: [] };
      }
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
