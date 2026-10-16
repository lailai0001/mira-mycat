import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_guazi';
const NAME = '瓜子';

const HOSTS = [
  'https://apinew.uozvr.com',
  'https://api.w32z7vtd.com',
  'https://api.6a7nnf7.com',
  'https://api.umygrx3.com',
  'https://api.rmedphk.com',
];
const AES_KEY = 'OITxa5OqAYjhswxx';
const AES_IV = 'rCMNwZASNBKZ8mXV';
const DEVICE_OLD_KEY = 'aLFBMWpxBrIDAD1Si/KVvm41';
const UA = 'Lavf/57.83.100';
const TIMEOUT = 22000;

// RSA 公钥(请求 keys 字段加密用) / 私钥(响应 keys 字段解密用)
const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDUM5+/y8sPsWkd1/RQS64X259EUwxFXFE5HlA65MqrxnPs0JqoSRojSDy5QhwvROlaD6TwRQHKMY2OAZ6SnQeUJsChTEFIR9qUkwrs3/MVUMxjsv6JS6Oe/juclyJGTgVmDhB55EafXsD0SQYVj/QXXsxR6ewR5E2kL52yAAD4yQIDAQAB
-----END PUBLIC KEY-----`;
const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
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

const DEVICE_ID = String(864150060000000 + Math.floor(Math.random() * 10000));
const DEVICE_KEY = [...Array(40)].map(() => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');

let hostIndex = 0;
let token = '';
let tokenId = '';
let registered = false;
let authPromise = null;

// ================= 加解密 =================
function aesEncryptHex(text, key = AES_KEY, iv = AES_IV) {
  const c = crypto.createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
  return Buffer.concat([c.update(Buffer.from(String(text), 'utf8')), c.final()]).toString('hex').toUpperCase();
}
function aesDecryptHex(hexText, key, iv) {
  const c = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
  return Buffer.concat([c.update(Buffer.from(String(hexText), 'hex')), c.final()]).toString('utf8');
}
function rsaEncryptB64(text) {
  const enc = crypto.publicEncrypt(
    { key: RSA_PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(String(text), 'utf8'));
  return enc.toString('base64');
}
function rsaDecryptB64(b64) {
  const dec = crypto.privateDecrypt(
    { key: RSA_PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(String(b64), 'base64'));
  return dec.toString('utf8');
}
function md5Upper(text) {
  return crypto.createHash('md5').update(String(text), 'utf8').digest('hex').toUpperCase();
}

// ================= 双通道请求: 先框架 req, 失败再 fetch =================
function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { ctrl, done: () => clearTimeout(timer) };
}

async function postFormText(url, bodyStr, headers) {
  try {
    const { data } = await req.post(url, bodyStr, { headers, timeout: TIMEOUT, responseType: 'text' });
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) {
    const t = withTimeout(TIMEOUT);
    try {
      const r = await fetch(url, { method: 'POST', headers, body: bodyStr, signal: t.ctrl.signal });
      return await r.text();
    } finally { t.done(); }
  }
}

function baseHeaders(host) {
  return {
    'User-Agent': UA,
    'code': 'GZ0369',
    'deviceId': DEVICE_ID,
    'lang': 'zh_cn',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Version': '2604028',
    'PackageName': 'com.ae06aebdbb.y286327f5a.ofe849883320260517',
    'Ver': '3.0.3.2',
    'api-ver': '3.0.3.2',
    'Referer': host,
  };
}

// ================= 加密请求 / 设备认证 =================
async function sendEncrypted(data, path, host) {
  const requestKey = aesEncryptHex(JSON.stringify(data));
  const keys = rsaEncryptB64(JSON.stringify({ iv: AES_IV, key: AES_KEY }));
  const t = String(Math.floor(Date.now() / 1000));
  const signStr = 'token_id=,token=' + token + ',phone_type=1,request_key=' + requestKey
    + ',app_id=1,time=' + t + ',keys=' + keys + '*&zvdvdvddbfikkkumtmdwqppp?|4Y!s!2br';
  const form = new URLSearchParams({
    token, token_id: '', phone_type: '1', time: t, phone_model: 'xiaomi-25031',
    keys, request_key: requestKey, signature: md5Upper(signStr), app_id: '1', ad_version: '1',
  }).toString();
  const txt = await postFormText(host + path, form, baseHeaders(host));
  let j;
  try { j = JSON.parse(txt); } catch (e) { throw new Error('bad json'); }
  if (j.code !== 200) throw new Error('biz ' + j.code);
  const sec = j.data || {};
  if (!sec.response_key || !sec.keys) throw new Error('no data');
  const keyInfo = JSON.parse(rsaDecryptB64(sec.keys));
  return JSON.parse(aesDecryptHex(sec.response_key, keyInfo.key, keyInfo.iv));
}

function applyAuth(result) {
  if (!result || !result.token) throw new Error('no token');
  token = result.token;
  if (result.app_user_id) tokenId = result.app_user_id;
  registered = true;
}

async function doAuth() {
  const first = !registered;
  const r1 = await sendEncrypted(
    first
      ? { new_key: DEVICE_KEY, old_key: DEVICE_OLD_KEY, phone_type: 1, code: '' }
      : { new_key: DEVICE_KEY, old_key: DEVICE_OLD_KEY },
    first ? '/App/Authentication/Device/signUp' : '/App/Authentication/Device/signIn',
    HOSTS[hostIndex % HOSTS.length]);
  applyAuth(r1);
  const r2 = await sendEncrypted({}, '/App/Authentication/Authenticator/refresh', HOSTS[hostIndex % HOSTS.length]);
  applyAuth(r2);
}

async function ensureToken() {
  if (token && tokenId) return;
  if (!authPromise) {
    authPromise = doAuth().catch((e) => { throw e; }).finally(() => { authPromise = null; });
  }
  await authPromise;
}

// 带域名轮换 + 失败重认证的数据请求
async function getData(data, path, isAuth = false) {
  if (!isAuth) await ensureToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < HOSTS.length; i++) {
      const idx = (hostIndex + i) % HOSTS.length;
      try {
        const r = await sendEncrypted(data, path, HOSTS[idx]);
        hostIndex = idx;
        return r;
      } catch (e) { /* 换下一个域名 */ }
    }
    if (!isAuth && attempt < 2) {
      token = ''; tokenId = ''; registered = false;
      try { await ensureToken(); } catch (e) { /* ignore */ }
      hostIndex = 0;
    } else break;
  }
  return null;
}

// ================= 业务 =================
const CLASSES = [
  { type_name: '电影', type_id: '1' },
  { type_name: '电视剧', type_id: '2' },
  { type_name: '动漫', type_id: '4' },
  { type_name: '综艺', type_id: '3' },
  { type_name: '短剧', type_id: '64' },
];

function buildFilters() {
  const filters = {};
  for (const c of CLASSES) {
    filters[c.type_id] = [
      {
        key: 'area', name: '地区', value: [
          { n: '全部', v: '0' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' },
          { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '韩国', v: '韩国' },
          { n: '日本', v: '日本' }, { n: '英国', v: '英国' }, { n: '法国', v: '法国' },
          { n: '泰国', v: '泰国' }, { n: '印度', v: '印度' }, { n: '其他', v: '其他' },
        ],
      },
      {
        key: 'year', name: '年份', value: [
          { n: '全部', v: '0' }, { n: '2025', v: '2025' }, { n: '2024', v: '2024' },
          { n: '2023', v: '2023' }, { n: '2022', v: '2022' }, { n: '2021', v: '2021' },
          { n: '2020', v: '2020' }, { n: '2019', v: '2019' }, { n: '2018', v: '2018' },
          { n: '2017', v: '2017' }, { n: '2016', v: '2016' }, { n: '2015', v: '2015' },
          { n: '2014', v: '2014' }, { n: '2013', v: '2013' }, { n: '2012', v: '2012' },
          { n: '2011', v: '2011' }, { n: '2010', v: '2010' }, { n: '2009', v: '2009' },
          { n: '2008', v: '2008' }, { n: '2007', v: '2007' }, { n: '2006', v: '2006' },
          { n: '2005', v: '2005' }, { n: '更早', v: '2004' },
        ],
      },
      {
        key: 'sort', name: '排序', value: [
          { n: '最新', v: 'd_id' }, { n: '最热', v: 'd_hits' }, { n: '推荐', v: 'd_score' },
        ],
      },
    ];
  }
  return filters;
}

function toVod(item) {
  const continu = item.vod_continu ?? 0;
  const remarks = Number(continu) === 0 ? '电影' : '更新至' + continu + '集';
  return {
    vod_id: String(item.vod_id ?? '') + '/' + continu,
    vod_name: item.vod_name || '',
    vod_pic: item.vod_pic || '',
    vod_remarks: remarks,
  };
}

async function init() { return {}; }

async function home() {
  return { class: CLASSES, filters: buildFilters(), list: [] };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(body.tid ?? body.id ?? '1').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.extend || {};
  const params = {
    area: String(extend.area ?? '0'),
    year: String(extend.year ?? '0'),
    pageSize: '30',
    sort: String(extend.sort ?? 'd_id'),
    page: String(page),
    tid,
  };
  const d = await getData(params, '/App/IndexList/indexList');
  const list = ((d && d.list) || []).map(toVod);
  const total = parseInt(d && d.total, 10) || 0;
  const limit = parseInt(d && d.pageSize, 10) || 30;
  const pagecount = total > 0 ? Math.max(1, Math.ceil(total / limit)) : (list.length >= limit ? page + 1 : page);
  return { page, pagecount, limit, total, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const raw = String(body.id ?? '').trim();
  if (!raw) return { list: [] };
  const vodId = raw.split('/')[0];
  const t = String(Math.floor(Date.now() / 1000));
  const qdata = await getData({ token_id: tokenId, vod_id: vodId, mobile_time: t, token }, '/App/IndexPlay/playInfo');
  const jdata = await getData({ vurl_cloud_id: '2', vod_d_id: vodId }, '/App/Resource/Vurl/show');
  if (!qdata || !qdata.vodInfo) return { list: [] };
  const vod = qdata.vodInfo;
  const playList = [];
  const lines = (jdata && jdata.list) || [];
  lines.forEach((item, index) => {
    const play = (item && item.play) || {};
    const n = [], p = [];
    for (const k of Object.keys(play)) {
      if (play[k] && play[k].param) { n.push(k); p.push(play[k].param); }
    }
    if (!p.length) return;
    const playName = lines.length !== 1 ? String(index + 1) : String(vod.vod_name || '');
    playList.push(playName + '$' + p[p.length - 1] + '||' + n.join('@'));
  });
  return {
    list: [{
      vod_id: vodId,
      vod_name: vod.vod_name || '',
      vod_pic: vod.vod_pic || '',
      vod_year: vod.vod_year || '',
      vod_area: vod.vod_area || '',
      vod_actor: vod.vod_actor || '',
      vod_director: vod.vod_director || '',
      vod_content: String(vod.vod_use_content || '').trim(),
      vod_play_from: '瓜子影视',
      vod_play_url: playList.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id ?? '').trim();
  const parts = id.split('||');
  if (parts.length < 2) return { parse: 0, url: '' };
  const paramStr = parts[0];
  const resolutions = parts[1] ? parts[1].split('@') : [];
  const params = {};
  for (const pair of paramStr.split('&')) {
    const i = pair.indexOf('=');
    if (i > 0) params[pair.slice(0, i)] = pair.slice(i + 1);
  }
  if (resolutions.length) {
    resolutions.sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0));
    params.resolution = resolutions[0];
    const d = await getData(params, '/App/Resource/VurlDetail/showOne');
    if (d && d.url) {
      return {
        parse: 0,
        url: d.url,
        header: { 'User-Agent': UA, 'Referer': 'http://WJiZxLXA2.com/' },
      };
    }
  }
  return { parse: 0, url: '' };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const key = String(body.wd ?? body.key ?? '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!key) return { page, pagecount: page, limit: 30, total: 0, list: [] };
  const d = await getData({ keywords: key, order_val: '1', page: String(page) }, '/App/Index/findMoreVod');
  const list = ((d && d.list) || []).map(toVod);
  return {
    page,
    pagecount: list.length >= 30 ? page + 1 : page,
    limit: 30,
    total: list.length >= 30 ? 999999 : list.length,
    list,
  };
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
