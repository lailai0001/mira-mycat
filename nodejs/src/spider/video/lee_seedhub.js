import req from '../../util/req.js';
import cheerio from 'cheerio';
// 种子 • 4K（LeeCatPaw lee_seedhub）：直连 sidhub.cc / seeduck.cc / hubdog.cc / 104.243.25.80 域名池；
// 分类支持 extend.tags（/types/<n> 或 /tags/<n>）；详情三路：分享直链→网盘分享出线，
// /link_start/ 跳转页→取 panLink 分享，站内详情页→抠分享链接（无分享时再试 panLink/data 兜底）；
// play 原样透传；App 内点播仍需网盘解析层。
const hosts = ['https://sidhub.cc', 'https://seeduck.cc', 'https://hubdog.cc', 'http://104.243.25.80'];
const shareHosts = /(?:aliyundrive\.com|alipan\.com|pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|cloud\.189\.cn|123[a-zA-Z0-9]{3}\.(?:com|cn)|pan\.xunlei\.com|guangyapan\.com|caiyun\.139\.com|yun\.139\.com)$/i;
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const siteUrl = (value, origin) => { try { return new URL(String(value || ''), origin).toString(); } catch { return ''; } };
async function sitePage(relative) {
  let lastError;
  for (const host of hosts) {
    try {
      const origin = new URL(host).origin;
      const url = siteUrl(relative, origin);
      if (new URL(url).origin !== origin) continue;
      const r = await req({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36', Referer: `${origin}/` }, timeout: 15000, responseType: 'text', validateStatus: () => true });
      if (r.status >= 400) throw new Error(`Site HTTP ${r.status}`);
      return { html: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''), origin };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('资源站点不可用');
}
function seedCards($, origin) {
  const list = [];
  $('.cover').each((_index, element) => {
    const card = $(element);
    const link = card.find('a[href]').first();
    const image = card.find('img').first();
    const id = link.attr('href');
    if (!id) return;
    list.push({ vod_id: String(id), vod_name: image.attr('alt') || link.text().trim(), vod_remarks: '', vod_pic: siteUrl(image.attr('src'), origin), vod_tag: 'folder' });
  });
  return list;
}
function seedLinks($, origin) {
  const list = [];
  $('.pan-links li a').each((_index, element) => {
    const link = $(element);
    const href = link.attr('href');
    if (!href || !href.startsWith('/link_start/?')) return;
    const url = siteUrl(href, origin);
    const name = link.attr('title') || link.text().trim() || '网盘分享';
    list.push({ vod_id: String(url), vod_name: name, vod_remarks: '', vod_pic: '' });
  });
  return list;
}
function extractShares($, scope) {
  const found = new Set();
  function add(raw, nearby = '') {
    try {
      const url = new URL(String(raw).replace(/&amp;/g, '&'));
      if (!shareHosts.test(url.hostname)) return;
      if (/guangyapan\.com$/i.test(url.hostname) && !url.searchParams.has('code')) {
        const code = nearby.match(/(?:提取码|访问码|密码)\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/);
        if (code) url.searchParams.set('code', code[1]);
      }
      if (/123[a-zA-Z0-9]{3}\.(?:com|cn)$/i.test(url.hostname) && !url.searchParams.has('pwd')) {
        const code = nearby.match(/(?:提取码|访问码|密码)\s*[:：]?\s*([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/);
        if (code) url.searchParams.set('pwd', code[1]);
      }
      found.add(url.toString());
    } catch { /* malformed share */ }
  }
  scope.find('a[href]').each((_index, element) => { const link = $(element); add(link.attr('href'), link.parent().text()); });
  scope.find('[data-clipboard-text],[data-link]').each((_index, element) => { const item = $(element); add(item.attr('data-clipboard-text') || item.attr('data-link'), item.parent().text()); });
  const text = scope.text();
  const pattern = /https?:\/\/(?:[A-Za-z0-9.-]+)(?:\/[^\s<>"'，。；;]*)?/g;
  for (const match of text.matchAll(pattern)) add(match[0], text.slice(match.index + match[0].length, match.index + match[0].length + 40));
  return [...found];
}
export default function createSpider() {
  return {
    meta: { key: 'lee_seedhub', name: '种子 • 4K', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [['1', '电影'], ['3', '剧集'], ['2', '动漫']].map(([type_id, type_name]) => ({ type_id, type_name })) }));
      fastify.post('/category', async (request) => {
        const id = String(request.body?.id || '');
        const page = pageOf(request);
        if (['1', '2', '3'].includes(id)) {
          const tags = String(request.body?.extend?.tags || '');
          if (tags && !/^\/(?:types|tags)\/\d+$/.test(tags)) return { page, pagecount: page, list: [] };
          const { html, origin } = await sitePage(`/categories/${id}${tags}/movies/?page=${page}`);
          const $ = cheerio.load(html);
          const list = seedCards($, origin);
          const last = Number($('.page-nav .page a').last().text()) || (list.length ? page + 1 : page);
          return { page, pagecount: last, list };
        }
        if (!/^\/[-A-Za-z0-9_/]+\/?$/.test(id)) return { page: 1, pagecount: 1, list: [] };
        const { html, origin } = await sitePage(id);
        return { page: 1, pagecount: 1, list: seedLinks(cheerio.load(html), origin) };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        const { html, origin } = await sitePage(`/s/${encodeURIComponent(keyword)}/?page=${page}`);
        const list = seedCards(cheerio.load(html), origin);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!id) return { list: [] };
        try {
          if (shareHosts.test(new URL(id).hostname)) return { list: [{ vod_id: id, vod_name: id, vod_play_from: '网盘分享', vod_play_url: `分享1$${id}` }] };
        } catch { /* site detail path */ }
        if (id.startsWith('https://') || id.startsWith('http://')) {
          const parsed = new URL(id);
          if (parsed.pathname !== '/link_start/' || !parsed.searchParams.has('redirect_to')) return { list: [] };
          const { html } = await sitePage(`${parsed.pathname}${parsed.search}`);
          const link = html.match(/var panLink\s*=\s*["'](https?:\/\/[^"']+)["']/)?.[1];
          return link && shareHosts.test(new URL(link).hostname)
            ? { list: [{ vod_id: id, vod_name: parsed.searchParams.get('movie_title') || '', vod_play_from: '网盘分享', vod_play_url: `分享1$${link}` }] }
            : { list: [] };
        }
        if (!/^\/[A-Za-z0-9_/-]+(?:\.html)?$/.test(id)) return { list: [] };
        const { html, origin } = await sitePage(id);
        const $ = cheerio.load(html);
        let links = extractShares($, $('body'));
        if (!links.length) {
          const encoded = html.match(/(?:var panLink|const data)\s*=\s*["']([^"']+)["']/)?.[1] || '';
          if (encoded) {
            const raw = html.includes('const data') ? Buffer.from(encoded, 'base64').toString('utf8') : encoded;
            const candidate = siteUrl(raw, origin);
            if (candidate && shareHosts.test(new URL(candidate).hostname)) links = [candidate];
          }
        }
        links = links.slice(0, 20);
        return { list: [{ vod_id: id, vod_name: $('.active.sidebar-link').first().text().trim() || $('title').text().trim(), vod_content: $('h2#description').next().text().trim(), vod_play_from: '网盘分享', vod_play_url: links.map((link, i) => `分享${i + 1}$${link}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
