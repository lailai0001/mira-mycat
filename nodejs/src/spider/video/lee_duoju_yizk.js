import req from '../../util/req.js';
// 一直看（LeeCatPaw lee_duoju_yizk）：直连 1zk.top / 1zk.me 域名池；
// 池内逐条重试、耗尽后向 yizk.net / 7kan.net 的路由表刷新域名（bundle 原设计）。
let hosts = ['https://1zk.top', 'https://1zk.me'], current = hosts[0];
const ua = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const fixedCats = [['all', '全部'], ['sqqsfvqirt0c', '华语'], ['jr4jltgb5bct', '东瀛'], ['967tfsdaht5i', '欧美'], ['ovamj5o7x0gs', '三级'], ['fs7hmy32jqfm', 'Ai短剧']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function requestJson(host, path, body) {
  const r = await req({ method: body ? 'POST' : 'GET', url: host + path, headers: { 'User-Agent': ua, Accept: 'application/json', Referer: host + '/', ...(body ? { 'Content-Type': 'application/json' } : {}) }, data: body ? JSON.stringify(body) : undefined, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`一直看 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (result.code !== 0) throw new Error(`一直看错误 ${result.code}`);
  return result.data;
}
async function refreshHosts() {
  for (const entry of ['yizk.net', '7kan.net']) {
    try {
      const r = await req({ method: 'GET', url: `https://${entry}/api/router/list`, headers: { 'User-Agent': ua }, timeout: 15000, responseType: 'text', validateStatus: () => true });
      const routes = (JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''))).data?.routes || [];
      const found = routes.map((x) => x.domain ? `https://${x.domain}` : '').filter(Boolean);
      if (found.length) return found;
    } catch { /* 当前入口不可达时尝试下一条。 */ }
  }
  return [];
}
async function api(path, body) {
  for (let round = 0; round < 2; round++) {
    for (const host of hosts) {
      try { const data = await requestJson(host, path, body); current = host; return data; }
      catch { /* 域名池逐条重试。 */ }
    }
    const refreshed = await refreshHosts();
    if (!refreshed.length) break;
    hosts = refreshed;
  }
  throw new Error('一直看所有入口不可用');
}
function cards(data) {
  return (data?.list || []).filter((r) => r.token && r.title).map((r) => ({ vod_id: String(r.token), vod_name: String(r.title), vod_pic: r.cover_url || '', vod_remarks: Number(r.episode_count) > 1 ? `共${r.episode_count}集` : '', vod_class: r.category?.name || '' }));
}
async function listing(cat, page, wd = '') {
  if (page > 100) return [];
  const path = wd ? `/api/v1/films?keyword=${encodeURIComponent(wd)}&page=${page}&pageSize=24`
    : cat && cat !== 'all' ? `/api/v1/categories/${encodeURIComponent(cat)}/films?page=${page}&pageSize=24`
      : `/api/v1/films?page=${page}&pageSize=24`;
  return cards(await api(path));
}
async function categories() {
  const found = new Map(fixedCats);
  for (const row of await api('/api/v1/categories')) {
    if (row?.token && row?.name && (!row.parent_id || Number(row.parent_id) === 0)) found.set(String(row.token), String(row.name));
  }
  return [...found].map(([type_id, type_name]) => ({ type_id, type_name }));
}
async function detail(id) {
  const row = await api(`/api/v1/films/${encodeURIComponent(id)}`);
  const count = Math.min(1000, Math.max(1, Number(row.episode_count) || 1));
  return { list: [{ vod_id: row.token || id, vod_name: row.title || id, vod_pic: row.cover_url || '', vod_content: row.description || '', vod_class: row.category?.name || '', vod_remarks: `共${count}集`, vod_play_from: '一直看', vod_play_url: Array.from({ length: count }, (_, i) => `第${i + 1}集$yizk://${id}/${i + 1}`).join('#') }] };
}
async function play(id) {
  const match = /^yizk:\/\/([^/]+)\/(\d+)$/.exec(id);
  if (!match) throw new Error('一直看分集 ID 无效');
  const data = await api(`/api/v1/films/${encodeURIComponent(match[1])}/play`, { episode: Number(match[2]), source: 'direct' });
  if (!/^https?:\/\//.test(data?.playUrl || '')) throw new Error('一直看播放地址无效');
  return { parse: 0, url: data.playUrl, header: { Referer: current + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 24 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_yizk', name: '多聚短剧 · 一直看', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: await categories(), list: await listing('all', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await listing('', pageOf(request), one(request.body?.wd)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
