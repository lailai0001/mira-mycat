import req from '../../util/req.js';
import cheerio from 'cheerio';
// 123 • 4K（LeeCatPaw lee_123forum）：直连 123panfx.com / pan1.me 论坛；
// bundle 的 Cookie 配置项无猫端通道，故首页恒显示 bundle 原文的“请先在 Node 配置中设置123社区 Cookie”提示分类，
// 分类/搜索/详情仍按原法直接抓取（搜索走站方 JSON 接口；需回复可见的帖按原法返回提示卡）；
// 详情抠网盘分享链接，猫端按网盘惯例出“网盘分享”分集、play 原样透传；App 内点播仍需网盘解析层。
const hosts = ['https://123panfx.com', 'https://pan1.me'];
const classes = [['2', '电影'], ['48', '剧集'], ['56', '4K原盘'], ['52', '综艺'], ['37', '动漫']];
const shareHosts = /(?:aliyundrive\.com|alipan\.com|pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|cloud\.189\.cn|123[a-zA-Z0-9]{3}\.(?:com|cn)|pan\.xunlei\.com|guangyapan\.com|caiyun\.139\.com|yun\.139\.com)$/i;
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const siteUrl = (value, origin) => { try { return new URL(String(value || ''), origin).toString(); } catch { return ''; } };
async function forumPage(relative) {
  let lastError;
  for (const host of hosts) {
    try {
      const origin = new URL(host).origin;
      const url = siteUrl(relative, origin);
      if (new URL(url).origin !== origin) continue;
      const r = await req({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36', Referer: `${origin}/`, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, timeout: 15000, responseType: 'text', validateStatus: () => true });
      if (r.status >= 400) throw new Error(`Site HTTP ${r.status}`);
      return { html: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''), origin };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('论坛站点不可用');
}
function forumCards($, origin) {
  const list = [];
  $('ul.threadlist > li').each((_index, element) => {
    const card = $(element);
    if (String(card.find('i').attr('data-placement') || '').includes('top')) return;
    const link = card.find('div > div.subject > a,div > div.style3_subject > a').first();
    const id = link.attr('href');
    const name = link.text().trim();
    if (!id || !name) return;
    list.push({ vod_id: String(id), vod_name: name, vod_remarks: card.find('div > div.subject > a.badge,div > div.style3_subject > a.badge').text().trim(), vod_pic: siteUrl(card.find('a > img').first().attr('src'), origin) });
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
    meta: { key: 'lee_123forum', name: '123 • 4K', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [{ type_id: '', type_name: '请先在 Node 配置中设置123社区 Cookie' }] }));
      fastify.post('/category', async (request) => {
        const id = String(request.body?.id || '');
        const page = pageOf(request);
        if (!classes.some((item) => item[0] === id)) return { page, pagecount: page, list: [] };
        const { html, origin } = await forumPage(`/forum-${id}-${page}.htm`);
        const list = forumCards(cheerio.load(html), origin);
        return { page, pagecount: list.length ? page + 1 : page, list };
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        if (!keyword) return { page: 1, pagecount: 1, list: [] };
        const { html, origin } = await forumPage(`/search.htm?keyword=${encodeURIComponent(keyword)}`);
        const result = JSON.parse(html);
        return { page: 1, pagecount: 1, list: (result.message || []).map((item) => ({ vod_id: String(item.url || ''), vod_name: cheerio.load(String(item.subject || '')).root().text().trim(), vod_remarks: '', vod_pic: siteUrl(item.user_avatar_url, origin) })) };
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!/^\/?thread-[A-Za-z0-9_-]+\.htm$/.test(id)) return { list: [] };
        const { html } = await forumPage(id);
        const $ = cheerio.load(html);
        const message = $('div.message').first();
        if (/(请回复后再查看|<立即回复>)/.test(message.text())) return { list: [{ vod_id: id, vod_name: $('h4').first().text().trim(), vod_content: '此资源需在资源站完成回复后查看', vod_play_from: '', vod_play_url: '' }] };
        const links = extractShares($, message).slice(0, 20);
        return { list: [{ vod_id: id, vod_name: $('h4').first().text().trim(), vod_content: links.join('\n'), vod_play_from: '网盘分享', vod_play_url: links.map((link, i) => `分享${i + 1}$${link}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
