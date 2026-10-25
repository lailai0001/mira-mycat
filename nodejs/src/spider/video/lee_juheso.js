import req from '../../util/req.js';
// 聚合 • 搜索（LeeCatPaw lee_juheso）：网盘搜索，直连 so.n13.club（站方搜索后端，按 bundle 原样保留）；
// 搜索只出第 1 页：先按网盘类型分组出文件夹卡片（vod_id 为 base64url 编码的 {group, keyword}），
// 点文件夹进 category 列出该组分享；详情/播放按猫源网盘惯例：每条分享各占一集，play 原样透传；App 内点播仍需网盘解析层。
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function searchApi(keyword) {
  const r = await req({ method: 'GET', url: `https://so.n13.club/api/search.php?kw=${encodeURIComponent(keyword)}&format=merged&page_size=50&page=1`, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36' }, timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (Number(result.code) !== 0) return {};
  return result.data?.merged_by_type || {};
}
export default function createSpider() {
  return {
    meta: { key: 'lee_juheso', name: '聚合 • 搜索', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [], list: [] }));
      fastify.post('/category', async (request) => {
        let info;
        try { info = JSON.parse(Buffer.from(String(request.body?.id || ''), 'base64url').toString('utf8')); } catch { return { list: [] }; }
        if (!info || !/^[a-zA-Z0-9_-]{1,30}$/.test(info.group) || typeof info.keyword !== 'string' || info.keyword.length > 100) return { list: [] };
        const merged = await searchApi(info.keyword);
        return { page: 1, pagecount: 1, list: (merged[info.group] || []).map((item) => ({ vod_id: String(item.url || ''), vod_name: String(item.note || ''), vod_remarks: '', vod_pic: '' })) };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        if (page !== 1) return { page, pagecount: page, list: [] };
        const merged = await searchApi(keyword);
        const list = Object.entries(merged).filter(([group]) => group !== '115' && group !== 'other').map(([group, items]) => ({ vod_id: Buffer.from(JSON.stringify({ group, keyword })).toString('base64url'), vod_name: `${group} (${items.length}个)`, vod_remarks: '', vod_pic: '', vod_tag: 'folder', style: { type: 'list' } }));
        return { page, pagecount: page, list };
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
