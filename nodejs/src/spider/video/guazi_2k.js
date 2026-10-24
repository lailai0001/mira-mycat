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

// 瓜子影视 · 瓜子APP —— CatPaw 模块
// 原规则是 hipy/Java 版加密 App 接口：AES-128-CBC 业务体 + RSA(PKCS1v1.5) 换密钥 + MD5 签名。
// 这里用 node:crypto 原样复刻，网络只走引擎全局 req。

const AES_KEY = 'OITxa5OqAYjhswxx';
const AES_IV = 'rCMNwZASNBKZ8mXV';
const RSA_PUBLIC =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUM5+/y8sPsWkd1/RQS64X259EUwxFXFE5HlA65MqrxnPs0JqoSRojSDy5QhwvROlaD6TwRQHKMY2OAZ6SnQeUJsChTEFIR9qUkwrs3/MVUMxjsv6JS6Oe/juclyJGTgVmDhB55EafXsD0SQYVj/QXXsxR6ewR5E2kL52yAAD4yQIDAQAB';
const RSA_PRIVATE = `-----BEGIN RSA PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGAe6hKrWLi1zQmjTT1
ozbE4QdFeJGNxubxld6GrFGximxfMsMB6BpJhpcTouAqywAFppiKetUBBbXwYsYU
1wNr648XVmPmCMCy4rY8vdliFnbMUj086DU6Z+/oXBdWU3/b1G0DN3E9wULRSwcK
ZT3wj/cCI1vsCm3gj2R5SqkA9Y0CAwEAAQKBgAJH+4CxV0/zBVcLiBCHvSANm0l7
HetybTh/j2p0Y1sTXro4ALwAaCTUeqdBjWiLSo9lNwDHFyq8zX90+gNxa7c5EqcW
V9FmlVXr8VhfBzcZo1nXeNdXFT7tQ2yah/odtdcx+vRMSGJd1t/5k5bDd9wAvYdI
DblMAg+wiKKZ5KcdAkEA1cCakEN4NexkF5tHPRrR6XOY/XHfkqXxEhMqmNbB9U34
saTJnLWIHC8IXys6Qmzz30TtzCjuOqKRRy+FMM4TdwJBAJQZFPjsGC+RqcG5UvVM
iMPhnwe/bXEehShK86yJK/g/UiKrO87h3aEu5gcJqBygTq3BBBoH2md3pr/W+hUM
WBsCQQChfhTIrdDinKi6lRxrdBnn0Ohjg2cwuqK5zzU9p/N+S9x7Ck8wUI53DKm8
jUJE8WAG7WLj/oCOWEh+ic6NIwTdAkEAj0X8nhx6AXsgCYRql1klbqtVmL8+95KZ
K7PnLWG/IfjQUy3pPGoSaZ7fdquG8bq8oyf5+dzjE/oTXcByS+6XRQJAP/5ciy1b
L3NhUhsaOVy55MHXnPjdcTX0FaLi+ybXZIfIQ2P4rb19mVq1feMbCXhz+L1rG8oa
t5lYKfpe8k83ZA==
-----END RSA PRIVATE KEY-----`;
const OLD_KEY = 'aLFBMWpxBrIDAD1Si/KVvm41';
const SIGN_SALT = '*&zvdvdvddbfikkkumtmdwqppp?|4Y!s!2br';
const UA = 'Lavf/57.83.100';
const HOSTS = [
  'https://apinew.uozvr.com',
  'https://api.w32z7vtd.com',
  'https://api.6a7nnf7.com',
  'https://api.umygrx3.com',
  'https://api.rmedphk.com',
];
const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '电视剧' },
  { type_id: '4', type_name: '动漫' },
  { type_id: '3', type_name: '综艺' },
  { type_id: '64', type_name: '短剧' },
];
const AREAS = ['全部', '大陆', '香港', '台湾', '美国', '韩国', '日本', '英国', '法国', '泰国', '印度', '其他'];
const YEARS = ['全部', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008', '2007', '2006', '2005', '更早'];
const SORTS = [
  { n: '最新', v: 'd_id' },
  { n: '最热', v: 'd_hits' },
  { n: '推荐', v: 'd_score' },
];
const FILTERS = {};
for (const c of CLASSES) {
  FILTERS[c.type_id] = [
    {
      key: 'area',
      name: '地区',
      value: AREAS.map((n, i) => ({ n, v: i === 0 ? '0' : n })),
    },
    {
      key: 'year',
      name: '年份',
      value: YEARS.map((n, i) => ({ n, v: i === 0 ? '0' : i === YEARS.length - 1 ? '2004' : n })),
    },
    { key: 'sort', name: '排序', value: SORTS },
  ];
}

const deviceId = String(864150060000000 + Math.floor(Math.random() * 10000));
const deviceKey = crypto.randomBytes(20).toString('hex').toUpperCase();
let token = '';
let tokenId = '';
let hostIndex = 0;
let authDone = false;
let authTask = null;

const aesEncrypt = (text) => {
  const c = crypto.createCipheriv('aes-128-cbc', Buffer.from(AES_KEY), Buffer.from(AES_IV));
  return Buffer.concat([c.update(String(text), 'utf8'), c.final()]).toString('hex').toUpperCase();
};
const aesDecrypt = (hex, key, iv) => {
  const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv));
  return Buffer.concat([d.update(Buffer.from(String(hex), 'hex')), d.final()]).toString('utf8');
};
const rsaEncrypt = (text) => {
  const pem = '-----BEGIN PUBLIC KEY-----\n' + RSA_PUBLIC + '\n-----END PUBLIC KEY-----';
  return crypto
    .publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(text), 'utf8'))
    .toString('base64');
};
const rsaDecrypt = (b64) =>
  crypto
    .privateDecrypt({ key: RSA_PRIVATE, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(b64), 'base64'))
    .toString('utf8');
