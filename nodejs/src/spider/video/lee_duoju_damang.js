import req from '../../util/req.js';
// 大芒（LeeCatPaw lee_duoju_damang）：直连 damang.api.mgtv.com（芒果大芒短剧接口）；
// 播放经 mobile.api.mgtv.com 取源，最多重试 5 次（bundle 原设计，间隔 1.2 秒）。
const api = 'https://damang.api.mgtv.com';
const did = '2ebfeec0a5ad5c0357bae448b8658cc3';
const cats = [['aiqing', '爱情', '1273154'], ['dushi', '都市', '1279863'], ['guzhuang', '古装', '1273153'], ['yanqing', '言情', '1273190'], ['qihuan', '奇幻', '2924543'], ['zhenrenxiu', '真人秀', '1657120'], ['xuanyi', '悬疑', '1310272'], ['wangju', '网剧', '2844459'], ['qingchun', '青春', '2836677']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function requestText(url) {
  const r = await req({ method: 'GET', url, headers: { Accept: 'application/json, text/plain, */*', Referer: `${api}/` }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`大芒接口 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function get(url) {
  const result = JSON.parse(await requestText(url));
  if (result.code !== undefined && Number(result.code) !== 200) throw new Error(`大芒接口错误 ${result.code}`);
  return result;
}
function cards(items, category) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.albumId), name = clean(item?.albumTitle || item?.title);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const cover = clean(item.verticalImg);
    return [{ vod_id: id, vod_name: name, vod_pic: cover ? new URL(cover, `${api}/`).href : '', vod_remarks: clean(item.albumUpdateSerialNoDesc), vod_class: category }];
  });
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 12 ? page + 1 : page, limit: 12, total: list.length });
async function listing(id, page) {
  const [, tag, tagId] = cats.find(([key]) => key === id) || cats[0];
  const url = `${api}/newbee/manage/page/film/library/v3?did=${did}&pageSize=12&pageNum=${page}&tagName=${encodeURIComponent(tag)}&tagId=${tagId}`;
  return cards((await get(url)).data?.list, tag);
}
async function search(wd, page) {
  const url = `${api}/newbee/search/key/words?keyWords=${encodeURIComponent(wd)}&screenType=1&pageNum=${page}&pageSize=12`;
  return paged(cards((await get(url)).data?.videos, ''), page);
}
async function detail(id) {
  const url = `${api}/newbee/play/page/detail?did=${did}&albumId=${encodeURIComponent(id)}&vid=`;
  const album = (await get(url)).data?.album || {};
  const seen = new Set(), episodes = [];
  for (const [index, item] of (album.anthologies || []).entries()) {
    const vid = clean(item.vid), n = Number(item.serialno) || index + 1;
    if (!vid || seen.has(n)) continue;
    seen.add(n); episodes.push(`第${n}集$damang://${vid}`);
  }
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(album.albumTitle), vod_pic: clean(album.verticalImg), vod_content: clean(album.albumBrief), vod_class: (album.tagList || []).map((x) => clean(x.tagName)).filter(Boolean).join(' · '), vod_remarks: `共${episodes.length}集`, vod_play_from: '大芒', vod_play_url: episodes.join('#') }] };
}
async function play(id) {
  if (!id.startsWith('damang://')) throw new Error('大芒分集 ID 无效');
  const vid = id.slice(9);
  const url = 'http://mobile.api.mgtv.com/v8/video/getSource?playType=28&fileSourceType=2&seekSourceType=2&definition=3&_support=10100001&osVersion=10&videoId=' + encodeURIComponent(vid);
  for (let attempt = 0; attempt < 5; attempt++) {
    const data = (await get(url)).data || {};
    for (const source of data.videoSources || []) {
      const media = clean(source.disp?.info);
      if (/^https?:\/\//.test(media)) return { parse: 0, url: media, header: { 'User-Agent': 'libmpv', Referer: '' } };
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error('大芒没有返回媒体地址');
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_damang', name: '多聚短剧 · 大芒', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing(cats[0][0], 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
