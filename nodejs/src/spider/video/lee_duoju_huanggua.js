import req from '../../util/req.js';
// 黄瓜（LeeCatPaw lee_duoju_huanggua）：与橙果同构（NuxtHtml 共享实现），但域名需动态发现：
// 先抓 hgdju4.com 首页，从中提取 .cc 镜像逐个探测含 data-xpch="card-drama" 的可用站（bundle 原设计）；
// 请求失败时清掉已发现域名、重新发现一次。
const configBase = 'https://hgdju4.com';
const scheme = 'huanggua://';
const cats = [['recommend', '推荐', '/'], ['yuanchuang', '原创', '/yuanchuang'], ['mogai', '魔改', '/mogai'], ['manju', 'AI漫剧', '/manju'], ['zhenren', '真人短剧', '/zhenren'], ['aiduanju', 'AI短剧', '/aiduanju'], ['browse', '全部', '/browse'], ['browse-new', '最新', '/browse?sort=new']];
const ua = 'Mozilla/5.0';
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
let host = '';
async function raw(url) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, Referer: url }, timeout: 15000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`多聚短剧 · 黄瓜 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function discover() {
  if (host) return host;
  const landing = await raw(configBase + '/');
  const mirrors = [...new Set([...landing.matchAll(/https?:\/\/[a-z0-9-]{2,24}\.[a-z0-9]{5,20}\.cc/gi)].map((m) => m[0]))].filter((url) => !url.includes('hgdju'));
  for (const candidate of mirrors) {
    try {
      const html = await raw(candidate + '/');
      if (html.includes('data-xpch="card-drama"')) { host = candidate; return host; }
    } catch { /* 继续检查下一个镜像。 */ }
  }
  throw new Error('黄瓜没有可用镜像');
}
async function get(path) {
  const base = await discover();
  try { return await raw(base + path); }
  catch (error) {
    if (base === configBase) throw error;
    host = ''; const next = await discover();
    return raw(next + path);
  }
}
const abs = (s) => s?.startsWith('http') ? s : s ? new URL(s, host || configBase).href : '';
function cards(html, category) {
  const blocks = [...html.matchAll(/<article\b[^>]*data-xpch="card-drama"[^>]*>[\s\S]*?<\/article>/gi)];
  const seen = new Set();
  return blocks.flatMap(([block]) => {
    const link = /href="\/drama\/([A-Za-z0-9-]+)"/i.exec(block);
    const name = clean(/<img[^>]*\balt="([^"]+)"/i.exec(block)?.[1]);
    if (!link || !name || seen.has(link[1])) return [];
    seen.add(link[1]);
    const pic = /<img[^>]*\b(?:z-image-loader-url|data-cover-fb|data-src|src)="([^"]+)"/i.exec(block)?.[1] || '';
    const mark = /(?:更新至|共|全)\s*\d+\s*集/.exec(clean(block))?.[0] || '';
    return [{ vod_id: link[1], vod_name: name, vod_pic: abs(pic), vod_remarks: mark, vod_class: category }];
  });
}
async function listing(cat, page) {
  const entry = cats.find(([id]) => id === cat) || cats[0];
  const path = entry[2] + (page > 1 ? `${entry[2].includes('?') ? '&' : '?'}page=${page}` : '');
  return cards(await get(path), entry[1]);
}
async function search(wd, page) {
  if (!wd) return [];
  const path = `/search?q=${encodeURIComponent(wd)}${page > 1 ? `&page=${page}` : ''}`;
  return cards(await get(path), '');
}
async function detail(id) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new Error('短剧 ID 无效');
  const html = await get(`/drama/${encodeURIComponent(id)}`);
  const title = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]) || id;
  const desc = clean(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html)?.[1]);
  const pic = abs(/\b(?:z-image-loader-url|data-cover-fb|data-src|src)="([^"]+)"/i.exec(html)?.[1]);
  const episodes = [...new Set([...html.matchAll(new RegExp(`href="/play/${id}/(\\d+)"`, 'gi'))].map((m) => Number(m[1])))].sort((a, b) => a - b);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: title, vod_pic: pic, vod_content: desc, vod_remarks: `共${episodes.length}集`, vod_play_from: '黄瓜', vod_play_url: episodes.map((no) => `第${no}集$${scheme}${id}/${no}`).join('#') }] };
}
async function play(id) {
  const match = /^huanggua:\/\/([A-Za-z0-9-]+)\/(\d+)$/.exec(id);
  if (!match) throw new Error('分集 ID 无效');
  const html = (await get(`/play/${match[1]}/${match[2]}`)).replace(/\\u0026/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
  const url = /https?:\/\/[^\s"'<>\\]{10,200}\.m3u8[^\s"'<>\\]{0,300}/i.exec(html)?.[0]?.replace(/&amp;/g, '&') || '';
  if (!/^https?:\/\//.test(url)) throw new Error('播放页没有 HLS 地址');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: (host || configBase) + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_huanggua', name: '多聚短剧 · 黄瓜', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing(cats[0][0], 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
