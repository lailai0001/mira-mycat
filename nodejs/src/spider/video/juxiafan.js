import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_juxiafan';
const NAME = '剧下饭';

const BASE_URLS = [
  'http://manian.juxiafan.com',
  'http://195.225.24.128:6213',
  'http://jugaoqing.com',
  'http://jumianfei.com',
  'http://juyongjiu.com',
  'http://kuailezhuiju2.com',
  'http://zhuiju666.com',
  'http://194.147.100.155:7744',
];
const AES_KEY = Buffer.from('kZ6fT8oF6oM8eX6lF7eH2rJ3pW7gW0kC', 'utf8');
const UA = 'okhttp/4.12.0';
const LIVE_TYPE_ID = '22023'; // 隐藏直播分类(服务端不下发, 手动补进分类栏)
const TIMEOUT = 22000;

let HOST = BASE_URLS[0];

// ================= 双通道请求: 先框架 req, 失败再 fetch =================
function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { ctrl, done: () => clearTimeout(timer) };
}

async function postText(url, body, contentType) {
  const headers = { 'User-Agent': UA };
  if (contentType) headers['Content-Type'] = contentType;
  try {
    const { data } = await req.post(url, body || '', { headers, timeout: TIMEOUT, responseType: 'text' });
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) {
    const t = withTimeout(TIMEOUT);
    try {
      const r = await fetch(url, { method: 'POST', headers, body: body || '', signal: t.ctrl.signal });
      return await r.text();
    } finally { t.done(); }
  }
}

async function getText(url) {
  try {
    const { data } = await req.get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT, responseType: 'text' });
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) {
    const t = withTimeout(TIMEOUT);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: t.ctrl.signal });
      return await r.text();
    } finally { t.done(); }
  }
}

// ================= AES-256-ECB(与 Python 纯实现输出一致) =================
function aesEncryptBase64(plaintext) {
  const data = Buffer.from(String(plaintext), 'utf8');
  const pad = 16 - (data.length % 16);
  const padded = Buffer.concat([data, Buffer.alloc(pad, pad)]); // PKCS7
  const c = crypto.createCipheriv('aes-256-ecb', AES_KEY, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(padded), c.final()]).toString('base64');
}

