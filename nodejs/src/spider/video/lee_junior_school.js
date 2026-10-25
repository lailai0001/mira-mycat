import req from '../../util/req.js';
// 初中 | 课堂（LeeCatPaw lee_junior_school）：直连 api.bilibili.com 官方搜索/详情/播放接口；
// bundle 的 Bilibili Cookie 配置项无猫端通道，故只用无 Cookie 形态（与 bundle 未配置时一致）；
// 播放优先取官方 durl 直链，无直链时回落 parse:1 的 B 站页面（bundle 原设计）。
const subjects = { math: '初中数学', chinese: '初中语文', english: '初中英语', physics: '初中物理', chemistry: '初中化学', biology: '初中生物', history: '初中历史', geography: '初中地理', politics: '初中道法' };
const filters = Object.fromEntries(Object.keys(subjects).map((id) => [id, [
  { key: 'grade', name: '年级', value: [{ n: '全部', v: '' }, { n: '初一', v: '初一' }, { n: '初二', v: '初二' }, { n: '初三', v: '初三' }] },
  { key: 'order', name: '排序', value: [{ n: '综合', v: 'totalrank' }, { n: '最多播放', v: 'click' }, { n: '最新发布', v: 'pubdate' }, { n: '最多弹幕', v: 'dm' }] },
]]));
const headers = { Accept: 'application/json, text/plain, */*', Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36' };
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const schoolText = (value) => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const schoolPic = (value) => String(value || '').replace(/^\/\//, 'https://');
async function schoolApi(path, params) {
  const r = await req({ method: 'GET', url: `https://api.bilibili.com${path}?${new URLSearchParams(params)}`, headers, timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (Number(result.code) !== 0) throw new Error(result.message || 'Bilibili request failed');
  return result.data || {};
}
async function schoolSearch(keyword, page, order = 'totalrank') {
  const data = await schoolApi('/x/web-interface/search/type', { search_type: 'video', keyword, page, order });
  const list = (data.result || []).filter((item) => /^BV[0-9A-Za-z]+$/.test(String(item.bvid || ''))).map((item) => ({ vod_id: item.bvid, vod_name: schoolText(item.title), vod_pic: schoolPic(item.pic), vod_remarks: schoolText(item.author) }));
  const pagecount = Math.max(page, Number(data.numPages) || (list.length ? page + 1 : page));
  return { page, pagecount, limit: list.length, total: Number(data.numResults) || list.length, list };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_junior_school', name: '初中 | 课堂', type: 3, searchable: 1, quickSearch: 0, filterable: 1 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: Object.entries(subjects).map(([type_id, type_name]) => ({ type_id, type_name })), filters }));
      fastify.post('/category', async (request) => {
        const page = pageOf(request);
        const keyword = subjects[String(request.body?.id || '')];
        const extend = request.body?.extend || {};
        const grade = ['初一', '初二', '初三'].includes(extend.grade) ? extend.grade : '';
        const order = ['totalrank', 'click', 'pubdate', 'dm'].includes(extend.order) ? extend.order : 'totalrank';
        return keyword ? schoolSearch(`${keyword}${grade ? ` ${grade}` : ''}`, page, order) : { page, pagecount: page, list: [] };
      });
      fastify.post('/search', async (request) => {
        const page = pageOf(request);
        const keyword = String(request.body?.wd || '').trim();
        return keyword ? schoolSearch(keyword, page) : { page, pagecount: page, list: [] };
      });
      fastify.post('/detail', async (request) => {
        const bvid = String(Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id || '');
        if (!/^BV[0-9A-Za-z]+$/.test(bvid)) return { list: [] };
        const data = await schoolApi('/x/web-interface/view', { bvid });
        const pages = data.pages?.length ? data.pages : [{ cid: data.cid, part: data.title }];
        return { list: [{ vod_id: bvid, vod_name: schoolText(data.title), vod_pic: schoolPic(data.pic), vod_content: String(data.desc || ''), vod_actor: String(data.owner?.name || ''), vod_play_from: '哔哩哔哩', vod_play_url: pages.filter((part) => Number(part.cid) > 0).map((part, index) => `${schoolText(part.part || `第${index + 1}集`).replace(/[$#]/g, ' ')}$${bvid}_${part.cid}`).join('#') }] };
      });
      fastify.post('/play', async (request) => {
        const match = String(request.body?.id || '').match(/^(BV[0-9A-Za-z]+)_(\d+)$/);
        if (!match) return { parse: 0, url: '' };
        const data = await schoolApi('/x/player/playurl', { bvid: match[1], cid: match[2], qn: 80, fnval: 0 });
        const url = String(data.durl?.[0]?.url || '');
        return url ? { parse: 0, url, header: { 'User-Agent': headers['User-Agent'], Referer: headers.Referer } } : { parse: 1, url: `https://www.bilibili.com/video/${match[1]}` };
      });
    },
  };
}
