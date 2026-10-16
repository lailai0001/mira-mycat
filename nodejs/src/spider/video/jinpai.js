import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_jinpai';
const NAME = '金牌影视';

// 逆向自 Yswag/xptv-extensions 混淆包 (jinpai 模块)
// API: /api/mw-movie/anonymous/*, 签名 sign=sha1(md5(query))

const GU = 'cb808529bae6b6be45ecfab29a4889bc';
const HOSTS = [
  'https://y2s52n7.com',
  'https://m.hkybqufgh.com',
  'https://m.9zhoukj.com',
  'https://m.jiabaide.cn',
  'https://www.hkybqufgh.com',
  'https://m.sizhengxt.com',
];
const UA = 'okhttp/3.15';
const TIMEOUT = 15000;

let WORK_HOST = '';

const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '电视剧' },
  { type_id: '3', type_name: '综艺' },
  { type_id: '4', type_name: '动漫' },
];

function md5hex(s) {
  return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}
function sha1hex(s) {
  return crypto.createHash('sha1').update(String(s), 'utf8').digest('hex');
}
function sign(qs) {
  return sha1hex(md5hex(qs));
}
function t(v) {
  return String(v == null ? '' : v).trim();
}
function stripHtml(s) {
  return t(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { ctrl, done: () => clearTimeout(timer) };
}

// 双通道 GET: 先框架 req, 失败再 fetch
async function getText(url, headers) {
  try {
    const { data } = await req.get(url, { headers, timeout: TIMEOUT, responseType: 'text' });
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) {
    const tmo = withTimeout(TIMEOUT);
    try {
      const r = await fetch(url, { headers, signal: tmo.ctrl.signal });
      return await r.text();
    } finally { tmo.done(); }
  }
}
function toJson(text) {
  try { return JSON.parse(String(text || '{}')); } catch (e) { return {}; }
}

async function pickHost() {
  if (WORK_HOST) return WORK_HOST;
  for (const h of HOSTS) {
    const host = h.replace(/\/+$/, '');
    const ts = String(Date.now());
    const qs = `key=${GU}&t=${ts}`;
    try {
      const text = await getText(host + '/api/mw-movie/anonymous/home/hotSearch', {
        'sign': sign(qs), 'T': ts, 'Deviceid': 'Deviceid', 'User-Agent': UA,
      });
      const d = toJson(text);
      if (d && typeof d === 'object' && (d.code === 200 || text.trim().startsWith('{') || text.trim().startsWith('['))) {
        WORK_HOST = host;
        return WORK_HOST;
      }
    } catch (e) {}
  }
  WORK_HOST = HOSTS[4].replace(/\/+$/, '');
  return WORK_HOST;
}

async function apiGet(path, signStrTpl, urlQuery) {
  const host = await pickHost();
  const ts = String(Date.now());
  const s = signStrTpl.replace('{ts}', ts);
  const uq = (urlQuery || '').replace('{ts}', ts);
  const url = host + path + (uq ? '?' + uq : '');
  const headers = { 'sign': sign(s), 'T': ts, 'Deviceid': 'Deviceid', 'User-Agent': UA };
  const text = await getText(url, headers);
  return toJson(text);
}

function toVod(it) {
  if (!it) return null;
  return {
    vod_id: String(it.vodId || ''),
    vod_name: stripHtml(it.vodName),
    vod_pic: t(it.vodPic),
    vod_year: t(it.vodYear),
    vod_remarks: stripHtml(it.vodRemarks),
  };
}

async function init() { return {}; }

async function home() {
  return { class: CLASSES, filters: {} };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(body.tid ?? body.id ?? '1').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.extend || {};
  const typeId1 = /^[1-4]$/.test(tid) ? tid : '1';
  const params = [
    ['area', String(extend.area ?? '')],
    ['filterStatus', '1'],
    ['lang', String(extend.lang ?? '')],
    ['pageNum', String(page)],
    ['pageSize', '30'],
    ['sort', String(extend.sort ?? '1')],
    ['sortBy', '1'],
    ['type', String(extend.type ?? '')],
    ['type1', typeId1],
    ['v_class', String(extend.class ?? extend.vclass ?? '')],
    ['year', String(extend.year ?? '')],
  ];
  const rawQs = params.map(([k, v]) => k + '=' + v).join('&');
  const encQs = params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const data = await apiGet('/api/mw-movie/anonymous/video/list', rawQs + `&key=${GU}&t={ts}`, encQs);
  const list = ((data && data.data && data.data.list) || []).map(toVod).filter(Boolean);
  return {
    page,
    pagecount: list.length >= 30 ? page + 1 : page,
    limit: 30,
    total: list.length >= 30 ? 999999 : list.length,
    list,
  };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id ?? '').trim();
  if (!id) return { list: [] };
  const data = await apiGet(
    '/api/mw-movie/anonymous/video/detail?id=' + encodeURIComponent(id),
    `id=${id}&key=${GU}&t={ts}`,
    ''
  );
  const d = (data && data.data) || {};
  const eps = d.episodeList || [];
  const tracks = [];
  eps.forEach((ep, idx) => {
    const nid = t(ep && ep.nid);
    if (!nid) return;
    let name = stripHtml(ep.name) || ('第' + (idx + 1) + '集');
    name = name.replace(/\$/g, ' ').replace(/#/g, ' ');
    tracks.push(name + '$' + id + '@' + nid);
  });
  if (!tracks.length) return { list: [] };
  return {
    list: [{
      vod_id: String(d.vodId || id),
      vod_name: stripHtml(d.vodName),
      vod_pic: t(d.vodPic),
      vod_year: t(d.vodYear),
      vod_area: stripHtml(d.vodArea),
      vod_remarks: stripHtml(d.vodRemarks),
      vod_actor: stripHtml(d.vodActor),
      vod_director: stripHtml(d.vodDirector),
      vod_content: stripHtml(d.vodContent || d.vodBlurb),
      vod_play_from: '在线播放',
      vod_play_url: tracks.join('#'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id ?? '').trim();
  const parts = id.split('@');
  const vid = parts[0] || '';
  const nid = parts[1] || '';
  if (!vid || !nid) return { parse: 0, url: '' };
  const data = await apiGet(
    '/api/mw-movie/anonymous/v2/video/episode/url',
    `id=${vid}&nid=${nid}&key=${GU}&t={ts}`,
    `id=${encodeURIComponent(vid)}&nid=${encodeURIComponent(nid)}`
  );
  const list = ((data && data.data && data.data.list) || []);
  // 按清晰度排序: 4k > 蓝光 > 超清 > 高清 > 标清 > 流畅
  const rankMap = { '4k': 6, '蓝光': 5, '超清': 4, '高清': 3, '标清': 2, '流畅': 1 };
  const urls = [];
  for (const p of list) {
    const u = t(p && p.url);
    if (!u || !/^https?:/i.test(u)) continue;
    const rn = t(p.resolutionName).toLowerCase();
    const rank = (rankMap[t(p.resolutionName)] || 0) * 100000 + (parseInt(p.resolution, 10) || 0);
    urls.push({ rank, name: t(p.resolutionName), url: u });
  }
  urls.sort((a, b) => b.rank - a.rank);
  if (!urls.length) return { parse: 0, url: '' };
  // 返回最高清晰度, MiraPlayer 会播第一个
  const best = urls[0];
  return {
    parse: 0,
    url: best.url,
    header: { 'User-Agent': UA, 'Referer': (await pickHost()) + '/' },
  };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const wd = String(body.wd ?? body.key ?? '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
  const data = await apiGet(
    '/api/mw-movie/anonymous/video/searchByWord',
    `keyword=${wd}&pageNum=${page}&pageSize=20&key=${GU}&t={ts}`,
    `keyword=${encodeURIComponent(wd)}&pageNum=${page}&pageSize=20`
  );
  const list = (((data && data.data && data.data.result) || {}).list || []).map(toVod).filter(Boolean);
  return {
    page,
    pagecount: list.length >= 20 ? page + 1 : page,
    limit: 20,
    total: list.length >= 20 ? 999999 : list.length,
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
