import req from '../../util/req.js';
// 黄果2（LeeCatPaw lee_duoju_huangguo2）：直连 huangguo.video，HTML 正则解析（与 bundle 一致，不用 cheerio）。
// 搜索无命中时按原法遍历“全部”前 5 页本地过滤；播放取详情页 data-hls 的 HLS 地址。
const base = 'https://huangguo.video';
const ua = 'Mozilla/5.0 (Linux; Android 13)';
const cats = [['all', '全部'], ['3', '连续剧'], ['1', 'MV/音乐剧'], ['2', '短片'], ['4', '片段'], ['updates', '最近更新'], ['ranking', '排行榜']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
const abs = (s) => s?.startsWith('http') ? s : s ? new URL(s, base).href : '';
async function get(path) {
  const r = await req({ method: 'GET', url: base + path, headers: { 'User-Agent': ua, Referer: base + '/' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status !== 200) throw new Error(`黄果2 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
function cards(html, cls) {
  const starts = [...html.matchAll(/<article\s+class="[^"]*\bvideo-card\b[^"]*"[^>]*>/gi)];
  return starts.flatMap((start, i) => {
    const chunk = html.slice(start.index, starts[i + 1]?.index ?? html.length);
    const link = /href="(?:https?:\/\/[^/"]+)?\/(series|video)\/([0-9a-zA-Z]+)/i.exec(chunk);
    const name = clean(/<img[^>]*\balt="([^"]*)"/i.exec(chunk)?.[1] || /<p[^>]*class="[^"]*\bmt-2\.5\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk)?.[1]);
    if (!link || !name) return [];
    const pic = /<img[^>]*\bsrc="([^"]+)"/i.exec(chunk)?.[1] || '';
    const mark = /bg-black\/(?:50|55)[^>]*>([^<]+)</i.exec(chunk)?.[1] || '';
    return [{ vod_id: `${link[1]}-${link[2]}`, vod_name: name, vod_pic: abs(pic), vod_remarks: clean(mark), vod_class: cls }];
  });
}
async function listing(cat, page) {
  const path = ['updates', 'ranking'].includes(cat) ? `/${cat}?page=${page}` : `/videos?category=${encodeURIComponent(cat || 'all')}&page=${page}`;
  return cards(await get(path), cats.find(([id]) => id === cat)?.[1] || '');
}
async function search(wd, page) {
  if (!wd) return [];
  const found = cards(await get(`/search?q=${encodeURIComponent(wd)}${page > 1 ? `&page=${page}` : ''}`), '');
  if (found.length) return found;
  const seen = new Set(), matches = [];
  for (let p = 1; p <= 5 && matches.length < page * 24; p++) {
    for (const card of await listing('all', p)) {
      if (card.vod_name.includes(wd) && !seen.has(card.vod_id)) { seen.add(card.vod_id); matches.push(card); }
    }
  }
  return matches.slice((page - 1) * 24, page * 24);
}
async function detail(id) {
  const match = /^(series|video)-([A-Za-z0-9]+)$/.exec(id);
  if (!match) throw new Error('黄果2 影片 ID 无效');
  const html = await get(`/${match[1]}/${match[2]}`);
  const name = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]) || id;
  const pic = abs(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i.exec(html)?.[1]);
  const description = clean(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html)?.[1]);
  const videos = match[1] === 'video' ? [match[2]] : [...new Set([...html.matchAll(/href="(?:https?:\/\/[^/"]+)?\/video\/([0-9a-zA-Z]+)/gi)].map((m) => m[1]))];
  if (!videos.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: name, vod_pic: pic, vod_content: description, vod_remarks: `共${videos.length}集`, vod_play_from: '黄果2', vod_play_url: videos.map((vid, i) => `第${i + 1}集$huangguo2://video-${vid}/1`).join('#') }] };
}
async function play(id) {
  const match = /^huangguo2:\/\/video-([A-Za-z0-9]+)\/\d+$/.exec(id);
  if (!match) throw new Error('黄果2 分集 ID 无效');
  const html = await get(`/video/${match[1]}`);
  const src = /data-hls="([^"]+)"/i.exec(html)?.[1] || '';
  const url = abs(src.replace(/&amp;/g, '&'));
  if (!url.includes('.m3u8')) throw new Error('黄果2 无 HLS 播放地址');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: base + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_huangguo2', name: '多聚短剧 · 黄果2', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('all', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
