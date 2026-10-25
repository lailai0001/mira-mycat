import req from '../../util/req.js';
import cheerio from 'cheerio';
// 花卷 • 4K原盘（LeeCatPaw lee_huajuan）：直连 www.hjzhencai.top（MacCMS 式站）；
// 详情页抠网盘分享链接，猫端按网盘惯例出“网盘分享”分集、play 原样透传；App 内点播仍需网盘解析层。
const host = 'https://www.hjzhencai.top';
const shareHosts = /(?:aliyundrive\.com|alipan\.com|pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|cloud\.189\.cn|123[a-zA-Z0-9]{3}\.(?:com|cn)|pan\.xunlei\.com|guangyapan\.com|caiyun\.139\.com|yun\.139\.com)$/i;
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
function cards($, search) {
  const list = [];
  $(search ? '.module-card-item' : '.module-items > a.module-poster-item').each((_index, element) => {
    const card = $(element);
    const link = search ? card.find('.module-card-item-title a').first() : card;
    const id = link.attr('href');
    const name = search ? link.text().trim() : String(card.attr('title') || '').trim();
    if (!id || !name) return;
    const image = card.find('.module-item-pic img').first();
    list.push({ vod_id: String(id), vod_name: name, vod_remarks: card.find('.module-item-note').text().trim(), vod_pic: siteUrl(image.attr('data-original') || image.attr('src'), host) });
  });
  return list;
}
export default function createSpider() {
  return {
    meta: { key: 'lee_huajuan', name: '花卷 • 4K原盘', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [{ type_id: '24', type_name: '4K原盘' }] }));
      fastify.post('/category', async (request) => {
        const page = pageOf(request);
        if (String(request.body?.id) !== '24') return { page, pagecount: page, list: [] };
        const $ = cheerio.load(await getHtml(`${host}/index.php/vod/show/id/24/page/${page}.html`));
        const list = cards($, false);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        const url = page === 1 ? `${host}/index.php/vod/search.html?wd=${encodeURIComponent(keyword)}` : `${host}/index.php/vod/search/page/${page}/wd/${encodeURIComponent(keyword)}.html`;
        const $ = cheerio.load(await getHtml(url));
        const list = cards($, true);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        const url = siteUrl(id, host);
        if (!url || new URL(url).origin !== host) return { list: [] };
        const $ = cheerio.load(await getHtml(url));
        const body = $('body');
        body.find('script,style,.comments,.comment-list,.related-posts').remove();
        const links = extractShares($, body).slice(0, 20);
        return { list: [{ vod_id: id, vod_name: $('.module-info-heading h1').first().text().trim(), vod_content: $('.module-info-introduction-content').first().text().trim(), vod_play_from: '网盘分享', vod_play_url: links.map((link, i) => `分享${i + 1}$${link}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
