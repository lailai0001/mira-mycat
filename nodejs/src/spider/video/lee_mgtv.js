import req from '../../util/req.js';
// 芒果TV（LeeCatPaw lee_mgtv 移植）：直连芒果官方 API；播放为官方页嗅探（parse:1, jx:1），与 bundle 原实现一致。
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
const mgtvCategories = [['2', '电影'], ['3', '电视剧'], ['4', '综艺'], ['5', '动漫']]
  .map(([type_id, type_name]) => ({ type_id, type_name }));
const mgtvHeaders = { Referer: 'https://so.mgtv.com' };
function mgtvList(items) {
  return (items || []).map((item) => asVideo(item.title, item.playPartId, item.img?.startsWith('//') ? `https:${item.img}` : item.img, item.updateInfo || item.subtitle))
    .filter((item) => item.vod_id && item.vod_name);
}
export default function createSpider() {
  return {
  meta: { key: 'lee_mgtv', name: '芒果TV', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: mgtvCategories }));
    fastify.post('/category', async (request) => {
      const id = String(request.body?.id || '');
      const page = pageOf(request);
      if (!mgtvCategories.some((item) => item.type_id === id)) return { page, pagecount: page, list: [] };
      const url = `https://pianku.api.mgtv.com/rider/list/msite/v2?platform=msite&channelId=${id}&pn=${page}&chargeInfo=&sort=c2`;
      const result = await getJson(url, mgtvHeaders);
      const list = mgtvList(result.data?.hitDocs);
      return { page, pagecount: list.length ? page + 1 : page, list };
    });
    fastify.post('/search', async (request) => {
      const wd = String(request.body?.wd || '').trim();
      const page = pageOf(request);
      if (!wd) return { page, pagecount: page, list: [] };
      const result = await getJson(`https://mobileso.bz.mgtv.com/pc/search/v1?allowedRC=1&q=${encodeURIComponent(wd)}&pn=${page}&pc=10&uid=&corr=1&_support=10000000`, mgtvHeaders);
      const list = (result.data?.contents || []).map((entry) => entry.data).filter((entry) => entry?.sourceList?.length)
        .map((entry) => asVideo(entry.title, entry.sourceList[0].vid, entry.pic, entry.playTime));
      return { page, pagecount: list.length === 10 ? page + 1 : page, list };
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!/^\d+$/.test(id)) return { list: [] };
      const info = await getJson(`https://pcweb.api.mgtv.com/player/vinfo?video_id=${id}`, mgtvHeaders);
      const episodes = [];
      let title = '';
      let description = '';
      for (let page = 1; page <= 20; page++) {
        const result = await getJson(`https://pcweb.api.mgtv.com/episode/list?_support=10000000&version=5.5.35&video_id=${id}&page=${page}&size=30&allowedRC=1`, mgtvHeaders);
        const data = result.data || {};
        title ||= data.info?.title || '';
        description ||= data.info?.desc || '';
        episodes.push(...(data.list || []));
        if (page >= (Number(data.total_page) || 1)) break;
      }
      return { list: [{ vod_id: id, vod_name: title, vod_pic: info.data?.clip_imgurl2 || '', vod_content: description,
        vod_play_from: 'mgtv', vod_play_url: episodes.map((item) => `${`${item.t1 || ''} ${item.t2 || ''}`.trim().replace(/[$#]/g, '_')}$${item.url || ''}`).join('#') }] };
    });
    fastify.post('/play', async (request) => {
      const id = one(request.body?.id);
      return { parse: 1, jx: 1, url: id.startsWith('/') ? `https://www.mgtv.com${id}` : id };
    });
  }
};
}
