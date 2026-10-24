import req from '../../util/req.js';
// 爱奇艺（LeeCatPaw lee_iqiyi 移植）：直连爱奇艺官方 PC 端 API；
// 播放为官方页嗅探（parse:1, jx:1），与 bundle 原实现一致。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/91.0.4472.114 Safari/537.36';
async function getJson(url, headers = {}) {
  try {
    const r = await req({ method: 'GET', url, headers: Object.assign({ 'User-Agent': UA }, headers), timeout: 15000, responseType: 'text', maxRedirects: 5 });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    return JSON.parse(text);
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers), signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.json();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
const asVideo = (name, id, pic = '', remarks = '') => ({ vod_id: String(id || ''), vod_name: String(name || ''), vod_pic: String(pic || ''), vod_remarks: String(remarks || '') });
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const iqiyiCategories = [['2', '电视'], ['1', '电影'], ['6', '综艺'], ['4', '动漫'], ['3', '纪录']]
  .map(([type_id, type_name]) => ({ type_id, type_name }));
function iqiyiList(items) {
  return (items || []).map((item) => {
    let id = item.playUrl || '';
    if (item.albumId) id = Number(item.sourceId) ? `/video/video/baseinfo/${item.tvId}?userInfo=verify&jsonpCbName=videoInfo39`
      : `/albums/album/avlistinfo?aid=${item.albumId}&size=5000&page=1&url=${encodeURIComponent(id)}`;
    else if (item.tvId) id = `/video/video/baseinfo/${item.tvId}?userInfo=verify&jsonpCbName=videoInfo39`;
    return asVideo(item.name, id, item.imageUrl?.startsWith('//') ? `https:${item.imageUrl}` : item.imageUrl, item.score);
  }).filter((item) => item.vod_id && item.vod_name);
}
export default function createSpider() {
  return {
  meta: { key: 'lee_iqiyi', name: '爱奇艺', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: iqiyiCategories }));
    fastify.post('/category', async (request) => {
      const id = String(request.body?.id || '');
      const page = pageOf(request);
      if (!iqiyiCategories.some((item) => item.type_id === id)) return { page, pagecount: page, list: [] };
      const url = `https://pcw-api.iqiyi.com/search/video/videolists?channel_id=${id}&is_purchase=&mode=24&pageNum=${page}&pageSize=24`;
      const result = await getJson(url);
      const list = iqiyiList(result.data?.list);
      return { page, pagecount: list.length ? page + 1 : page, limit: 24, list };
    });
    fastify.post('/search', async (request) => {
      const wd = String(request.body?.wd || '').trim();
      const page = pageOf(request);
      if (!wd) return { page, pagecount: page, list: [] };
      const result = await getJson(`https://search.video.iqiyi.com/o?if=html5&key=${encodeURIComponent(wd)}&pageNum=${page}&pos=1&pageSize=20`);
      const list = (result.data?.docinfos || []).map((item) => item.albumDocInfo).filter(Boolean)
        .map((item) => asVideo(item.albumTitle, `/albums/album/avlistinfo?aid=${item.qipu_id}&size=5000&page=1&url=${encodeURIComponent(item.albumLink || '')}`, item.albumImg, item.releaseDate));
      return { page, pagecount: list.length === 20 ? page + 1 : page, list };
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!/^\/(?:albums\/album\/avlistinfo|video\/video\/baseinfo)\?/.test(id)
        && !/^\/video\/video\/baseinfo\/\d+\?/.test(id)) return { list: [] };
      const result = await getJson(`https://pcw-api.iqiyi.com${id}`);
      const data = result.data || {};
      const episodes = data.epsodelist || [data];
      const first = episodes[0] || {};
      return { list: [{ vod_id: id, vod_name: String(first.name || '').replace(/第\d+(?:集|期)/g, ''),
        vod_pic: first.imageUrl?.startsWith('//') ? `https:${first.imageUrl}` : first.imageUrl || '',
        vod_content: first.description || '', vod_remarks: first.duration || '', vod_play_from: 'iqiyi',
        vod_play_url: episodes.map((item) => `${`${item.order || ''} ${item.subtitle || ''}`.trim().replace(/[$#]/g, '_')}$${item.playUrl || ''}`).join('#') }] };
    });
    fastify.post('/play', async (request) => ({ parse: 1, jx: 1, url: one(request.body?.id) }));
  }
};
}
