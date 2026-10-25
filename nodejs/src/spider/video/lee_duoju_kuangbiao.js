import req from '../../util/req.js';
// 狂飙（LeeCatPaw lee_duoju_kuangbiao）：直连 ai.dramarush.tv 的 tRPC 接口；
// 详情/播放只列免费集（locked/付费集按原法过滤），播放为 raw.shorttv.online 直链 mp4。
// 搜索按原法即分类页本地过滤；分类页最多翻到第 6 页（pageOf 上限 6）。
const base = 'https://ai.dramarush.tv', ua = 'Mozilla/5.0 (Linux; Android 12; Mobile)';
const cats = [['t-5jxcit', '短剧'], ['normal_short', '正规短剧'], ['adult_short', '成人短剧']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.min(6, Math.max(1, Number.parseInt(request.body?.page, 10) || 1));
async function trpc(name, data) {
  const url = `${base}/api/trpc/${name}?input=${encodeURIComponent(JSON.stringify({ json: data }))}`;
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, Referer: base + '/zh/', Accept: 'application/json, text/plain, */*' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`狂飙 HTTP ${r.status}`);
  return (JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '')))?.result?.data?.json || {};
}
const drama = (item) => item?.drama || item || {};
const card = (item, cat) => {
  const d = drama(item), id = String(d.id || ''), title = String(d.title || '').trim();
  if (!id || !title) return null;
  const pic = String(d.cover || d.poster || '').replace('cdn.shorttv.online/lsj/', 'raw.shorttv.online/lsj/');
  return { vod_id: id, vod_name: title, vod_pic: pic, vod_remarks: d.totalEpisodes ? `${d.totalEpisodes}集` : '', vod_class: cat, vod_content: String(d.description || '') };
};
const spec = (cat) => cat === 'normal_short' ? { contentKind: 'SHORT_DRAMA' } : cat === 'adult_short' ? { tagSlug: 'adult' } : { categorySlug: 't-5jxcit' };
async function listing(cat, page) {
  let cursor = '', data = {}, catName = cats.find(([id]) => id === cat)?.[1] || cats[0][1];
  for (let i = 1; i <= page; i++) {
    data = await trpc('feed.browse', { limit: 12, ...spec(cat), ...(cursor ? { cursor } : {}) });
    cursor = String(data.nextCursor || '');
    if (!cursor && i < page) return [];
  }
  return (data.items || []).map((item) => card(item, catName)).filter(Boolean);
}
async function detail(id) {
  if (!/^[a-z0-9-]{8,80}$/i.test(id)) throw new Error('狂飙剧集 ID 无效');
  const body = await trpc('episode.watch', { dramaId: id, episodeNumber: 1 });
  const d = body.drama || {};
  const episodes = (body.episodes || []).filter((ep) => ep?.index > 0 && ep?.id && !ep.locked && !ep.unavailable && (ep.isFree || ep.accessState === 'FREE'));
  if (!episodes.length) return { list: [] };
  const total = Math.min(80, Math.max(Number(d.totalEpisodes) || 0, episodes.length));
  const play = episodes.filter((ep) => Number(ep.index) <= 80).map((ep) => `第${ep.index}集$kuangbiao://${id}/${ep.index}`).join('#');
  return { list: [{ vod_id: id, vod_name: d.title || id, vod_pic: d.cover || d.poster || '', vod_content: d.description || '', vod_remarks: `可播${episodes.length}集/共${total}集`, vod_play_from: '狂飙', vod_play_url: play }] };
}
async function play(id) {
  const match = /^kuangbiao:\/\/([a-z0-9-]{8,80})\/(\d+)$/i.exec(id);
  if (!match) throw new Error('狂飙分集 ID 无效');
  const no = Number(match[2]), body = await trpc('episode.watch', { dramaId: match[1], episodeNumber: no });
  const ep = (body.episodes || []).find((row) => Number(row.index) === no && row.id && !row.locked && !row.unavailable && (row.isFree || row.accessState === 'FREE'));
  const epId = ep?.id;
  if (!epId) throw new Error('狂飙分集不存在');
  const url = `https://raw.shorttv.online/uploads/direct/${epId}/video.mp4`;
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: base + '/zh/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 12 ? page + 1 : page, limit: 12, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_kuangbiao', name: '多聚短剧 · 狂飙', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing(cats[0][0], 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => {
        const wd = one(request.body?.wd), page = pageOf(request);
        return paged(wd ? (await listing(cats[0][0], page)).filter((row) => row.vod_name.includes(wd)) : [], page);
      });
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