const md5 = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex').toUpperCase();
const clean = (s) =>
  String(s == null ? '' : s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

async function post(host, path, data) {
  const requestKey = aesEncrypt(JSON.stringify(data));
  const keys = rsaEncrypt(JSON.stringify({ iv: AES_IV, key: AES_KEY }));
  const time = String(Math.floor(Date.now() / 1000));
  const signature = md5(
    'token_id=,token=' + token + ',phone_type=1,request_key=' + requestKey +
      ',app_id=1,time=' + time + ',keys=' + keys + SIGN_SALT
  );
  const body = new URLSearchParams({
    token,
    token_id: '',
    phone_type: '1',
    time,
    phone_model: 'xiaomi-25031',
    keys,
    request_key: requestKey,
    signature,
    app_id: '1',
    ad_version: '1',
  }).toString();
  const headers = {
    'User-Agent': UA,
    code: 'GZ0369',
    deviceId,
    lang: 'zh_cn',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
    Version: '2604028',
    PackageName: 'com.ae06aebdbb.y286327f5a.ofe849883320260517',
    Ver: '3.0.3.2',
    'api-ver': '3.0.3.2',
    Referer: host,
  };
  const res = await httpReq(host + path, { method: 'POST', headers, body, timeout: 15000 });
  const status = res && res.status;
  if (status && status >= 400) throw new Error('HTTP ' + status);
  return String(res && res.content != null ? res.content : res);
}

async function call(data, path) {
  let lastError;
  for (let i = 0; i < HOSTS.length; i++) {
    const idx = (hostIndex + i) % HOSTS.length;
    const host = HOSTS[idx];
    try {
      const parsed = JSON.parse(await post(host, path, data));
      if (parsed.code !== 200) throw new Error('biz ' + parsed.code + ' ' + (parsed.msg || ''));
      const info = JSON.parse(rsaDecrypt(parsed.data.keys));
      const plain = aesDecrypt(parsed.data.response_key, info.key, info.iv);
      hostIndex = idx;
      return JSON.parse(plain);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('all hosts failed');
}

async function authenticate() {
  if (authDone) return;
  if (authTask) return authTask;
  authTask = (async () => {
    token = '';
    tokenId = '';
    const up = await call(
      { new_key: deviceKey, old_key: OLD_KEY, phone_type: 1, code: '' },
      '/App/Authentication/Device/signUp'
    );
    if (!up || !up.token) throw new Error('signUp 未返回 token');
    token = up.token;
    tokenId = up.app_user_id || '';
    try {
      const rf = await call({}, '/App/Authentication/Authenticator/refresh');
      if (rf && rf.token) token = rf.token;
      if (rf && rf.app_user_id) tokenId = rf.app_user_id;
    } catch (e) {
      /* refresh 失败时 signUp 的 token 仍然可用 */
    }
    authDone = true;
  })().finally(() => {
    authTask = null;
  });
  return authTask;
}

async function send(data, path) {
  if (!authDone) await authenticate();
  try {
    return await call(data, path);
  } catch (e) {
    authDone = false;
    token = '';
    tokenId = '';
    await authenticate();
    return await call(data, path);
  }
}

const remarksOf = (item) => {
  const cont = Number(item && item.vod_continu) || 0;
  return cont > 0 ? '更新至' + cont + '集' : '电影';
};

function mapItem(item) {
  const cont = Number(item && item.vod_continu) || 0;
  return {
    vod_id: String((item && item.vod_id) || '') + '/' + cont,
    vod_name: String((item && item.vod_name) || ''),
    vod_pic: String((item && item.vod_pic) || ''),
    vod_remarks: remarksOf(item),
  };
}

async function home() {
  let list = [];
  try {
    const first = await send(
      { area: '0', year: '0', pageSize: '24', sort: 'd_id', page: '1', tid: '1' },
      '/App/IndexList/indexList'
    );
    list = (first.list || []).map(mapItem);
  } catch (e) {
    try {
      const second = await send(
        { area: '0', year: '0', pageSize: '24', sort: 'd_id', page: '1', tid: '2' },
        '/App/IndexList/indexList'
      );
      list = (second.list || []).map(mapItem);
    } catch (err) {
      /* 留空，不拖垮站点 */
    }
  }
  return { class: CLASSES, filters: FILTERS, list };
}

async function category(b) {
  const tid = String(b.id || b.tid || b.type_id || '1');
  const page = Math.max(1, parseInt(b.page || b.pg || 1, 10) || 1);
  const ext = b.extend || b.filters || {};
  const data = await send(
    {
      area: String(ext.area || '0'),
      year: String(ext.year || '0'),
      pageSize: '30',
      sort: String(ext.sort || 'd_id'),
      page: String(page),
      tid,
    },
    '/App/IndexList/indexList'
  );
  const list = (data.list || []).map(mapItem);
  const total = Number(data.total) || 0;
  return {
    list,
    page,
    pagecount: total ? Math.max(1, Math.ceil(total / 30)) : page + (list.length >= 30 ? 1 : 0),
    limit: 30,
    total: total || 9999,
  };
}

async function search(b) {
  const wd = String(b.wd || b.keyword || b.key || '').trim();
  const page = Math.max(1, parseInt(b.page || b.pg || 1, 10) || 1);
  if (!wd) return { list: [], page, pagecount: page, limit: 20, total: 0 };
  const data = await send({ keywords: wd, order_val: '1', page: String(page) }, '/App/Index/findMoreVod');
  const list = (data.list || []).map(mapItem);
  return { list, page, pagecount: page + (list.length >= 20 ? 1 : 0), limit: 20, total: list.length >= 20 ? 9999 : list.length };
}

async function detail(b) {
  const raw = String(b.id || b.ids || b.url || '');
  const vodId = raw.split('/')[0].replace(/[^\d]/g, '');
  if (!vodId) return [];
  const time = String(Math.floor(Date.now() / 1000));
  const info = await send(
    { token_id: tokenId, vod_id: vodId, mobile_time: time, token },
    '/App/IndexPlay/playInfo'
  );
  if (!info || !info.vodInfo) return [];
  const vod = info.vodInfo;

  let vurl = null;
  try {
    vurl = await send({ vurl_cloud_id: '2', vod_d_id: vodId }, '/App/Resource/Vurl/show');
  } catch (e) {
    vurl = null;
  }

  const episodes = [];
  (vurl && vurl.list ? vurl.list : []).forEach((item, index) => {
    const play = item && item.play;
    if (!play) return;
    const resolutions = [];
    let bestParam = '';
    let bestRes = -1;
    for (const key of Object.keys(play)) {
      const value = play[key];
      if (!value || !value.param) continue;
      resolutions.push(key);
      const res = parseInt(key, 10) || 0;
      if (res >= bestRes) {
        bestRes = res;
        bestParam = value.param;
      }
    }
    if (!bestParam) return;
    const name = String(item.title || '').trim() || String(index + 1);
    episodes.push(name + '$' + bestParam + '||' + resolutions.join('@'));
  });

  const year = String(vod.vod_year || '').slice(0, 4);
  return [
    {
      vod_id: vodId,
      vod_name: String(vod.vod_name || ''),
      vod_pic: String(vod.vod_pic || ''),
      vod_year: year,
      vod_area: String(vod.vod_area || ''),
      vod_actor: String(vod.vod_actor || ''),
      vod_director: String(vod.vod_director || ''),
      vod_content: clean(vod.vod_use_content || ''),
      vod_remarks: String(vod.new_continue || ''),
      vod_play_from: '瓜子影视',
      vod_play_url: episodes.join('#'),
    },
  ];
}

async function play(b) {
  const id = String(b.id || b.url || b.ids || '');
  if (/^https?:\/\//i.test(id) && /\.(m3u8|mp4)(\?|$)/i.test(id)) return { parse: 0, url: id };
  const parts = id.split('||');
  if (parts.length < 2) return { parse: 0, url: '' };

  const params = {};
  for (const pair of parts[0].split('&')) {
    const i = pair.indexOf('=');
    if (i > 0) params[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const resolutions = parts[1]
    .split('@')
    .filter(Boolean)
    .sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0));
  if (!resolutions.length) return { parse: 0, url: '' };
  params.resolution = resolutions[0];

  const data = await send(params, '/App/Resource/VurlDetail/showOne');
  if (!data || !data.url) return { parse: 1, url: '' };
  return {
    parse: 0,
    url: String(data.url),
    header: { 'User-Agent': UA, Referer: 'http://WJiZxLXA2.com/' },
  };
}

export default function createSpider() {
  return {
  meta: { key: 'py_guazi_2k', name: '🌰瓜子 - 2K', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
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