// 与 Python urllib.parse.quote_plus 等价: 空格->+, 并转义 !'()*
function quotePlus(s) {
  return encodeURIComponent(String(s))
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

function fixHost(h) {
  const s = String(h || '').trim().replace(/\/+$/, '');
  return s || BASE_URLS[0];
}

// form 表单签名: 参数+timestamp 按 key 排序, 拼接后 AES 加密得 datasign
function signFormBody(params) {
  const ts = String(Math.floor(Date.now() / 1000));
  const p = { ...(params || {}), timestamp: ts };
  const keys = Object.keys(p).sort();
  const concat = keys.map((k) => k + '=' + quotePlus(p[k])).join('&');
  const ds = aesEncryptBase64(concat);
  return keys.map((k) => k + '=' + quotePlus(p[k])).join('&') + '&datasign=' + quotePlus(ds);
}

// json 签名: 参数+timestamp 按 key 排序(原始值拼接), body 为 JSON
function signJsonBody(params) {
  const ts = String(Math.floor(Date.now() / 1000));
  const p = { ...(params || {}), timestamp: ts };
  const keys = Object.keys(p).sort();
  const concat = keys.map((k) => k + '=' + String(p[k])).join('&');
  const ds = aesEncryptBase64(concat);
  const obj = {};
  for (const k of keys) obj[k] = p[k];
  obj.datasign = ds;
  return JSON.stringify(obj);
}

// 带多域名 failover 的 POST: 依次尝试各域名, 返回首个含 "code" 的响应
async function postFailover(path, body, contentType) {
  const urls = [fixHost(HOST)];
  for (const b of BASE_URLS) if (!urls.includes(b)) urls.push(b);
  let last = '{}';
  for (const u of urls) {
    try {
      const t = await postText(u + path, body, contentType);
      if (t && t.includes('"code"')) { HOST = u; return t; }
      last = t || last;
    } catch (e) { /* 换下一个域名 */ }
  }
  return last;
}

async function getFailover(path) {
  const urls = [fixHost(HOST)];
  for (const b of BASE_URLS) if (!urls.includes(b)) urls.push(b);
  let last = '{}';
  for (const u of urls) {
    try {
      const t = await getText(u + path);
      if (t && t.includes('"code"')) { HOST = u; return t; }
      last = t || last;
    } catch (e) { /* 换下一个域名 */ }
  }
  return last;
}

function safeJson(t) {
  try { return JSON.parse(t); } catch (e) { return {}; }
}

// ================= 业务 =================
async function home() {
  let cls = [];
  try {
    const j = safeJson(await postFailover('/api/v1/video/classifies', null, null));
    const data = j.data || [];
    cls = data
      .filter((c) => c && c.id && c.name)
      .map((c) => ({ type_id: String(c.id), type_name: String(c.name) }));
    cls.sort((a, b) => (parseInt(a.type_id, 10) || 1e9) - (parseInt(b.type_id, 10) || 1e9));
  } catch (e) { /* keep empty */ }
  // 服务端不下发隐藏直播分类(22023), 手动追加到分类栏末尾
  if (!cls.some((c) => c.type_id === LIVE_TYPE_ID)) {
    cls.push({ type_id: LIVE_TYPE_ID, type_name: '直播' });
  }
  return { class: cls, filters: {}, list: [] };
}

function buildList(resp, page, idDesc) {
  const j = safeJson(resp);
  const data = (j && j.data) || {};
  const list = [];
  for (const v of data.list || []) {
    if (!v || !v.id) continue;
    list.push({
      vod_id: String(v.id),
      vod_name: v.name || '',
      vod_pic: v.videoPic || '',
      vod_remarks: v.remarks || '',
    });
  }
  if (idDesc && list.length) {
    list.sort((a, b) => (parseInt(b.vod_id, 10) || 0) - (parseInt(a.vod_id, 10) || 0));
  }
  const pg = parseInt(page, 10) || 1;
  let pagecount = parseInt(data.totalPage, 10) || 1;
  if (pagecount < pg) pagecount = pg;
  return {
    page: pg,
    pagecount,
    limit: data.limit || 20,
    total: data.totalCount || 0,
    list,
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(body.tid ?? body.id ?? '22016').trim();
  const pg = Math.max(1, parseInt(body.page, 10) || 1);
  // ---- 直播分类 22023: 走 liveVideo 接口 ----
  if (tid === LIVE_TYPE_ID) {
    const list = [];
    try {
      const j = safeJson(await getFailover('/api/v1/video/liveVideo'));
      const data = (j && j.data) || {};
      for (const v of data.list || []) {
        if (!v || !v.id) continue;
        list.push({
          vod_id: String(v.id),
          vod_name: v.name || '',
          vod_pic: v.videoPic || '',
          vod_remarks: v.remarks || (v.typeId ? '直播' : ''),
        });
      }
    } catch (e) { /* keep empty */ }
    return { page: 1, pagecount: 1, limit: list.length, total: list.length, list };
  }
  // 注意: 服务端忽略 page 参数, 必须用 pageNum 才能真正翻页
  const resp = await postFailover('/api/v1/video/index',
    signJsonBody({ pageNum: pg, typeId: parseInt(tid, 10) || 0 }), 'application/json;charset=UTF-8');
  let res = buildList(resp, pg, false);
  // 服务端把部分分类降级为只返回少量条目, 此时用 /video/search 空关键词+typeId 兜底
  if (res.list.length < 10) {
    const resp2 = await postFailover('/api/v1/video/search',
      signJsonBody({ keyword: '', typeId: parseInt(tid, 10) || 0, pageNum: pg }), 'application/json;charset=UTF-8');
    res = buildList(resp2, pg, true);
  }
  return res;
}

async function fetchDetail(vid) {
  try {
    const j = safeJson(await postFailover('/api/v1/video/videoDetails',
      signFormBody({ id: String(vid) }), 'application/x-www-form-urlencoded'));
    return (j && j.data) || {};
  } catch (e) { return {}; }
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const vid = String(body.id ?? '').trim();
  if (!vid) return { list: [] };
  const data = await fetchDetail(vid);
  if (!data || !data.id) return { list: [] };
  const sources = data.playerSource || [];
  const fromNames = [], fromUrlLists = [];
  const seen = {};
  for (const src of sources) {
    const eps = src.episodes || [];
    if (!eps.length) continue;
    let name = src.sourceName || '剧下饭';
    if (seen[name]) { seen[name] += 1; name = name + seen[name]; }
    else seen[name] = 1;
    const segs = [];
    eps.forEach((ep, i) => {
      const epName = String((ep && ep.episodeName) || ('第' + (i + 1) + '集')).replace(/\$/g, '_').replace(/#/g, '_');
      segs.push(epName + '$' + vid + '_' + (i + 1));
    });
    fromNames.push(name);
    fromUrlLists.push(segs.join('#'));
  }
  if (!fromUrlLists.length) return { list: [] };
  return {
    list: [{
      vod_id: String(data.id || vid),
      vod_name: data.name || '',
      vod_pic: data.videoPic || '',
      vod_actor: data.actor || '',
      vod_director: data.director || '',
      vod_remarks: data.remarks || '',
      vod_content: data.content || '',
      vod_year: data.year || '',
      vod_area: data.area || '',
      vod_play_from: fromNames.join('$$$'),
      vod_play_url: fromUrlLists.join('$$$'),
    }],
  };
}

async function analysisUrl(sourceCode, pc) {
  if (!sourceCode || !pc) return '';
  try {
    const j = safeJson(await postFailover('/api/v1/player/analysisUrl',
      signFormBody({ from: sourceCode, code: pc }), 'application/x-www-form-urlencoded'));
    const u = (j && j.data) || '';
    if (String(u).startsWith('http')) return String(u);
  } catch (e) { /* fall through */ }
  return '';
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const flag = String(body.flag ?? '').trim();
  const pid = String(body.id ?? '').trim();
  const fail = { parse: 0, url: '', header: { 'User-Agent': UA } };
  const m = pid.match(/^(.*)_(\d+)$/);
  if (!m) return { parse: 0, url: pid, header: { 'User-Agent': UA } };
  const vid = m[1], ep = parseInt(m[2], 10);
  const data = await fetchDetail(vid);
  const sources = data.playerSource || [];
  const ordered = sources.filter((s) => String(s.sourceName || '').trim() === flag);
  for (const s of sources) if (!ordered.includes(s)) ordered.push(s);
  for (const src of ordered) {
    const eps = src.episodes || [];
    if (!eps.length || ep > eps.length) continue;
    const pc = String((eps[ep - 1] || {}).playerCode || '');
    const parseUrl = src.parseUrl || '';
    const sourceCode = src.sourceCode || '';
    if (parseUrl && pc) {
      try {
        const j = safeJson(await getText(parseUrl + pc));
        const u = (j && j.url) || '';
        if (u) return { parse: 0, url: u, header: { 'User-Agent': UA } };
      } catch (e) { /* fall through */ }
    }
    // 直播/加密 code: 优先走服务端 analysisUrl 秒播解析
    if (pc && !pc.startsWith('http')) {
      const u = await analysisUrl(sourceCode, pc);
      if (u) {
        const headers = { 'User-Agent': UA };
        if (sourceCode === 'huya') headers.Referer = 'https://www.huya.com/';
        return { parse: 0, url: u, header: headers };
      }
      // 解析失败: 仍把 code 原样返回, 交由播放器自行尝试
      return { parse: 0, url: pc, header: { 'User-Agent': UA } };
    } else if (pc) {
      return { parse: 0, url: pc, header: { 'User-Agent': UA } };
    }
  }
  return fail;
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  let key = String(body.wd ?? body.key ?? '').trim().replace(/^["']|["']$/g, '');
  const pg = Math.max(1, parseInt(body.page, 10) || 1);
  if (!key) return { page: pg, pagecount: pg, limit: 20, total: 0, list: [] };
  // 兼容播放器传入 URL 编码关键词
  if (key.includes('%')) {
    try { const dec = decodeURIComponent(key); if (dec && dec !== key) key = dec.trim(); } catch (e) { /* ignore */ }
  }
  // 兼容 \uXXXX 转义形态关键词
  if (key.includes('\\u') && /^[\x00-\x7f]*$/.test(key)) {
    try { key = JSON.parse('"' + key.replace(/"/g, '\\"') + '"'); } catch (e) { /* ignore */ }
  }
  const resp = await postFailover('/api/v1/video/search',
    signJsonBody({ keyword: key, pageNum: pg }), 'application/json;charset=UTF-8');
  return buildList(resp, pg, true);
}

async function init(reqIn) {
  const extend = reqIn?.body?.extend ?? reqIn?.body ?? '';
  const s = String(extend || '').trim();
  if (s.startsWith('http')) HOST = fixHost(s);
  else if (s.startsWith('base=')) HOST = fixHost(s.slice(5));
  return {};
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
