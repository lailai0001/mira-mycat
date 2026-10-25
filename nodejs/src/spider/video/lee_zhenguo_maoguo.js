import req from '../../util/req.js';
import crypto from 'crypto';
// 猫果（LeeCatPaw lee_zhenguo_maoguo）：七猫短剧后端（api-store/api-read.qmplaylet.com）的另一 Lee 源；
// 与 Batch 2 七猫源同后端、不同实现：详情直接给出各集直链，play 仅解码 URL（bundle 原设计）。
// 请求签名 md5 + 设备头 base64 字符映射均为 bundle 内嵌的客户端参数。
const store = 'https://api-store.qmplaylet.com', read = 'https://api-read.qmplaylet.com';
const key = 'd3dGiJc651gSQ8w1', track = 'ec1280db127955061754851657967';
const sourceChars = '+/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const targetChars = 'PXMUlErYWbdJ9saI0oy_HGitgNA8Fk3hfRqC4pmBOuc6Kx5T-2zSZ1VvjQ7DwnLe';
const charMap = new Map([...sourceChars].map((c, i) => [c, targetChars[i]]));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
function headers() {
  const payload = { static_score: '0.8', uuid: '00000000-7fc7-08dc-0000-000000000000', 'device-id': '20250220125449b9b8cac84c2dd3d035c9052a2572f7dd0122edde3cc42a70', mac: '', sourceuid: 'aa7de295aad621a6', 'refresh-type': '0', model: '22021211RC', 'wlb-imei': '', 'client-id': 'aa7de295aad621a6', brand: 'Redmi', oaid: '', 'oaid-no-cache': '', 'sys-ver': '12', 'trusted-id': '', 'phone-level': 'H', imei: '', 'wlb-uid': 'aa7de295aad621a6', 'session-id': String(Date.now()) };
  const qm = [...Buffer.from(JSON.stringify(payload)).toString('base64')].map((c) => charMap.get(c) || c).join('');
  const sign = md5('AUTHORIZATION=app-version=10001application-id=com.duoduo.read' + 'channel=unknownis-white=net-env=5platform=androidqm-params=' + qm + 'reg=' + key);
  return { 'net-env': '5', reg: '', channel: 'unknown', 'is-white': '', platform: 'android', 'application-id': 'com.duoduo.read', authorization: '', 'app-version': '10001', 'User-Agent': 'webviewversion/0', 'qm-params': qm, sign, Accept: 'application/json', 'X-Requested-With': 'com.duoduo.read' };
}
async function api(base, path, signed) {
  const url = base + path + (path.includes('?') ? '&' : '?') + 'sign=' + md5(signed + key);
  const r = await req({ method: 'GET', url, headers: headers(), timeout: 15000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`猫果 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
const pick = (r, keys) => keys.map((k) => r?.[k]).find((v) => v !== undefined && v !== null && v !== '') || '';
function card(r) {
  const id = pick(r, ['playlet_id', 'playletId', 'id']);
  if (!id) return null;
  const count = Number(pick(r, ['total_episode_num', 'totalEpisodeNum', 'total'])) || 0;
  return { vod_id: String(id), vod_name: String(pick(r, ['title', 'playlet_name', 'name']) || id), vod_pic: pick(r, ['image_link', 'imageLink', 'cover', 'cover_url']), vod_remarks: count ? `全${count}集` : '', vod_content: pick(r, ['intro', 'description', 'desc']) };
}
const cards = (rows) => (rows || []).map(card).filter(Boolean);
async function categories() {
  let result;
  try { result = await api(store, '/api/v1/playlet/tag/list?operation=1', 'operation=1'); }
  catch { return [{ type_id: '0', type_name: '推荐' }]; }
  const found = (result.data?.list || []).map((r) => ({ type_id: String(pick(r, ['tag_id', 'id'])), type_name: String(pick(r, ['tag_name', 'name', 'title'])) })).filter((r) => r.type_id && r.type_name);
  return found.length ? found.slice(0, 24) : [{ type_id: '0', type_name: '推荐' }];
}
async function listing(cat, page) {
  const id = /^\d+$/.test(cat) ? cat : '0';
  const suffix = page > 1 ? `&next_id=${page}` : '';
  const path = `/api/v1/playlet/index?tag_id=${id}&playlet_privacy=1&operation=1${suffix}`;
  const sign = (page > 1 ? `next_id=${page}` : '') + `operation=1playlet_privacy=1tag_id=${id}`;
  return cards((await api(store, path, sign)).data?.list);
}
async function search(wd) {
  if (!wd) return [];
  const sign = `extend=page=1read_preference=0track_id=${track}wd=${wd}`;
  const path = `/api/v1/playlet/search?extend=&page=1&wd=${encodeURIComponent(wd)}&read_preference=0&track_id=${track}`;
  return cards((await api(store, path, sign)).data?.list);
}
async function detail(id) {
  const data = (await api(read, `/player/api/v1/playlet/info?playlet_id=${encodeURIComponent(id)}`, `playlet_id=${id}`)).data || {};
  const eps = (data.play_list || []).filter((e) => pick(e, ['video_url', 'videoUrl', 'url']));
  if (!eps.length) return { list: [] };
  eps.sort((a, b) => Number(pick(a, ['sort', 'episode', 'index'])) - Number(pick(b, ['sort', 'episode', 'index'])));
  const vod = card({ ...data, playlet_id: id }) || { vod_id: id, vod_name: id };
  return { list: [{ ...vod, vod_remarks: `全${eps.length}集`, vod_play_from: '猫果', vod_play_url: eps.map((e, i) => {
    const no = Number(pick(e, ['sort', 'episode', 'index'])) || i + 1;
    const name = String(pick(e, ['title', 'name']) || `第${no}集`).replace(/[$#]/g, '_');
    return `${name}$maoguo://${encodeURIComponent(pick(e, ['video_url', 'videoUrl', 'url']))}`;
  }).join('#') }] };
}
function play(id) {
  const url = decodeURIComponent(id.replace(/^maoguo:\/\//, ''));
  if (!/^https?:\/\//.test(url)) throw new Error('猫果分集地址无效');
  return { parse: 0, url, header: {} };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 63, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_zhenguo_maoguo', name: '真果鉴 · 猫果', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: await categories(), list: await listing('0', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
