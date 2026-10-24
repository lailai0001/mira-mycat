import req from '../../util/req.js';
import crypto from 'crypto';
// 山海（LeeCatPaw lee_duoju_shanhai / lee_quanju_shanhai 共享实现）：
// 直连 api.app.gxshxy.com，登录走 u.app.gxshxy.com（登录体 AES-128-ECB 加密、业务体 AES-128-GCM 解密，
// 密钥均为 bundle 内嵌的客户端参数）；token 只存模块级内存、失败自动重登（与 bundle 一致）。
const host = 'https://api.app.gxshxy.com';
const loginKey = Buffer.from('B@ecf920Od8A4df7');
const gcmKey = Buffer.from('xxxxxxwhwqedqder');
const cats = [['jingxuan', '精选', '0'], ['renqi', '人气', '1'], ['xinju', '新剧', '51'], ['tianchong', '甜宠', '46'], ['nixi', '逆袭', '6'], ['qiangzhe', '强者回归', '50'], ['qihuan', '奇幻', '44'], ['fuchou', '复仇', '49'], ['zhongguomeng', '中国梦', '41'], ['jiating', '家庭', '9']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
let token = '';
async function requestJson(url, method, headers, body) {
  const payload = body == null ? undefined : String(body);
  const r = await req({ method, url, headers, data: payload, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`山海接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function login() {
  const payload = { device: '22ebfeec0a5ad3c0397bae448b8658cc3', install_first_open: true, first_install_time: 1751687627754, last_update_time: 1751687627754, report_link_url: '', android_id: '8f7db6f23d745890', package_name: 'com.shanhai.duanju', authorization: '', timestamp: Date.now() };
  const cipher = crypto.createCipheriv('aes-128-ecb', loginKey, null);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]).toString('base64');
  const result = await requestJson('https://u.app.gxshxy.com/user/v3/account/login', 'POST', { 'Content-Type': 'application/json; charset=utf-8' }, body);
  token = clean(result.data?.token);
  if (!token) throw new Error('山海登录未返回 token');
}
function unseal(data) {
  const nonce = Buffer.from(data.nonce || '', 'hex');
  const blob = Buffer.from(data.data || '', 'hex');
  if (blob.length <= 16) throw new Error('山海密文无效');
  const decipher = crypto.createDecipheriv('aes-128-gcm', gcmKey, nonce);
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  const plain = Buffer.concat([decipher.update(blob.subarray(0, -16)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
async function api(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) await login();
    try {
      const result = await requestJson(`${host}${path}`, 'GET', { authorization: token });
      if (!result.data?.data) throw new Error(`山海接口无数据 ${result.code || ''}`);
      return unseal(result.data);
    } catch (error) {
      if (attempt === 0) { token = ''; continue; }
      throw error;
    }
  }
  throw new Error('山海接口鉴权失败');
}
function cards(items, category) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((raw) => {
    const item = raw?.theater || raw || {};
    const id = clean(item.id), name = clean(item.title);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ vod_id: id, vod_name: name, vod_pic: clean(item.cover_url), vod_remarks: item.total ? `共${item.total}集` : '', vod_class: category }];
  });
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 24 ? page + 1 : page, limit: 24, total: list.length });
async function listing(id, page) {
  const [, name, classId] = cats.find(([key]) => key === id) || cats[0];
  const data = await api('/shanhai-theater/v2/theater_parent/cloud/v2/theater/home_page' + `?theater_class_id=1&type=1&class2_ids=${classId}&page_num=${page}&page_size=24`);
  return cards(data.items, name);
}
async function search(wd, page) {
  if (!wd) return paged([], page);
  if (!token) await login();
  const result = await requestJson(`${host}/v3/search`, 'POST', { authorization: token, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'okhttp/4.10.0' }, JSON.stringify({ text: wd }));
  return paged(cards(result.data?.theater?.search_data, ''), page);
}
const detailData = (id) => api(`/shanhai-theater/v2/theater_parent/detail?theater_parent_id=${encodeURIComponent(id)}`);
async function detail(id) {
  const data = await detailData(id);
  const episodes = (data.theaters || []).map((entry, index) => {
    const n = index + 1, name = clean(entry.son_title) || `第${n}集`;
    return `${name.replace(/[$#]/g, '_')}$shanhai://${id}/${n}`;
  });
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(data.title), vod_pic: clean(data.cover_url), vod_class: (data.desc_tags || []).join(' '), vod_content: clean(data.introduction), vod_remarks: `共${episodes.length}集`, vod_play_from: '山海', vod_play_url: episodes.join('#') }] };
}
async function play(raw) {
  const match = raw.match(/^shanhai:\/\/([^/]+)\/(\d+)$/);
  if (!match) throw new Error('山海分集 ID 无效');
  const data = await detailData(match[1]);
  const url = clean(data.theaters?.[Number(match[2]) - 1]?.son_video_url);
  if (!/^https?:\/\//.test(url)) throw new Error('山海未返回媒体地址');
  return { parse: 0, url, header: { 'User-Agent': 'okhttp/4.10.0', Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_shanhai', name: '多聚短剧 · 山海', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('jingxuan', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
