// 影探4K —— MiraPlayer spider（最大资源 zuidapi，4K 电影为主）
// 后端: https://api.zuidapi.com/api.php/provide/vod/ （苹果CMS 标准 JSON 接口）
// 2026-10-17 重写：原 cms.lyyytv.cn 存储全 404，改用最大资源，4K 分类实测 212 部
import req from '../../util/req.js';

const KEY = 'py_yingtan4k';
const NAME = '影探4K';

const API = 'https://api.zuidapi.com/api.php/provide/vod/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1';
const TIMEOUT = 20000;

// 分类：4K 置顶，其余按热度排
const CLASSES = [
  { type_id: '62', type_name: '4K电影' },
  { type_id: '6', type_name: '动作片' },
  { type_id: '7', type_name: '喜剧片' },
  { type_id: '11', type_name: '剧情片' },
  { type_id: '10', type_name: '恐怖片' },
  { type_id: '12', type_name: '战争片' },
  { type_id: '13', type_name: '国产剧' },
  { type_id: '69', type_name: '现代都市' },
  { type_id: '64', type_name: '女频恋爱' },
  { type_id: '66', type_name: '古装仙侠' },
  { type_id: '67', type_name: '年代穿越' },
  { type_id: '14', type_name: '欧美剧' },
  { type_id: '15', type_name: '韩剧' },
  { type_id: '16', type_name: '日剧' },
  { type_id: '17', type_name: '港剧' },
  { type_id: '18', type_name: '台剧' },
  { type_id: '19', type_name: '泰剧' },
  { type_id: '23', type_name: '海外剧' },
  { type_id: '29', type_name: '国产动漫' },
  { type_id: '30', type_name: '日韩动漫' },
  { type_id: '31', type_name: '欧美动漫' },
  { type_id: '39', type_name: '动画片' },
  { type_id: '25', type_name: '大陆综艺' },
  { type_id: '26', type_name: '日韩综艺' },
  { type_id: '27', type_name: '港台综艺' },
  { type_id: '28', type_name: '欧美综艺' },
  { type_id: '49', type_name: '篮球' },
  { type_id: '50', type_name: '足球' },
];

const toStr = (v) => (v == null ? '' : String(v)).trim();
const stripHtml = (s) => toStr(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// 双通道 JSON 请求：先框架 req，失败再 fetch
async function getJson(url) {
  try {
    const r = await req.get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT });
    const d = r && r.data !== undefined ? r.data : r;
    if (typeof d === 'string') {
      try { return JSON.parse(d); } catch { return null; }
    }
    return d || null;
  } catch (e) { /* fallthrough */ }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function toVod(v) {
  const remarks = toStr(v.vod_remarks) || toStr(v.vod_year) || toStr(v.type_name);
  return {
    vod_id: toStr(v.vod_id),
    vod_name: toStr(v.vod_name),
    vod_pic: toStr(v.vod_pic),
    vod_remarks: remarks,
    vod_year: toStr(v.vod_year),
    vod_area: toStr(v.vod_area),
    vod_actor: toStr(v.vod_actor),
  };
}

async function init() { return {}; }

async function home() {
  const classes = CLASSES.map((c) => ({ type_id: c.type_id, type_name: c.type_name }));
  let list = [];
  try {
    // 首页推荐：4K 分类第一页
    const d = await getJson(`${API}?ac=list&t=62&pg=1`);
    if (d && Array.isArray(d.list)) list = d.list.map(toVod);
  } catch (e) { /* ignore */ }
  return { class: classes, filters: {}, list };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = toStr(body.id);
  const pg = Math.max(1, parseInt(body.page, 10) || 1);
  const d = await getJson(`${API}?ac=list&t=${encodeURIComponent(tid)}&pg=${pg}`);
  const list = d && Array.isArray(d.list) ? d.list.map(toVod) : [];
  const pagecount = parseInt(d?.pagecount, 10) || pg;
  return {
    page: pg,
    pagecount,
    limit: 20,
    total: parseInt(d?.total, 10) || 0,
    list,
  };
}

// 解析播放串：源$$$源，每源内 集名$url#集名$url
function parsePlay(vod) {
  const froms = toStr(vod.vod_play_from).split('$$$').filter(Boolean);
  const urls = toStr(vod.vod_play_url).split('$$$');
  const playFrom = [];
  const playUrl = [];
  for (let i = 0; i < froms.length; i++) {
    const parts = (urls[i] || '').split('#').filter(Boolean);
    if (!parts.length) continue;
    playFrom.push(froms[i]);
    playUrl.push(parts.join('#'));
  }
  // 兜底：from 为空但 url 有内容
  if (!playFrom.length && toStr(vod.vod_play_url)) {
    playFrom.push('zuidam3u8');
    playUrl.push(toStr(vod.vod_play_url));
  }
  return { playFrom: playFrom.join('$$$'), playUrl: playUrl.join('$$$') };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const rawId = body.id;
  const id = Array.isArray(rawId) ? rawId[0] : toStr(rawId);
  if (!id) return { list: [] };
  const d = await getJson(`${API}?ac=detail&ids=${encodeURIComponent(id)}`);
  const v = d && Array.isArray(d.list) ? d.list[0] : null;
  if (!v) return { list: [] };
  const { playFrom, playUrl } = parsePlay(v);
  return {
    list: [{
      vod_id: toStr(v.vod_id),
      vod_name: toStr(v.vod_name),
      vod_pic: toStr(v.vod_pic),
      vod_year: toStr(v.vod_year),
      vod_area: toStr(v.vod_area),
      vod_actor: toStr(v.vod_actor),
      vod_remarks: toStr(v.vod_remarks),
      vod_content: stripHtml(v.vod_content),
      type_name: toStr(v.type_name),
      vod_play_from: playFrom,
      vod_play_url: playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let flag = toStr(body.flag);
  let id = toStr(body.id);
  // id 可能是 "HD$https://...m3u8" 或纯 url
  let url = id;
  const di = id.indexOf('$');
  if (di >= 0) url = id.slice(di + 1);
  url = url.trim();
  if (/^https?:\/\//i.test(url)) {
    return {
      parse: 0,
      url,
      header: { 'User-Agent': UA, 'Referer': 'https://api.zuidapi.com/' },
    };
  }
  return { parse: 0, url: '' };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const key = toStr(body.wd ?? body.key);
  const pg = Math.max(1, parseInt(body.page, 10) || 1);
  if (!key) return { page: pg, pagecount: pg, limit: 20, total: 0, list: [] };
  const d = await getJson(`${API}?ac=list&wd=${encodeURIComponent(key)}&pg=${pg}`);
  const list = d && Array.isArray(d.list) ? d.list.map(toVod) : [];
  const pagecount = parseInt(d?.pagecount, 10) || pg;
  return {
    page: pg,
    pagecount,
    limit: 20,
    total: parseInt(d?.total, 10) || 0,
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
