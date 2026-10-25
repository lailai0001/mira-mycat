import req from '../../util/req.js';
// 米搜 • 搜索（LeeCatPaw lee_misou）：网盘搜索，直连 gesoso.fun / misoso.shop 默认站（bundle 的配置覆盖项无猫端通道，
// 故只用默认两站轮询）；详情/播放按猫源网盘惯例（pan_hub.js）：每条分享各占一集，play 原样透传；App 内点播仍需网盘解析层。
const hosts = ['http://gesoso.fun', 'http://www.misoso.shop'];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function searchCloud(keyword) {
  let lastError;
  for (const host of hosts) {
    try {
      const r = await req({ method: 'GET', url: `${host.replace(/\/$/, '')}/api/disks/search?keyword=${encodeURIComponent(keyword)}&last_weight=0&last_id=0`, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36', Referer: host }, timeout: 12000, responseType: 'text', validateStatus: () => true });
      if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
      const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
      return (result.data || []).map((item) => ({ vod_id: String(item.disk_url || ''), vod_name: String(item.disk_name || ''), vod_remarks: `${item.disk_type || ''}网盘`, vod_pic: '' }));
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('米搜站点不可用');
}
export default function createSpider() {
  return {
    meta: { key: 'lee_misou', name: '米搜 • 搜索', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
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
