import req from '../../util/req.js';
import crypto from 'crypto';
// 香蕉（LeeCatPaw lee_duoju_xiangjiao）：直连 xiangjiaoai.ai；访客会话令牌（进程内随机 deviceId，30 分钟缓存），
// 分类 id 缓存 10 分钟（bundle 原设计）；播放失败时清令牌重试一次。
const base = 'https://xiangjiaoai.ai';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const cats = [['hot', '精选推荐'], ['theater', '全部剧场'], ['cat:明星换脸', '明星换脸'], ['cat:影视魔改', '影视魔改'], ['cat:动漫游戏', '动漫游戏'], ['cat:穿越重生', '穿越重生'], ['cat:系统异能', '系统异能'], ['cat:仙侠修真', '仙侠修真'], ['cat:古装权谋', '古装权谋']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const deviceId = crypto.randomBytes(16).toString('hex');
let token = '', tokenAt = 0, catIds = new Map(), catAt = 0;
async function api(method, path, body, auth = '') {
  const r = await req({ method, url: base + path, headers: { 'User-Agent': ua, Accept: 'application/json, text/plain, */*', Origin: base, 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, data: body ? JSON.stringify(body) : undefined, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`香蕉 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function guest() {
  if (token && Date.now() - tokenAt < 30 * 60 * 1000) return token;
  const result = await api('POST', '/api/guest-sessions', { device_id: deviceId });
  token = result.data?.access_token || result.access_token || '';
  if (!token) throw new Error('香蕉未返回访客令牌');
  tokenAt = Date.now(); return token;
}
async function categoryId(name) {
  if (Date.now() - catAt > 10 * 60 * 1000 || !catIds.size) {
    const result = await api('GET', '/api/categories');
    catIds = new Map((result.data || []).filter((r) => r.id && r.name).map((r) => [r.name, String(r.id)]));
    catAt = Date.now();
  }
  return catIds.get(name) || '';
}
function card(raw) {
  const r = raw.drama ? { ...raw.drama, image_url: raw.drama.image_url || raw.image_url } : raw;
  if (!r?.id || !r?.title) return null;
  const count = Number(r.episode_count || r.latest_episode_number) || 0;
  return { vod_id: String(r.id), vod_name: String(r.title), vod_pic: r.cover_url || r.image_url || '', vod_remarks: count ? `${r.serial_status === 'finished' ? '全' : '更新至'}${count}集` : r.serial_status === 'finished' ? '已完结' : '', vod_class: (r.tags || []).slice(0, 4).map((t) => t.name).filter(Boolean).join(','), vod_content: r.description || '' };
}
const cards = (rows) => (rows || []).map(card).filter(Boolean);
async function listing(cat, page) {
  if (cat === 'hot') return page === 1 ? cards((await api('GET', '/api/home/hot')).data?.items) : [];
  const query = new URLSearchParams({ limit: String(Math.min(300, page * 30)) });
  if (cat?.startsWith('cat:')) {
    const id = await categoryId(cat.slice(4));
    if (!id) return [];
    query.set('category_id', id);
  }
  const all = cards((await api('GET', `/api/theater?${query}`)).data?.items);
  return all.slice((page - 1) * 30, page * 30);
}
async function search(wd, page) {
  if (!wd) return [];
  return cards((await api('GET', `/api/search?q=${encodeURIComponent(wd)}&page=${page}`)).data?.items);
}
async function detail(id) {
  const info = (await api('GET', `/api/dramas/${encodeURIComponent(id)}`)).data || {};
  const eps = (await api('GET', `/api/dramas/${encodeURIComponent(id)}/episodes`)).data || [];
  const seen = new Set(), list = eps.filter((e) => e?.id && !seen.has(e.episode_number) && seen.add(e.episode_number)).sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
  if (!list.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: info.title || id, vod_pic: info.cover_url || '', vod_content: info.description || '', vod_remarks: `共${list.length}集`, vod_play_from: '香蕉', vod_play_url: list.map((e, i) => `${String(e.title || `第${e.episode_number || i + 1}集`).replace(/[$#]/g, '_')}$xiangjiao://${id}/${e.id}`).join('#') }] };
}
async function play(id) {
  const match = /^xiangjiao:\/\/([^/]+)\/([^/]+)$/.exec(id);
  if (!match) throw new Error('香蕉分集 ID 无效');
  for (let i = 0; i < 2; i++) {
    try {
      const result = await api('POST', '/api/playback/sessions', { episode_id: match[2] }, await guest());
      const url = result.data?.media?.manifest_url || '';
      if (!/^https?:\/\//.test(url)) throw new Error('香蕉未返回媒体地址');
      return { parse: 0, url, header: { 'User-Agent': ua, Referer: base + '/' } };
    } catch (error) { token = ''; if (i) throw error; }
  }
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 30 ? page + 1 : page, limit: 30, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_xiangjiao', name: '多聚短剧 · 香蕉', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('hot', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
