import req from '../../util/req.js';
// 即刻 • 4K（LeeCatPaw lee_jike）：直连 api.uuuka.com；
// bundle 的详情走站内 push 展开：分享链接→网盘分享出线，普通视频地址→直连/嗅探/解析三线（原 hook 行为）。
// 猫端复现：分享出“网盘分享”一集，普通地址出三线；play 按 flag 分发（无 flag 时原样透传）。
// App 内点播网盘分享仍需网盘解析层（与 pan_hub 相同缺口）。
const shareHosts = /(?:aliyundrive\.com|alipan\.com|pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|cloud\.189\.cn|123[a-zA-Z0-9]{3}\.(?:com|cn)|pan\.xunlei\.com|guangyapan\.com|caiyun\.139\.com|yun\.139\.com)$/i;
const classes = [['movie', '电影'], ['tv', '电视剧'], ['dongman', '动漫'], ['post', '短剧']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const isShare = (url) => { try { return shareHosts.test(new URL(url).hostname); } catch { return false; } };
async function getJson(url) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36' }, timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
function jikeList(items) {
  return (items || []).filter((item) => item.source_link && item.title).map((item) => {
    const title = String(item.title);
    const matched = title.match(/《([^》]+)》/);
    return { vod_id: String(item.source_link), vod_name: matched ? matched[1] : title, vod_remarks: String(item.update_time || ''), vod_pic: '' };
  });
}
export default function createSpider() {
  return {
    meta: { key: 'lee_jike', name: '即刻 • 4K', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: classes }));
      fastify.post('/category', async (request) => {
        const id = String(request.body?.id || '');
        const page = pageOf(request);
        if (!classes.some((item) => item[0] === id)) return { page, pagecount: page, list: [] };
        const result = await getJson(`https://api.uuuka.com/api/contents/${id}?page=${page}&limit=20`);
        return { page, pagecount: result.data?.total_pages || page, limit: 20, total: result.data?.total || 0, list: result.success ? jikeList(result.data?.items) : [] };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        const result = await getJson(`https://api.uuuka.com/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=20`);
        return { page, pagecount: result.data?.total_pages || page, list: result.success ? jikeList(result.data?.items) : [] };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!id) return { list: [] };
        if (isShare(id)) return { list: [{ vod_id: id, vod_name: id, vod_play_from: '网盘分享', vod_play_url: `分享1$${id}` }] };
        return { list: [{ vod_id: id, vod_name: '在线视频', vod_content: id, vod_play_from: '直连$$$嗅探$$$解析', vod_play_url: `播放$${id}$$$播放$${id}$$$播放$${id}` }] };
      });
      fastify.post('/play', async (request) => {
        const id = one(request.body?.id);
        const flag = String(request.body?.flag || '');
        if (flag === '嗅探') return { parse: 1, url: id };
        if (flag === '解析') return { parse: 2, jx: '1', url: id };
        return { parse: 0, url: id };
      });
    },
  };
}
