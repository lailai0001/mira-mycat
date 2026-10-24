import req from '../../util/req.js';
import cheerio from 'cheerio';
// 高清点播4K（LeeCatPaw lee_hqvod4k 移植，替换 mycat 原 py_hqvod4k；key/名/meta 不变，只换实现）。
// 直连 hqvod.com；原 bundle 用 bridge.html，猫端用 cheerio（仓内已有依赖）。
// 注意与旧版的差异（见批报告）：旧版详情另有 /bofang/ 逐集翻页补全与播放页 next 链接逻辑，Lee 版无；
// Lee 版详情按 4k/2160 线路名优先排序，旧版不排序。
const HOST = 'https://hqvod.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (body) => Math.max(1, Number.parseInt(body?.page, 10) || 1);
async function get(path) {
  const url = path.startsWith('http') ? path : `${HOST}${path}`;
  try {
    const r = await req({ method: 'GET', url, headers: { 'User-Agent': UA, Referer: `${HOST}/` }, timeout: 15000, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: `${HOST}/` }, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
function cards(html) {
  const $ = cheerio.load(html), seen = new Set(), list = [];
  $('.public-list-box').each((_, element) => {
    const box = $(element), link = box.find('a[href^="/xiangqing/"]').first();
    const id = /\/xiangqing\/(\d+)\.html/.exec(link.attr('href') || '')?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    list.push({ vod_id: id, vod_name: String(link.attr('title') || ''),
      vod_pic: String(link.find('img').first().attr('data-src') || ''),
      vod_remarks: box.find('.public-list-prb').first().text().trim(),
      vod_score: box.find('.public-prt').first().text().trim() });
  });
  return list;
}
const categories = [['1', '电影'], ['2', '电视剧'], ['3', '动漫'], ['4', '综艺']]
  .map(([type_id, type_name]) => ({ type_id, type_name }));
export default function createSpider() {
  return {
  meta: { key: 'py_hqvod4k', name: '📺点播 - 4K', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: categories, list: cards(await get('/')) }));
    fastify.post('/category', async (request) => {
      const id = String(request.body?.id || '1'), page = pageOf(request.body), ext = request.body?.extend || {};
      const params = new URLSearchParams();
      const kind = String(ext.class || ext['类型'] || ''), year = String(ext.year || ext['年份'] || '');
      if (kind && kind !== '全部') params.set('class', kind);
      if (year && year !== '全部') params.set('year', year);
      if (ext.by === 'hits') params.set('sort', 'hits');
      const query = params.toString();
      const list = cards(await get(`/fenlei/${id}-${page}.html${query ? `?${query}` : ''}`));
      return { list, page, pagecount: page + Number(list.length > 0), limit: list.length || 24, total: 9999 };
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!id) return { list: [] };
      const $ = cheerio.load(await get(`/xiangqing/${id}.html`));
      const title = $('.this-desc-title').first().text().trim();
      if (!title) return { list: [] };
      const info = $('.this-desc-info span').toArray().map((element) => $(element).text().trim());
      const poster = $('.this-pic-bj').first().attr('style') || '';
      const pic = /background-image:\s*url\(['"]?([^)'" ]+)/.exec(poster)?.[1] || '';
      const names = $('a.swiper-slide').toArray().filter((element) => $(element).find('i.fa').length)
        .map((element) => $(element).text().trim().replace(/\d+$/, '').trim());
      const groups = [];
      $('.anthology-list-box.none').each((_, element) => {
        const episodes = [];
        $(element).find('a.hide[href^="/bofang/"]').each((_, link) => {
          const a = $(link), name = a.text().trim();
          episodes.push(`${/^\d{1,4}$/.test(name) ? `第${Number(name)}集` : name.replace(/[$#]/g, '_')}$${a.attr('href')}`);
        });
        if (episodes.length && groups.length < names.length) groups.push(episodes.join('#'));
      });
      const order = groups.map((_, index) => index).sort((a, b) =>
        Number(!/4k|2160/i.test(names[a])) - Number(!/4k|2160/i.test(names[b])));
      const sortedNames = order.map((index) => names[index]);
      const sortedGroups = order.map((index) => groups[index]);
      let remarks = info[3] || '';
      if (remarks.includes('完结') && sortedGroups.length) remarks = `已完结·全${sortedGroups[0].split('#').length}集`;
      return { list: [{ vod_id: id, vod_name: title, vod_pic: pic, vod_score: info[0] || '',
        vod_year: info[1] || '', vod_area: info[2] || '', vod_remarks: remarks,
        vod_content: $('meta[name="description"]').first().attr('content') || '',
        vod_play_from: sortedNames.join('$$$'), vod_play_url: sortedGroups.join('$$$') }] };
    });
    fastify.post('/search', async (request) => {
      const page = pageOf(request.body), word = encodeURIComponent(String(request.body?.wd || ''));
      const list = cards(await get(`/sousuo/-------------.html?wd=${word}&page=${page}`));
      return { list, page, pagecount: page + Number(list.length > 0), limit: list.length || 15, total: 9999 };
    });
    fastify.post('/play', async (request) => {
      const id = one(request.body?.id), page = id.startsWith('http') ? id : `${HOST}${id}`;
      let match;
      try { match = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|ts)/i.exec(await get(page)); }
      catch { match = null; }
      return { parse: match ? 0 : 1, url: match ? match[0] : page,
        header: { 'User-Agent': UA, Referer: `${HOST}/` } };
    });
  }
};
}
