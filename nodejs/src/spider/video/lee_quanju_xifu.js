import req from '../../util/req.js';
import crypto from 'crypto';
// 喜福（LeeCatPaw lee_duoju_xifu / lee_quanju_xifu 共享实现）：
// 直连 minidrama-api.contentchina.com；播放先向站方 play_auth 取 vid 与 playAuth，再用其内含的
// 阿里云凭证现场签名 GetPlayInfo（凭证来自站方接口本身，非内嵌密钥）。
// 搜索在 bundle 里即返回空（原设计）；详情按原法在分类首页里找标题（只扫第 1 页）。
const host = 'https://minidrama-api.contentchina.com';
const origin = 'https://minidrama.contentchina.com';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const cats = [['3', '爽剧'], ['6', '甜宠'], ['5', '逆袭'], ['1', '现代言情'], ['4', '都市'], ['23', '玄幻'], ['16', '古代言情']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function get(url) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, Origin: origin, Referer: `${origin}/`, Accept: 'application/json, text/plain, */*' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`喜福接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function api(path) {
  const result = await get(`${host}${path}`);
  if (!result.data) throw new Error('喜福接口无数据');
  return result.data;
}
function cards(items, category) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.albumId), name = clean(item?.title);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const cover = clean(item.coverUrl);
    return [{ vod_id: id, vod_name: name, vod_pic: cover ? new URL(cover, host).href : '', vod_remarks: Number(item.total) > 0 ? `共${item.total}集` : '', vod_class: category }];
  });
}
async function listRaw(id, page) {
  const cat = cats.some(([key]) => key === id) ? id : '';
  let path = `/web/v1/drama/list?pageSize=24&currentPage=${page}`;
  if (cat) path += `&filterCategories[]=${encodeURIComponent(cat)}`;
  const data = await api(path);
  const items = data.data || [];
  return Array.isArray(items) ? items : [];
}
async function listing(id, page) {
  let rows = await listRaw(id, page);
  if (!rows.length && id) rows = await listRaw('', page);
  return cards(rows, cats.find(([key]) => key === id)?.[1] || '全部');
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 24 ? page + 1 : page, limit: 24, total: list.length });
async function detail(id) {
  let match;
  for (const cat of ['', ...cats.map(([key]) => key)]) {
    const rows = await listRaw(cat, 1);
    match = rows.find((item) => clean(item.albumId) === id);
    if (match) break;
  }
  const total = Math.max(1, Number(match?.total) || 1);
  const episodes = Array.from({ length: total }, (_, index) => `第${index + 1}集$xifu://${id}/${index + 1}`);
  return { list: [{ vod_id: id, vod_name: clean(match?.title) || `喜福短剧 ${id}`, vod_pic: match?.coverUrl ? new URL(match.coverUrl, host).href : '', vod_remarks: `共${total}集`, vod_play_from: '喜福', vod_play_url: episodes.join('#') }] };
}
const pct = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
function vodUrl(vid, encodedAuth) {
  const credential = JSON.parse(Buffer.from(encodedAuth, 'base64').toString('utf8'));
  if (!credential.AccessKeyId) throw new Error('喜福凭证无效');
  const region = credential.Region || 'cn-shanghai';
  const params = { Action: 'GetPlayInfo', Version: '2017-03-21', Format: 'JSON', AccessKeyId: credential.AccessKeyId, SecurityToken: credential.SecurityToken || '', VideoId: vid, AuthInfo: credential.AuthInfo || '', Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: process.hrtime.bigint().toString() };
  if (credential.PlayConfig != null) params.PlayConfig = JSON.stringify(credential.PlayConfig);
  const canonical = Object.keys(params).sort().map((key) => `${pct(key)}=${pct(params[key])}`).join('&');
  const stringToSign = `GET&%2F&${pct(canonical)}`;
  const signature = crypto.createHmac('sha1', `${credential.AccessKeySecret || ''}&`).update(stringToSign).digest('base64');
  return `https://vod.${region}.aliyuncs.com/?${canonical}&Signature=${pct(signature)}`;
}
async function play(raw) {
  const match = raw.match(/^xifu:\/\/(.+)\/(\d+)$/);
  if (!match) throw new Error('喜福分集 ID 无效');
  const auth = await api(`/web/v1/drama/play_auth?albumId=${encodeURIComponent(match[1])}&seq=${match[2]}`);
  if (!auth.vid || !auth.playAuth) throw new Error('喜福未返回播放凭证');
  const response = await get(vodUrl(auth.vid, auth.playAuth));
  const rows = response.PlayInfoList?.PlayInfo || response.PlayInfo || [];
  const infos = Array.isArray(rows) ? rows : [rows];
  const playable = infos.filter((item) => /^https?:\/\//.test(clean(item.PlayURL)));
  const best = playable.find((item) => item.Status === 'Normal') || playable[0];
  if (!best) throw new Error('喜福未返回媒体地址');
  return { parse: 0, url: best.PlayURL, header: { 'User-Agent': ua, Referer: `${origin}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_quanju_xifu', name: '全聚合短剧 · 喜福', type: 3, searchable: 0, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged([], pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
