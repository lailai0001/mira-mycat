import req from '../../util/req.js';
import cheerio from 'cheerio';
// 4KMP（LeeCatPaw lee_4kmp 移植）：直连 4kmp.com / 4k-av.com 镜像；原 bundle 用 bridge.html，猫端用 cheerio（仓内已有依赖，esbuild 打包进 dist）。
const hosts = ['https://4kmp.com', 'https://www.4k-av.com', 'https://4k-av.com'];
let activeHost = hosts[0];
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
const pageOf = (body) => Math.max(1, Number.parseInt(body?.page, 10) || 1);
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const full = (value) => { try { return value ? new URL(value, activeHost).href : ''; } catch { return ''; } };
const pathOf = (category, page) => `/${category}${page === 1 ? '/' : `/page-${page}.html`}`;
async function fetchText(url) {
  try {
    const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, 'Accept-Language': 'zh-CN,zh;q=0.9' }, timeout: 25000, responseType: 'text', maxRedirects: 5 });
    const html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    if (/Cloudflare/.test(html.slice(0, 400))) throw new Error('Site challenge');
    return html;
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 25000);
      try {
        const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'zh-CN,zh;q=0.9' }, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        const html = await r.text();
        if (/Cloudflare/.test(html.slice(0, 400))) throw new Error('Site challenge');
        return html;
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
async function get(address) {
  let path = String(address || '');
  for (const host of hosts) if (path.startsWith(host)) { path = path.slice(host.length); break; }
  if (!path.startsWith('/')) path = `/${path}`;
  let last;
  for (const host of [activeHost, ...hosts.filter((item) => item !== activeHost)]) {
    try {
      const html = await fetchText(`${host}${path}`);
      activeHost = host;
      return html;
    } catch (error) { last = error; }
  }
  throw last || new Error('No site mirror available');
}
function remark(name, tags) {
  const episode = /(?:全|共|更新至)\s*\d+\s*集|第\s*[一二三四五六七八九十\d]+\s*季|\d+\s*集/.exec(name);
  return episode ? episode[0].replace(/\s/g, '') : tags.slice(0, 3).join('、');
}
function cards(html, keepBlob = false) {
  const $ = cheerio.load(html);
  const out = [];
  let items = $('.NTMitem');
  if (!items.length) items = $('.RTMitem');
  items.each((_, element) => {
    const item = $(element), a = item.find('.title a[href]').first();
    const name = (a.find('h2').first().text() || a.attr('title') || '').trim();
    if (!a.attr('href') || !name) return;
    const tags = item.find('.tags span').toArray().map((tag) => $(tag).text().trim());
    const year = item.find('.resyear label[title="年份"]').first().text().trim();
    const image = item.find('img').first();
    const vod = { vod_id: a.attr('href'), vod_name: name,
      vod_pic: full(image.attr('src') || image.attr('data-src') || image.attr('data-original')),
      vod_year: year, vod_remarks: remark(name, tags) };
    if (keepBlob) vod._blob = [name, item.find('.info h3').first().text(), year,
      ...tags, item.find('.videodesc p').first().text()].join(' ').toLowerCase();
    out.push(vod);
  });
  return out;
}
export default function createSpider() {
  return {
  meta: { key: 'lee_4kmp', name: '4KMP', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: [
      { type_id: 'movie', type_name: '电影' }, { type_id: 'tv', type_name: '电视剧' },
    ] }));
    fastify.post('/category', async (request) => {
      const page = pageOf(request.body), category = request.body?.id === 'tv' ? 'tv' : 'movie';
      const html = await get(pathOf(category, page)), list = cards(html);
      const pagecount = Number(/页次\s*\d+\s*\/\s*(\d+)/.exec(html)?.[1]) || page + Number(list.length > 0);
      return { list, page, pagecount, limit: list.length, total: list.length * pagecount };
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!id) return { list: [] };
      const $ = cheerio.load(await get(id));
      const title = ($('#MainContent_titleh12 .MainTitle').first().text() || $('h1').first().text()).trim();
      const pic = full($('.poster img').first().attr('src'));
      const seasons = new Map();
      if (id.includes('/tv/')) $('#rtlist li').each((_, element) => {
        const li = $(element), name = (li.find('.stitle').first().text() || li.find('span').first().text()).trim();
        if (!name) return;
        const href = (li.find('a[href]').first().attr('href') || id).replace(/^\/(zh|en|ja|ko|es|pt|th|vi|ar|ru|hi|id|bn|fr|de|it)\//, '/');
        const season = Number(/^[Ss](\d{1,2})[Ee]/.exec(name)?.[1] || 0);
        if (!seasons.has(season)) seasons.set(season, []);
        seasons.get(season).push(`${name.replace(/[$#]/g, '_')}$${full(href)}`);
      });
      const lines = [], groups = [];
      if (seasons.size) {
        const split = seasons.size > 1 && !seasons.has(0);
        for (const [season, episodes] of [...seasons].sort((a, b) => a[0] - b[0])) {
          lines.push(split ? `第${season}季` : '4KMP');
          groups.push(episodes.join('#'));
        }
      } else {
        lines.push('4KMP');
        const video = full($('video source[src]').first().attr('src'));
        groups.push(video ? `正片$${video}` : '');
      }
      return { list: [{ vod_id: id, vod_name: title, vod_pic: pic,
        vod_play_from: lines.join('$$$'), vod_play_url: groups.join('$$$') }] };
    });
    fastify.post('/search', async (request) => {
      const page = pageOf(request.body), needle = String(request.body?.wd || '').trim().toLowerCase();
      const found = new Map();
      if (needle) for (let p = 1; p <= 34; p++) {
        const batches = await Promise.allSettled(['movie', 'tv'].map((category) => get(pathOf(category, p))));
        for (const batch of batches) if (batch.status === 'fulfilled') for (const video of cards(batch.value, true)) {
          if (!video._blob.includes(needle)) continue;
          delete video._blob;
          found.set(video.vod_id, video);
        }
        if (found.size) break;
      }
      const list = [...found.values()];
      return { list, page, pagecount: 1, limit: list.length, total: list.length };
    });
    fastify.post('/play', async (request) => {
      let url = one(request.body?.id);
      if (!/\.(m3u8|mp4)(?:$|[?#])/i.test(url)) {
        const $ = cheerio.load(await get(url));
        url = full($('video source[src]').first().attr('src'));
      }
      return { parse: 0, url, header: { 'User-Agent': ua } };
    });
  }
};
}
