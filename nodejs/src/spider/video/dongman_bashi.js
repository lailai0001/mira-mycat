import req from '../../util/req.js';
// 动漫巴士（LeeCatPaw lee_dm84 移植，替换 mycat 原 py_dongman_bashi；key/名/注册不变）。
// 直连 dm84.tv；原 bundle 用 cheerio（bridge.html），猫端无 cheerio，改写为正则解析，逻辑与原版一一对应。
// 筛选表取自 bundle 开头的 leeLegacyFilters.dm84（逐字）。
const HOST = 'https://dm84.tv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
async function reqText(url, opt = {}) {
  const method = (opt.method || 'GET').toUpperCase();
  const headers = Object.assign({ 'User-Agent': UA, Referer: new URL(url).origin + '/' }, opt.headers || {});
  const timeout = opt.timeout || 15000;
  const data = opt.body;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: data, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (body) => Math.max(1, Number.parseInt(body?.page, 10) || 1);
const clean = (value) => String(value || '').replace(/[$#]/g, '_').trim();
const full = (base, value) => { try { return value ? new URL(value, base).href : ''; } catch { return ''; } };
const attr = (tag, key) => (String(tag).match(new RegExp('\\b' + key + '\\s*=\\s*["\']([^"\']*)["\']', 'i')) || [])[1] || '';
const text = (s) => String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
const match = (s, re) => (String(s || '').match(re) || [])[1] || '';
function blocks(html, tag, cls) {
  const out = []; const tags = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'gi'); let m;
  while ((m = tags.exec(html))) {
    if (m[0].startsWith('</') || !new RegExp('\\bclass\\s*=\\s*["\'][^"\']*\\b' + cls + '\\b', 'i').test(m[0])) continue;
    const start = m.index; const t = new RegExp('<\\/?' + tag + '\\b[^>]*>', 'gi'); t.lastIndex = tags.lastIndex;
    let depth = 1, n; while ((n = t.exec(html))) { if (n[0].startsWith('</')) depth--; else if (!/\/\s*>$/.test(n[0])) depth++; if (!depth) { out.push(html.slice(start, t.lastIndex)); tags.lastIndex = t.lastIndex; break; } }
    if (depth) break;
  }
  return out;
}
const listResult = (page, list) => ({ page, pagecount: list.length ? page + 1 : page, limit: list.length, list });
const categories = [['1', '国产动漫'], ['2', '日本动漫'], ['3', '欧美动漫'], ['4', '电影']]
  .map(([type_id, type_name]) => ({ type_id, type_name }));
const dmFilters = {"1": [{"name": "年份", "key": "year", "value": [{"n": "全部年份", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}]}, {"name": "类型", "key": "class", "value": [{"n": "全部类型", "v": ""}, {"n": "奇幻", "v": "奇幻"}, {"n": "战斗", "v": "战斗"}, {"n": "玄幻", "v": "玄幻"}, {"n": "穿越", "v": "穿越"}, {"n": "科幻", "v": "科幻"}, {"n": "武侠", "v": "武侠"}, {"n": "热血", "v": "热血"}, {"n": "眈美", "v": "眈美"}, {"n": "搞笑", "v": "搞笑"}, {"n": "动态漫画", "v": "动态漫画"}]}, {"name": "排序", "key": "by", "value": [{"n": "最新", "v": "time"}, {"n": "人气", "v": "hits"}, {"n": "评分", "v": "score"}]}], "2": [{"name": "年份", "key": "year", "value": [{"n": "全部年份", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}]}, {"name": "类型", "key": "class", "value": [{"n": "全部类型", "v": ""}, {"n": "冒险", "v": "冒险"}, {"n": "奇幻", "v": "奇幻"}, {"n": "战斗", "v": "战斗"}, {"n": "后宫", "v": "后宫"}, {"n": "热血", "v": "热血"}, {"n": "励志", "v": "励志"}, {"n": "搞笑", "v": "搞笑"}, {"n": "校园", "v": "校园"}, {"n": "机战", "v": "机战"}, {"n": "悬疑", "v": "悬疑"}, {"n": "治愈", "v": "治愈"}, {"n": "百合", "v": "百合"}, {"n": "恐怖", "v": "恐怖"}, {"n": "泡面番", "v": "泡面番"}, {"n": "恋爱", "v": "恋爱"}, {"n": "推理", "v": "推理"}]}, {"name": "排序", "key": "by", "value": [{"n": "最新", "v": "time"}, {"n": "人气", "v": "hits"}, {"n": "评分", "v": "score"}]}], "3": [{"name": "年份", "key": "year", "value": [{"n": "全部年份", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}]}, {"name": "类型", "key": "class", "value": [{"n": "全部类型", "v": ""}, {"n": "科幻", "v": "科幻"}, {"n": "冒险", "v": "冒险"}, {"n": "战斗", "v": "战斗"}, {"n": "百合", "v": "百合"}, {"n": "奇幻", "v": "奇幻"}, {"n": "热血", "v": "热血"}, {"n": "搞笑", "v": "搞笑"}]}, {"name": "排序", "key": "by", "value": [{"n": "最新", "v": "time"}, {"n": "人气", "v": "hits"}, {"n": "评分", "v": "score"}]}], "4": [{"name": "年份", "key": "year", "value": [{"n": "全部年份", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}]}, {"name": "类型", "key": "class", "value": [{"n": "全部类型", "v": ""}, {"n": "搞笑", "v": "搞笑"}, {"n": "奇幻", "v": "奇幻"}, {"n": "治愈", "v": "治愈"}, {"n": "科幻", "v": "科幻"}, {"n": "喜剧", "v": "喜剧"}, {"n": "冒险", "v": "冒险"}, {"n": "动作", "v": "动作"}, {"n": "爱情", "v": "爱情"}]}, {"name": "排序", "key": "by", "value": [{"n": "最新", "v": "time"}, {"n": "人气", "v": "hits"}, {"n": "评分", "v": "score"}]}]};
function cards(html) {
  const list = [];
  for (const li of String(html).match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []) {
    const a = (li.match(/<a\b[^>]*>/i) || [])[0] || '';
    const href = attr(a, 'href');
    const name = attr(a, 'title').replace(/在线观看/g, '');
    if (!href || !name) continue;
    const desc = text(match(li, /<[^>]+class=["'][^"']*\bdesc\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i));
    list.push({ vod_id: full(HOST, href), vod_name: name, vod_pic: full(HOST, attr(a, 'data-bg')), vod_remarks: desc });
  }
  return list;
}
function detail(id, html) {
  const lines = [];
  const title = text(match(html, /<[^>]+class=["'][^"']*\bv_title\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i));
  const coverBox = (blocks(html, 'div', 'cover')[0] || '');
  const coverImg = (coverBox.match(/<img\b[^>]*>/i) || [])[0] || '';
  const pic = full(HOST, attr(coverImg, 'src'));
  const content = text(match(html, /<[^>]+class=["'][^"']*\bv_desc\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i));
  const tabBox = (blocks(html, 'ul', 'tab_control')[0] || blocks(html, 'div', 'tab_control')[0] || '');
  const tabNames = [...tabBox.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1]));
  for (const [i, box] of blocks(html, 'div', 'play_list').entries()) {
    const episodes = [...box.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ name: `第${text(m[2])}集`, url: full(HOST, m[1]) }))
      .filter((e) => e.url)
      .map((e) => `${clean(e.name) || '播放'}$${e.url}`);
    if (episodes.length) lines.push({ name: tabNames[i] || `线路${i + 1}`, items: episodes });
  }
  return { list: [{ vod_id: id, vod_name: title, vod_pic: pic, vod_content: content,
    vod_play_from: lines.map((l) => l.name).join('$$$'),
    vod_play_url: lines.map((l) => l.items.join('#')).join('$$$') }] };
}
const allowed = (value) => {
  const url = new URL(full(HOST, value));
  if (url.origin !== HOST) throw new Error('Unexpected detail host');
  return url.href;
};
export default function createSpider() {
  return {
  meta: { key: 'py_dongman_bashi', name: '🚌动漫 - 巴士', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: categories, filters: dmFilters }));
    fastify.post('/category', async (request) => {
      const id = one(request.body?.id), page = pageOf(request.body);
      if (!categories.some((item) => item.type_id === id)) return listResult(page, []);
      const filter = request.body?.extend || {};
      const url = `${HOST}/show-${id}--${filter.by || ''}-${filter.class || ''}--${filter.year || ''}-${page > 1 ? page : ''}.html`;
      return listResult(page, cards(await reqText(url)));
    });
    fastify.post('/search', async (request) => {
      const wd = one(request.body?.wd).trim(), page = pageOf(request.body);
      if (!wd) return listResult(page, []);
      const url = page === 1 ? `${HOST}/s----------.html?wd=${encodeURIComponent(wd)}` : `${HOST}/s-${encodeURIComponent(wd)}---------${page}.html`;
      return listResult(page, cards(await reqText(url)));
    });
    fastify.post('/detail', async (request) => {
      const id = allowed(one(request.body?.id));
      return detail(id, await reqText(id));
    });
    fastify.post('/play', async (request) => {
      const id = one(request.body?.id);
      const html = await reqText(allowed(id));
      const iframe = (html.match(/<iframe\b[^>]*>/i) || [])[0] || '';
      return { parse: 1, url: full(HOST, attr(iframe, 'src')) };
    });
  }
};
}
