import req from '../../util/req.js';
// 91（LeeCatPaw lee_duoju_dj91）：直连 91crdj.com / lwbcbync.cc 域名池，HTML 正则解析；
// 播放取播放页 playInitialData 脚本中的直链（与黄豆2同构、不同站）。
const domains = ['https://91crdj.com', 'https://0303.lwbcbync.cc', 'https://j6bmio.lwbcbync.cc'];
const cats = [['duanju', '短剧'], ['manju', '漫剧'], ['zhenrenju', '真人剧'], ['shipin', '视频'], ['paihang', '排行'], ['biaoqian:aiduanju', 'AI短剧']];
const ua = 'Mozilla/5.0 (Linux; Android 13)';
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
let current = domains[0];
async function get(path) {
  let failure;
  for (const domain of [current, ...domains.filter((d) => d !== current)]) {
    try {
      const r = await req({ method: 'GET', url: domain + path, headers: { 'User-Agent': ua, Referer: domain + '/' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error(`91 HTTP ${r.status}`);
      current = domain; return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    } catch (error) { failure = error; }
  }
  throw failure;
}
const abs = (s) => s?.startsWith('http') ? s : s ? new URL(s, current).href : '';
function cards(html, cat) {
  const starts = [...html.matchAll(/<a\s+class="[^"]*\bcard\b[^"]*"/gi)];
  const seen = new Set();
  return starts.flatMap((start, i) => {
    const block = html.slice(start.index, starts[i + 1]?.index ?? html.length);
    const link = /href="(?:https?:\/\/[^/"]+)?(\/(?:duanju|manju|zhenrenju|shipin|paihang)\/\d+-[^"/]+\/)"/i.exec(block);
    if (!link) return [];
    const id = link[1].replace(/^\/|\/$/g, ''); if (seen.has(id)) return [];
    const rawName = /data-track-item-name="([^"]+)"/i.exec(block)?.[1] || /\balt="([^"]+)"/i.exec(block)?.[1] || /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(block)?.[1];
    const name = clean(rawName).replace(/^《|》$|封面$/g, '');
    if (!name) return [];
    seen.add(id);
    const pic = /\b(?:data-src|data-original|data-lazy-src|src)="([^" ]+)"/i.exec(block)?.[1] || '';
    const mark = clean(/class="eps-flag"[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1]);
    return [{ vod_id: id, vod_name: name, vod_pic: /^(data:|.*placeholder)/i.test(pic) ? '' : abs(pic), vod_remarks: mark, vod_class: cat }];
  });
}
async function listing(cat, page) {
  const entry = cats.find(([id]) => id === cat) || cats[0];
  const root = entry[0].startsWith('biaoqian:') ? `/biaoqian/${encodeURIComponent(entry[0].slice(9))}/` : `/${entry[0]}/`;
  const path = page === 1 ? root : `${root.replace(/\/$/, '')}/page/${page}/`;
  return cards(await get(path), entry[1]);
}
async function search(wd, page) {
  if (!wd) return [];
  return cards(await get(`/search/?q=${encodeURIComponent(wd)}${page > 1 ? `&page=${page}` : ''}`), '');
}
async function detail(id) {
  if (!/^(duanju|manju|zhenrenju|shipin|paihang)\/\d+-[^/]+$/.test(id)) throw new Error('91 剧集 ID 无效');
  const html = await get(`/${id}/`);
  const total = Number(/data-total="(\d+)"/i.exec(html)?.[1] || 0);
  let episodes = total > 0 && total <= 2000 ? Array.from({ length: total }, (_, i) => i + 1) : [...new Set([...html.matchAll(/title="第\s*(\d+)\s*集"/gi)].map((m) => Number(m[1])))];
  if (!episodes.length) episodes = [...new Set([...html.matchAll(new RegExp(`href="(?:https?:\\/\\/[^/" ]+)?\\/${id}\\/(\\d+)\\/"`, 'gi'))].map((m) => Number(m[1])))];
  if (!episodes.length) return { list: [] };
  episodes.sort((a, b) => a - b);
  const title = clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]) || id;
  const desc = clean(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html)?.[1]);
  return { list: [{ vod_id: id, vod_name: title, vod_content: desc, vod_remarks: `共${episodes.length}集`, vod_play_from: '91', vod_play_url: episodes.map((no) => `第${no}集$dj91://${id}/${no}`).join('#') }] };
}
async function play(id) {
  const match = /^dj91:\/\/((?:duanju|manju|zhenrenju|shipin|paihang)\/\d+-[^/]+)\/(\d+)$/.exec(id);
  if (!match) throw new Error('91 分集 ID 无效');
  const html = await get(`/${match[1]}/${match[2]}/`);
  const raw = /<script[^>]*id="playInitialData"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!raw) throw new Error('91 播放数据缺失');
  const data = JSON.parse(raw), ep = data.current || data.episode || {};
  const url = ep.src || ep.videoUrl || ep.playUrl || ep.url || (String(ep.srcHevc || '').includes('.m3u8') ? ep.srcHevc : '');
  if (!/^https?:\/\//.test(url)) throw new Error('91 播放地址无效');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: current + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_dj91', name: '多聚短剧 · 91', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('duanju', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
