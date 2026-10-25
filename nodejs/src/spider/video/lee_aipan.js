import req from '../../util/req.js';
// 爱盼 • 4K（LeeCatPaw lee_aipan）：直连 www.aipan.me；
// 详情取 panLinks 分享链接，猫端按网盘惯例出“网盘分享”分集、play 原样透传；App 内点播仍需网盘解析层。
const headers = { Referer: 'https://www.aipan.me/', Accept: 'application/json, text/plain, */*' };
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function getJson(url) {
  const r = await req({ method: 'GET', url, headers, timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
function aipanList(items) {
  return (items || []).map((item) => ({ vod_id: String(item.id || ''), vod_name: String(item.title || ''), vod_remarks: `评分：${item.rate || '0'}`, vod_pic: String(item.cover || '') }));
}
export default function createSpider() {
  return {
    meta: { key: 'lee_aipan', name: '爱盼 • 4K', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [{ type_id: 'top250=1', type_name: 'TOP250' }, { type_id: 'sort=latest', type_name: '最新发布' }, { type_id: 'imdbMin=8&sort=latest', type_name: '高分精选' }] }));
      fastify.post('/category', async (request) => {
        const id = String(request.body?.id || '');
        const page = pageOf(request);
        if (!['top250=1', 'sort=latest', 'imdbMin=8&sort=latest'].includes(id)) return { page, pagecount: page, list: [] };
        const result = await getJson(`https://www.aipan.me/api/movies/list?${id}&page=${page}&pageSize=30`);
        return { page, pagecount: Math.max(1, Math.ceil((Number(result.total) || 0) / (Number(result.pageSize) || 30))), limit: result.pageSize || 30, total: result.total || 0, list: aipanList(result.movies) };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        const result = await getJson(`https://www.aipan.me/api/movies/search?q=${encodeURIComponent(keyword)}`);
        return { page, pagecount: page, list: aipanList(result.movies) };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!/^[A-Za-z0-9_-]+$/.test(id)) return { list: [] };
        const item = await getJson(`https://www.aipan.me/api/movies/detail/${id}`);
        const links = [...new Set((item.panLinks || []).map((link) => link.url).filter((url) => {
          try { return /^https?:\/\//.test(url); } catch { return false; }
        }))].slice(0, 20);
        return { list: [{ vod_id: id, vod_name: item.title || '', vod_content: item.synopsis || '', vod_year: item.year || '', vod_area: item.region || '', vod_director: (item.directors || []).join(','), vod_actor: (item.actors || []).join(','), vod_remarks: `评分：${item.imdbRating || '0'}`, vod_play_from: '网盘分享', vod_play_url: links.map((url, i) => `分享${i + 1}$${url}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
