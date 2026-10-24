import req from '../../util/req.js';
// 星果（LeeCatPaw lee_duoju_wusheng / lee_zhenguo_xingguo / lee_quanju_xingxing 共享实现）：
// 直连 read.api.duodutek.com；固定 productId/vestId/token 为 bundle 内嵌的客户端参数。
const host = 'http://read.api.duodutek.com';
const fixed = { productId: '2a8c14d1-72e7-498b-af23-381028eb47c0', vestId: '2be070e0-c824-4d0e-a67a-8f688890cadb', channel: 'oppo19', osType: 'android', version: '20', token: '202509271001001446030204698626' };
const categories = [['1287', '甜宠'], ['1288', '逆袭'], ['1289', '热血'], ['1290', '现代'], ['1291', '古代']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function get(path, query) {
  const url = `${host}${path}?${new URLSearchParams({ ...fixed, ...query })}`;
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': 'okhttp/5.1.0', Accept: 'application/json' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`星果接口 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (result.code !== undefined && ![0, 200].includes(Number(result.code))) throw new Error(`星果接口错误 ${result.code}`);
  return result;
}
const cards = (rows) => (Array.isArray(rows) ? rows : []).flatMap((row) => {
  const id = clean(row?.id || row?.bookId), name = clean(row?.name || row?.title);
  if (!id || !name) return [];
  return [{ vod_id: `${id}@${name}`, vod_name: name, vod_pic: clean(row.icon || row.cover), vod_remarks: row.chapterCount ? `全${row.chapterCount}集` : `${clean(row.heat)}播放`, vod_content: clean(row.introduction || row.desc) }];
});
const paged = (list, page) => ({ list, page, pagecount: list.length === 20 ? page + 1 : page, limit: 20, total: list.length });
async function listing(id, page) {
  const data = (await get('/novel-api/app/pageModel/getResourceById', { resourceId: id, pageNum: page, pageSize: 20 })).data || {};
  return paged(cards(data.datalist), page);
}
async function search(keyword, page) {
  const data = (await get('/novel-api/basedata/book/searchBook', { key: keyword, pageNum: page, pageSize: 20 })).data || {};
  return paged(cards(data.datalist), page);
}
function media(chapter) {
  for (const group of chapter.shortPlayList || []) for (const video of group.chapterShortPlayVoList || []) {
    if (/^https?:\/\//.test(clean(video.shortPlayUrl))) return video.shortPlayUrl;
  }
  return '';
}
async function detail(raw) {
  const [bookId, ...title] = raw.split('@');
  if (!bookId) return { list: [] };
  const response = await get('/novel-api/basedata/book/getChapterList', { bookId });
  const chapters = Array.isArray(response.data) ? response.data : [];
  const episodes = chapters.flatMap((chapter, index) => {
    const url = media(chapter);
    if (!url) return [];
    const name = clean(chapter.chapterName) || `第${chapter.chapterIndex || index + 1}集`;
    return [`${name.replace(/[$#]/g, '_')}$${url}`];
  });
  if (!episodes.length) return { list: [] };
  const first = chapters[0] || {};
  return { list: [{ vod_id: raw, vod_name: title.join('@') || clean(first.bookName), vod_pic: clean(first.iconUrl || first.icon), vod_content: clean(first.introduction), vod_play_from: '星果', vod_play_url: episodes.join('#') }] };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_wusheng', name: '多聚短剧 · 无声', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: categories.map(([type_id, type_name]) => ({ type_id, type_name })), list: (await listing('1287', 1)).list }));
      fastify.post('/category', async (request) => listing(one(request.body?.id) || '1287', pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => {
        const url = one(request.body?.id);
        if (!/^https?:\/\//.test(url)) throw new Error('星果分集没有可播放地址');
        return { parse: 0, url, header: { 'User-Agent': 'okhttp/5.1.0' } };
      });
    },
  };
}
