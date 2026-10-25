import req from '../../util/req.js';
import cheerio from 'cheerio';
// 光鸭 • 臻影社（LeeCatPaw lee_guangya_site）：直连 www.guangya.net；
// bundle 的 Cookie/UA 配置项无猫端通道，故只用无 Cookie 形态（与 bundle 未配置时一致）；
// 详情页抠网盘分享链接，猫端按网盘惯例出“网盘分享”分集、play 原样透传；App 内点播仍需网盘解析层。
const host = 'https://www.guangya.net';
const shareHosts = /(?:aliyundrive\.com|alipan\.com|pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|cloud\.189\.cn|123[a-zA-Z0-9]{3}\.(?:com|cn)|pan\.xunlei\.com|guangyapan\.com|caiyun\.139\.com|yun\.139\.com)$/i;
const classes = [['film', '电影'], ['show', '剧集'], ['animation', '动漫'], ['reality', '综艺'], ['documentary', '纪录片'], ['music', '音乐']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function getHtml(url) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36', Referer: `${host}/` }, timeout: 15000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Site HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
const siteUrl = (value, origin) => { try { return new URL(String(value || ''), origin).toString(); } catch { return ''; } };
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
function cards($) {
  const list = [];
  const seen = new Set();
  $('.posts-item,article,.post-list-item,.post-item').each((_index, element) => {
    const card = $(element);
    const link = card.find('.item-heading a[href],.post-title a[href],h2 a[href],h3 a[href]').first();
    const url = siteUrl(link.attr('href'), host);
    if (!url) return;
    const parsed = new URL(url);
    const name = link.text().trim();
    if (parsed.origin !== host || !/^\/\d+\.html$/.test(parsed.pathname) || !name || seen.has(parsed.pathname)) return;
    seen.add(parsed.pathname);
    const img = card.find('img').first();
    list.push({ vod_id: parsed.pathname, vod_name: name, vod_remarks: card.find('.item-excerpt').text().trim(), vod_pic: siteUrl(img.attr('data-src') || img.attr('src'), host) });
  });
  return list;
}
export default function createSpider() {
  return {
    meta: { key: 'lee_guangya_site', name: '光鸭 • 臻影社', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: classes }));
      fastify.post('/category', async (request) => {
        const page = pageOf(request);
        const id = String(request.body?.id || 'film');
        if (!classes.some((item) => item[0] === id)) return { page, pagecount: page, list: [] };
        const $ = cheerio.load(await getHtml(`${host}/category/${id}${page > 1 ? `/page/${page}` : ''}`));
        const list = cards($);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        const $ = cheerio.load(await getHtml(`${host}/?s=${encodeURIComponent(keyword)}&paged=${page}`));
        const list = cards($);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        const url = siteUrl(id, host);
        if (!url || new URL(url).origin !== host || !/^\/\d+\.html$/.test(new URL(url).pathname)) return { list: [] };
        const $ = cheerio.load(await getHtml(url));
        const body = $('.article-content,.entry-content,.post-content,.wp-posts-content').first();
        body.find('script,style,.comments,.comment-list,.related-posts').remove();
        const links = extractShares($, body).slice(0, 20);
        return { list: [{ vod_id: id, vod_name: $('h1.article-title,h1.entry-title,h1').first().text().trim(), vod_content: body.text().trim(), vod_play_from: '网盘分享', vod_play_url: links.map((link, i) => `分享${i + 1}$${link}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
