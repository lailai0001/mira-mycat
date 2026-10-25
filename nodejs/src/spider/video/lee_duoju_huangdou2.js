import req from '../../util/req.js';
// 黄豆2（LeeCatPaw lee_duoju_huangdou2）：直连 aihuangdou.com，HTML 正则解析（与 bundle 一致）。
// 播放取播放页 ninePlayData 脚本中的直链。
const base = 'https://aihuangdou.com', ua = 'Mozilla/5.0 (Linux; Android 13)';
const cats = [['home', '首页'], ['ai-duanju', 'AI短剧'], ['ai-manju', 'AI漫剧'], ['rankings', '榜单']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const abs = (s) => s?.startsWith('http') ? s : s ? new URL(s, base).href : '';
async function get(path) {
  const r = await req({ method: 'GET', url: base + path, headers: { 'User-Agent': ua, Referer: base + '/', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`黄豆2 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
function cards(html, cat) {
  const starts = [...html.matchAll(/<(?:article|li|div)\s+class="[^"]*(?:drama-card|rank-runner|rank-row)(?:"|\s)/gi)];
  const seen = new Set();
  return starts.flatMap((start, i) => {
    const block = html.slice(start.index, starts[i + 1]?.index ?? html.length);
    const link = /href="(?:https?:\/\/[^/"]+)?(\/drama\/\d+\/)"/i.exec(block);
    if (!link) return [];
    const id = link[1].replace(/^\/|\/$/g, '');
    if (seen.has(id)) return [];
    const title = clean(/data-track-item-name="([^"]+)"/i.exec(block)?.[1] || /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(block)?.[1] || /\balt="([^"]+)"/i.exec(block)?.[1]);
    if (!title) return [];
    seen.add(id);
    const image = /\b(?:data-src|data-original|data-lazy-src|src)="([^" ]+)"/i.exec(block)?.[1] || '';
    const cover = /^(data:|.*placeholder|.*loading)/i.test(image) ? '' : abs(image);
    const remark = clean(/class="eps-flag"[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1]);
    const score = clean(/class="card-score"[^>]*>([\s\S]*?)<\/em>/i.exec(block)?.[1]);
    return [{ vod_id: id, vod_name: title, vod_pic: cover, vod_remarks: [score ? `评分${score}` : '', remark].filter(Boolean).join(' · '), vod_class: cat }];
  });
}
async function listing(cat, page) {
  const root = cat === 'home' ? '/' : `/${cat || 'home'}/`;
  const path = page === 1 ? root : `${root.replace(/\/$/, '')}/${page}/`;
  return cards(await get(path), cats.find(([id]) => id === cat)?.[1] || '');
}
async function search(wd, page) {
  if (!wd) return [];
  return cards(await get(`/search/?q=${encodeURIComponent(wd)}${page > 1 ? `&page=${page}` : ''}`), '');
}
async function detail(id) {
  if (!/^drama\/\d+$/.test(id)) throw new Error('黄豆2 剧集 ID 无效');
  const html = await get(`/${id}/`);
  const title = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]) || id;
  const total = Number(/data-total="(\d+)"/i.exec(html)?.[1] || 0);
  const numbered = total > 0 && total <= 2000 ? Array.from({ length: total }, (_, i) => i + 1) : [...new Set([...html.matchAll(/title="第\s*(\d+)\s*集"/gi)].map((m) => Number(m[1])))];
  if (!numbered.length && /href="[^"]*\/video\/\d+\//i.test(html)) numbered.push(1);
  if (!numbered.length) return { list: [] };
  const desc = clean(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html)?.[1]);
  const pic = /\b(?:data-src|data-original|src)="(https?:\/\/pic\.[^"]+)"/i.exec(html)?.[1] || '';
  return { list: [{ vod_id: id, vod_name: title, vod_pic: pic, vod_content: desc, vod_remarks: `共${numbered.length}集`, vod_play_from: '黄豆2', vod_play_url: numbered.map((no) => `第${no}集$huangdou2://${id}/${no}`).join('#') }] };
}
async function play(id) {
  const match = /^huangdou2:\/\/(drama\/\d+)\/(\d+)$/.exec(id);
  if (!match) throw new Error('黄豆2 分集 ID 无效');
  const leaf = match[1].split('/').pop(), seq = Number(match[2]);
  const html = await get(`/video/${leaf}/${seq > 1 ? `${seq}/` : ''}`);
  const raw = /<script[^>]*id="ninePlayData"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!raw) throw new Error('黄豆2 播放数据缺失');
  const data = JSON.parse(raw), ep = data.current || data.episode || {};
  const url = ep.src || ep.videoUrl || ep.playUrl || ep.url || (String(ep.srcHevc || '').includes('.m3u8') ? ep.srcHevc : '');
  if (!/^https?:\/\//.test(url)) throw new Error('黄豆2 播放地址无效');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: base + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 30, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_huangdou2', name: '多聚短剧 · 黄豆2', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('home', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
