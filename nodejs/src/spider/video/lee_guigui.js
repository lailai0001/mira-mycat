import req from '../../util/req.js';
// 鬼鬼 • 搜索（LeeCatPaw lee_guigui）：网盘搜索，直连 api.guiguiya.com；
// 详情/播放按猫源网盘惯例（pan_hub.js）：每条分享各占一集，play 原样透传；App 内点播仍需网盘解析层。
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function searchCloud(keyword) {
  const r = await req({ method: 'GET', url: `https://api.guiguiya.com/api/video/duanju?act=search&name=${encodeURIComponent(keyword)}`, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36' }, timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (Number(result.code) !== 200) return [];
  return (result.data || []).filter((item) => String(item.name || '').includes(keyword)).map((item) => ({ vod_id: String(item.url || ''), vod_name: String(item.name || ''), vod_remarks: `共${item.episodes || 0}集`, vod_pic: String(item.cover || '') }));
}
export default function createSpider() {
  return {
    meta: { key: 'lee_guigui', name: '鬼鬼 • 搜索', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
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
