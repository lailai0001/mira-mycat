import req from '../../util/req.js';
// 酷我短剧（LeeCatPaw lee_duoju_kuwo）：直连 wapi.kuwo.cn 短剧接口；
// 搜索为站内遍历分类取数后本地过滤（bundle 原设计）；播放经 nmobi.kuwo.cn 取直链。
const api = 'http://wapi.kuwo.cn/openapi/v1/shortplay';
const cats = [['10', '猜你想看'], ['11', '土味爱情'], ['12', '更多精彩'], ['13', '霸道总裁的人生'], ['14', '赘婿当道'], ['15', '漫漫追妻路'], ['16', '家庭情感']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function requestText(url) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': 'okhttp/5.1.0', Accept: 'application/json' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`酷我接口 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function get(url) {
  const result = JSON.parse(await requestText(url));
  if (result.code !== undefined && ![0, 200].includes(Number(result.code))) throw new Error(`酷我接口错误 ${result.code}`);
  return result;
}
function cards(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = String(item?.url || '').trim(), name = String(item?.title || item?.subTitle || '').trim();
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const pic = String(item.img || '').trim();
    return [{ vod_id: id, vod_name: name, vod_pic: pic ? new URL(pic, `${api}/`).href : '', vod_remarks: item.currrentDesc || (item.songNum ? `${item.songNum}集全` : ''), vod_class: '酷我短剧' }];
  });
}
async function listing(category, page) {
  if (page > 60) return [];
  const url = `${api}/moduleMore?currentPage=${page}&moduleId=${encodeURIComponent(category)}&rn=12`;
  return cards((await get(url)).data?.list);
}
const paged = (list, page, total = list.length) => ({ list, page, pagecount: total === list.length && list.length === 12 ? page + 1 : Math.max(1, Math.ceil(total / 12)), limit: 12, total });
async function search(wd, page) {
  if (!wd) return paged([], page);
  const lists = await Promise.all(cats.flatMap(([id]) => [listing(id, 1), listing(id, 2)]));
  const seen = new Set(), hits = [];
  for (const list of lists) for (const item of list) {
    if (item.vod_name.includes(wd) && !seen.has(item.vod_id) && hits.length < 30) { seen.add(item.vod_id); hits.push(item); }
  }
  return paged(hits.slice((page - 1) * 12, page * 12), page, hits.length);
}
async function detail(id) {
  const raw = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  const data = (await get(`${api}/videoList?albumId=${encodeURIComponent(raw)}`)).data || {};
  const episodes = (data.list || []).flatMap((item, index) => {
    const vid = Number(item.mvpayinfo?.vid || 0);
    if (!Number.isInteger(vid) || vid <= 0) return [];
    const name = String(item.name || `第${index + 1}集`).replace(/[$#]/g, '_');
    return [`${name}$kuwo://${raw}/${vid}`];
  });
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: raw, vod_name: data.shortinfo?.title || `酷我短剧 ${raw}`, vod_pic: data.shortinfo?.cover || '', vod_remarks: `共${episodes.length}集`, vod_play_from: '酷我', vod_play_url: episodes.join('#') }] };
}
async function play(id) {
  const vid = id.slice(id.lastIndexOf('/') + 1);
  if (!/^\d+$/.test(vid)) throw new Error('酷我分集 ID 无效');
  const result = await requestText(`http://nmobi.kuwo.cn/mobi.s?f=web&type=get_url_by_vid&vid=${vid}`);
  const media = result.match(/^\s*url=(\S+)/m)?.[1] || '';
  if (!/^https?:\/\//.test(media)) throw new Error('酷我未返回媒体地址');
  return { parse: 0, url: media, header: { 'User-Agent': 'okhttp/5.1.0' } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_kuwo', name: '多聚短剧 · 酷我', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('10', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id) || '10', pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
