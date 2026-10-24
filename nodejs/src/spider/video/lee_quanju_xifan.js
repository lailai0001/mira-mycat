import req from '../../util/req.js';
// 西饭（LeeCatPaw lee_duoju_xifan / lee_quanju_xifan / lee_zhenguo_fanguo 共享实现）：
// 直连 xifan-api-cn.youlishipin.com；vod_id 带 @source 后缀（bundle 原设计）。
const host = 'https://xifan-api-cn.youlishipin.com';
const cats = [['all', '全部', '68', '都市'], ['dushi', '都市', '68', '都市'], ['qingchun', '青春', '68', '青春'], ['xiandaiyanqing', '现代言情', '81', '现代言情'], ['haomen', '豪门', '81', '豪门'], ['danvzhu', '大女主', '80', '大女主'], ['nixi', '逆袭', '79', '逆袭'], ['dalianuecha', '打脸虐渣', '79', '打脸虐渣'], ['chuanyue', '穿越', '81', '穿越']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function call(path) {
  const r = await req({ method: 'GET', url: `${host}${path}`, headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'okhttp/4.10.0' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`西饭接口 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (!result.result) throw new Error('西饭接口无数据');
  return result.result;
}
function cards(items, category) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.duanjuId || item?.duanjuID), name = clean(item?.title);
    if (!id || !name) return [];
    const vodId = item.source ? `${id}@${item.source}` : id;
    if (seen.has(vodId)) return [];
    seen.add(vodId);
    return [{ vod_id: vodId, vod_name: name, vod_pic: clean(item.coverImageUrl), vod_remarks: item.total ? `共${item.total}集` : '', vod_class: category }];
  });
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 30 ? page + 1 : page, limit: 30, total: list.length });
async function listing(id, page) {
  const [, display, catId, catName] = cats.find(([key]) => key === id) || cats[0];
  const path = `/xifan/drama/portalPage?reqType=aggregationPage&offset=${(page - 1) * 30}&categoryId=${catId}&categoryNames=${encodeURIComponent(catName)}&pageID=page_theater&appId=drama`;
  const data = await call(path);
  return cards((data.elements || []).flatMap((el) => (el.contents || []).map((x) => x.duanjuVo)), display);
}
async function search(wd, page) {
  if (!wd) return paged([], page);
  const requestId = `${Date.now()}aa498144140ef297`;
  const path = `/xifan/search/getSearchList?reqType=search&offset=${(page - 1) * 30}&keyword=${encodeURIComponent(wd)}&requestId=${requestId}&appId=drama`;
  const data = await call(path);
  return paged(cards((data.elements || []).flatMap((el) => (el.contents || []).map((content) => content.duanjuVo)), '西饭'), page);
}
const splitId = (id) => { const at = id.indexOf('@'); return at < 0 ? [id, ''] : [id.slice(0, at), id.slice(at + 1)]; };
async function detailData(id) {
  const [vid, source] = splitId(id);
  return call(`/xifan/drama/getDuanjuInfo?duanjuId=${encodeURIComponent(vid)}&source=${encodeURIComponent(source)}&appId=drama`);
}
async function detail(id) {
  const data = await detailData(id), seen = new Set(), episodes = [];
  for (const [index, ep] of (data.episodeList || []).entries()) {
    const n = Number(ep.index) || index + 1;
    if (seen.has(n)) continue;
    seen.add(n); episodes.push({ n, item: `第${n}集$xifan://${id}/${n}` });
  }
  episodes.sort((a, b) => a.n - b.n);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(data.title), vod_pic: clean(data.coverImageUrl), vod_content: clean(data.desc || data.description), vod_remarks: `共${episodes.length}集`, vod_play_from: '西饭', vod_play_url: episodes.map((x) => x.item).join('#') }] };
}
async function play(raw) {
  const match = raw.match(/^xifan:\/\/(.+)\/(\d+)$/);
  if (!match) throw new Error('西饭分集 ID 无效');
  const data = await detailData(match[1]);
  const ep = (data.episodeList || []).find((item, index) => (Number(item.index) || index + 1) === Number(match[2]));
  const url = clean(ep?.playUrl);
  if (!/^https?:\/\//.test(url)) throw new Error('西饭未返回媒体地址');
  return { parse: 0, url, header: { 'User-Agent': 'Mozilla/5.0', Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_quanju_xifan', name: '全聚合短剧 · 西饭', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('all', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
