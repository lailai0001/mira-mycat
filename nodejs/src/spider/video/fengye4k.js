import req from '../../util/req.js';
import cheerio from 'cheerio';
// 枫叶4K（LeeCatPaw lee_fengye4k 移植，替换 mycat 原 py_fengye4k；key/名/meta 不变，只换实现）。
// 直连 maihaolian.com；原 bundle 用 bridge.html，猫端用 cheerio（仓内已有依赖）。
// 注意与旧版的差异（见批报告）：旧版另有 /index.php/ajax/data 列表回退与 sid1/2/3 播放回退，Lee 版无这两处；
// Lee 版挑战接口固定走 fgsrg.hzqingshan.com（旧版按线路分流 zzrs/fgsrg）。
const HOST = 'https://maihaolian.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1';
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (body) => Math.max(1, Number.parseInt(body?.page, 10) || 1);
async function reqText(url, body) {
  const method = body ? 'POST' : 'GET';
  const headers = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9',
    ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.ht10010.com/' } : {}) };
  const timeout = 15000;
  try {
    const r = await req({ method, url, headers, data: body, timeout, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
const get = (path) => reqText(path.startsWith('http') ? path : `${HOST}${path}`);
const pic = (value) => String(value || '').startsWith('//') ? `https:${value}` : String(value || '').replace(/&amp;/g, '&');
function cards(html) {
  const $ = cheerio.load(html), seen = new Set(), list = [];
  $('a.public-list-exp[href]').each((_, element) => {
    const a = $(element), id = /\/detail\/(\d+)\.html/.exec(a.attr('href') || '')?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    const image = a.find('img').first();
    const tags = a.find('span.public-prt').toArray().map((tag) => $(tag).text());
    list.push({ vod_id: id, vod_name: (a.attr('title') || image.attr('alt') || '').trim(),
      vod_pic: pic(image.attr('data-src')),
      vod_remarks: a.find('.ft2, .public-list-prb').first().text().trim(), vod_year: tags.join(',') });
  });
  return list;
}
const categories = [['/label/qq', '腾讯VIP精选'], ['/label/bli', 'B站VIP精选'], ['/label/youku', '优酷VIP精选'],
  ['5', '红果短剧'], ['2', '电视剧'], ['1', '电影'], ['4', '动漫'], ['3', '综艺']]
  .map(([type_id, type_name]) => ({ type_id, type_name }));
export default function createSpider() {
  return {
  meta: { key: 'py_fengye4k', name: '🍁枫叶 - 4K', type: 3, searchable: 0, quickSearch: 0, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: categories }));
    fastify.post('/category', async (request) => {
      const id = String(request.body?.id || ''), page = pageOf(request.body), ext = request.body?.extend || {};
      let path;
      if (id.startsWith('/label/')) path = `${id}/page/${page}.html`;
      else {
        const type = String(ext.class || id);
        const area = String(ext.area || ''), genre = String(ext.genre || ''), year = String(ext.year || '');
        const lang = String(ext.lang || ''), letter = String(ext.letter || ''), sort = String(ext.sort || '');
        path = !(area + genre + year + lang + letter + sort)
          ? `/cupfox-list/${type}--------${page}---.html`
          : `/cupfox-list/${[type, area, sort, genre, lang, letter, '', '', page, '', '', year].join('-')}.html`;
      }
      const html = await get(path), list = cards(html);
      const pagecount = Number(/href=["'][^"']*---(\d+)---[^"']*["'][^>]*>\s*尾页/.exec(html)?.[1])
        || page + Number(list.length >= 24);
      return { list, page, pagecount, limit: id.startsWith('/label/') ? 24 : 36, total: 9999 };
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id).split(',')[0].trim();
      if (!id) return { list: [] };
      const $ = cheerio.load(await get(`/detail/${id}.html`));
      let director = '', actor = '';
      $('.slide-info').each((_, element) => {
        const info = $(element).text().trim();
        if (info.startsWith('导演：')) director = info.slice(3).trim();
        if (info.startsWith('演员：')) actor = info.slice(3).trim();
      });
      const names = $('.anthology-tab a.swiper-slide').toArray().map((element) => $(element).text().trim());
      const groups = [];
      $('.anthology-list-box').each((_, block) => {
        const episodes = [];
        $(block).find('li a[href]').each((_, element) => {
          const a = $(element), play = /\/play\/(.*?)\.html/.exec(a.attr('href') || '')?.[1];
          if (play) episodes.push(`${a.text().trim().replace(/[$#]/g, '_')}$${play}`);
        });
        episodes.reverse();
        if (episodes.length && groups.length < names.length) groups.push(episodes.join('#'));
      });
      return { list: [{ vod_id: id, vod_name: $('h3.slide-info-title').first().text().trim(),
        vod_pic: pic($('img.lazy').first().attr('data-src')), vod_director: director, vod_actor: actor,
        vod_content: $('#height_limit').first().text().trim(),
        vod_play_from: names.slice(0, groups.length).join('$$$'), vod_play_url: groups.join('$$$') }] };
    });
    fastify.post('/search', async (request) => {
      const page = pageOf(request.body), word = encodeURIComponent(String(request.body?.wd || ''));
      const list = cards(await get(`/cupfox-search/${word}----------${page}---.html`));
      return { list, page, pagecount: 1, limit: 36, total: list.length };
    });
    fastify.post('/play', async (request) => {
      const id = one(request.body?.id), page = id.startsWith('http') ? id : `${HOST}/play/${id}.html`;
      const html = await get(page), raw = /player_aaaa=(.*?)<\/script>/s.exec(html)?.[1];
      if (raw) {
        let player;
        try { player = JSON.parse(raw); } catch { player = {}; }
        const url = String(player.url || ''), source = String(player.from || '');
        if (/^https?:\/\/.*\.(m3u8|mp4)(?:$|\?)/i.test(url)) return { parse: 0, url, header: { 'User-Agent': UA } };
        const endpoint = source === 'YYNB' ? 'https://zzrs.mfdyvip.com/player/mplayer.php'
          : source === 'JD4K' ? 'https://fgsrg.hzqingshan.com/player/mplayer.php' : '';
        if (endpoint && url) {
          const challenge = await get(`https://fgsrg.hzqingshan.com/player/?url=${encodeURIComponent(url)}`);
          const token = /data-te="(.*?)"/.exec(challenge)?.[1];
          if (token) {
            const result = JSON.parse(await reqText(endpoint, new URLSearchParams({ url, token }).toString()));
            if (result.code === 200 && result.url) return { parse: 0, url: result.url, header: { 'User-Agent': UA } };
          }
        }
      }
      return { parse: 1, url: page };
    });
  }
};
}
