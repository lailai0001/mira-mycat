import req from '../../util/req.js';
// 百酷 • 搜索（LeeCatPaw lee_baiku）：网盘搜索，直连 api.kuleu.com（bddj 接口）；
// 详情/播放按猫源网盘惯例（pan_hub.js）：每条分享各占一集（分享N$<地址>），play 原样透传。
// 注意：App 内点开即播仍需网盘解析层（与 pan_hub 相同缺口），此处只保证分享真实出线。
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function searchCloud(keyword) {
  const r = await req({ method: 'GET', url: `https://api.kuleu.com/api/bddj?text=${encodeURIComponent(keyword)}`, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36' }, timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  return (result.data || []).filter((item) => String(item.name || '').includes(keyword)).map((item) => ({ vod_id: String(item.viewlink || ''), vod_name: String(item.name || ''), vod_remarks: String(item.addtime || ''), vod_pic: '' }));
}
export default function createSpider() {
  return {
    meta: { key: 'lee_baiku', name: '百酷 • 搜索', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [], list: [] }));
      fastify.post('/category', async () => ({ page: 1, pagecount: 1, list: [] }));
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        return { page, pagecount: page, list: await searchCloud(keyword) };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!id) return { list: [] };
        return { list: [{ vod_id: id, vod_name: id, vod_play_from: '网盘分享', vod_play_url: `分享1$${id}` }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
