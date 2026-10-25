import req from '../../util/req.js';
import cheerio from 'cheerio';
// 快映 • 4K（LeeCatPaw lee_kuaiying）：直连 xsayang.fun / 38.76.197.172:12521 域名池（MacCMS 式站）；
// 首页分类从站方首页 tab 动态抓取（排除 115、不超过 7 个）；详情抠网盘分享链接，
// 猫端按网盘惯例出“网盘分享”分集、play 原样透传；App 内点播仍需网盘解析层。
const hosts = ['http://xsayang.fun', 'http://38.76.197.172:12521'];
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
function cards($, origin, search = false) {
  const list = [];
  $(search ? '.module-search-item' : '.module-item').each((_index, element) => {
    const card = $(element);
    const link = card.find(search ? '.video-info-header a' : '.module-item-titlebox > a').first();
    const id = link.attr('href');
    const name = link.attr('title') || link.text().trim();
    if (!id || !name || name === '臻彩') return;
    const image = card.find('.module-item-pic img').first();
    const raw = image.attr('data-src') || image.attr('src') || '';
    list.push({ vod_id: String(id), vod_name: name, vod_remarks: card.find(search ? 'a.video-serial' : '.module-item-text').first().text().trim(), vod_pic: siteUrl(raw.includes('http') ? raw.slice(raw.lastIndexOf('http')) : raw, origin) });
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
    meta: { key: 'lee_kuaiying', name: '快映 • 4K', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => {
        const { html, origin } = await sitePage('/');
        const $ = cheerio.load(html);
        const classes = [];
        $('span.module-tab-item.tab-item').each((_index, element) => {
          const id = $(element).attr('data-id');
          const name = $(element).attr('data-name');
          if (id && id !== '0' && name && !name.includes('115') && classes.length < 7) classes.push({ type_id: id, type_name: name });
        });
        return { class: classes, list: cards($, origin) };
      });
      fastify.post('/category', async (request) => {
        const id = String(request.body?.id || '');
        const page = pageOf(request);
        if (!/^\d+$/.test(id)) return { page, pagecount: page, list: [] };
        const { html, origin } = await sitePage(`/index.php/vod/show/id/${id}/page/${page}.html`);
        const list = cards(cheerio.load(html), origin);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        const { html, origin } = await sitePage(`/index.php/vod/search/wd/${encodeURIComponent(keyword)}.html`);
        const list = cards(cheerio.load(html), origin, true);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!/^\/[A-Za-z0-9_/-]+(?:\.html)?$/.test(id)) return { list: [] };
        const { html } = await sitePage(id);
        const $ = cheerio.load(html);
        const body = $('body');
        body.find('script,style,.comments,.comment-list,.related-posts').remove();
        const links = extractShares($, body).slice(0, 20);
        return { list: [{ vod_id: id, vod_name: $('.video-info-header > .page-title').first().text().trim(), vod_content: $('p.sqjj_a').first().text().trim(), vod_play_from: '网盘分享', vod_play_url: links.map((link, i) => `分享${i + 1}$${link}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
