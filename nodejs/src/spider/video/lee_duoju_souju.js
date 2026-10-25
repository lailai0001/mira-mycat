import req from '../../util/req.js';
import crypto from 'crypto';
// 搜剧AI（LeeCatPaw lee_duoju_souju）：直连 souju.ai；请求用 HMAC-SHA256 签名（签名密钥为 bundle 内嵌的客户端参数）。
// 播放按原法逐条嗅探（Range 取前 64 字节验 #EXTM3U/ftyp/TS 同步字节），只返回可读线路。
const base = 'https://souju.ai';
const key = 'f39d73aa7a6426203cdee1ef17b31d3b7ea8c23f4c59c62a3a8aa0f39ee5e79d';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const cats = ['全部', '脑洞悬疑', '古装仙侠', '现代都市', '女频恋爱', '言情总裁', '年代穿越', '现代言情', '反转爽剧', '重生民国'];
const epCache = new Map();
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
function headers(method, path) {
  const ts = String(Date.now()), nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto.createHmac('sha256', key).update(`${method}\n${path}\n${ts}\n${nonce}`).digest('hex');
  return { 'User-Agent': ua, Accept: 'application/json', 'x-ai-movie-client-name': 'movie-search-frontend', 'x-ai-movie-client-version': '1.0.0', 'x-ai-movie-build-version': 'aimovie-v2026.09.28.4-f41bc3c82d76-web', 'x-ai-movie-protocol-version': '2026-07-05.library-v2.playback-v1', 'x-ai-movie-timestamp': ts, 'x-ai-movie-nonce': nonce, 'x-ai-movie-signature': sig };
}
async function api(path, body) {
  const method = body ? 'POST' : 'GET';
  const r = await req({ method, url: base + path, headers: { ...headers(method, path), ...(body ? { 'Content-Type': 'application/json' } : {}) }, data: body ? JSON.stringify(body) : undefined, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`搜剧AI HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
const absolute = (v) => v?.startsWith('/') ? base + v : v || '';
function cards(rows) {
  return (rows || []).filter((r) => r?.id && r?.title && !r?.availability?.disabled).map((r) => ({ vod_id: String(r.id), vod_name: String(r.title), vod_pic: absolute(r.poster_url), vod_class: (r.genres || []).join('/'), vod_remarks: [r.year, r.remarks].filter(Boolean).join(' · ') }));
}
async function browse(cat, wd, page) {
  if (page > 20) return [];
  const query = new URLSearchParams({ kind: 'short_drama', intent: wd ? 'catalog_search' : 'latest_catalog' });
  if (wd) query.set('query', wd);
  else if (cat && cat !== 'all') query.set('genre', cat);
  query.set('page', String(page)); query.set('limit', '24');
  return cards((await api(`/v1/browse/catalog?${query}`)).cards);
}
async function episodes(vid) {
  if (epCache.has(vid)) return epCache.get(vid);
  const all = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const data = await api(`/v1/catalog/${encodeURIComponent(vid)}/episodes?limit=100&offset=${offset}&order=asc`);
    all.push(...(data.episodes || []).filter((e) => e.token));
    if (!data.episode_pagination?.has_more && !data.pagination?.has_more) break;
  }
  all.sort((a, b) => Number(a.number || a.key || 0) - Number(b.number || b.key || 0));
  if (epCache.size > 240) epCache.clear();
  epCache.set(vid, all);
  return all;
}
async function detail(vid) {
  const data = await api(`/v1/catalog/${encodeURIComponent(vid)}?episodes=window&episode_limit=1`);
  const eps = await episodes(vid);
  if (!eps.length) return { list: [] };
  return { list: [{ vod_id: vid, vod_name: data.title || vid, vod_pic: absolute(data.poster_url), vod_content: data.overview || data.description || '', vod_remarks: `共${eps.length}集`, vod_play_from: '搜剧AI', vod_play_url: eps.map((e, i) => `${String(e.title || `第${e.number || i + 1}集`).replace(/[$#]/g, '_')}$souju://${vid}/${i + 1}`).join('#') }] };
}
async function mediaWorks(url) {
  try {
    const r = await req({ method: 'GET', url, headers: { Range: 'bytes=0-63', 'User-Agent': ua, Referer: base + '/' }, timeout: 10000, responseType: 'arraybuffer', validateStatus: () => true });
    if (r.status < 200 || r.status >= 300) return false;
    const bytes = Buffer.from(r.data);
    const sample = bytes.subarray(0, 200).toString();
    return sample.startsWith('#EXTM3U') || sample.includes('ftyp') || (bytes.length > 0 && bytes[0] === 0x47);
  } catch { return false; }
}
async function play(id) {
  const match = /^souju:\/\/([^/]+)\/(\d+)$/.exec(id);
  if (!match) throw new Error('搜剧AI 分集 ID 无效');
  const eps = await episodes(match[1]), episode = eps[Number(match[2]) - 1];
  if (!episode?.token) throw new Error('搜剧AI 分集不存在');
  const resolved = await api(`/v1/playback/resolve/${encodeURIComponent(episode.token)}`);
  const lines = (resolved.line_options || []).filter((l) => l.url).sort((a, b) => Number(b.url_kind === 'mp4') - Number(a.url_kind === 'mp4'));
  for (const line of lines) {
    let url = line.url;
    if (url.startsWith('resolve://')) {
      const data = await api('/v1/playback/resolve-line?view=compact', { ticket: url.slice(10), selection: { playback_source_id: line.playback_source_id || '', provider_id: line.provider_id || '' } });
      url = data.line?.url || '';
    }
    if (/^https?:\/\//.test(url) && await mediaWorks(url)) return { parse: 0, url, header: { 'User-Agent': ua, Referer: base + '/' } };
  }
  throw new Error('搜剧AI 无可播放线路');
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 24 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_souju', name: '多聚短剧 · 搜剧AI', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map((v) => ({ type_id: v === '全部' ? 'all' : v, type_name: v })), list: await browse('all', '', 1) }));
      fastify.post('/category', async (request) => paged(await browse(one(request.body?.id), '', pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await browse('', one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
