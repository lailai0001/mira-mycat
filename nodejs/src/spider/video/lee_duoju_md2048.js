import req from '../../util/req.js';
// 2048（LeeCatPaw lee_duoju_md2048）：直连 2048ai.vip / mdcmai4.xyz / 2048ai.xyz / mdcmai5.xyz 域名池；
// 搜索按原法并发抓“AI短剧 + 全部”多页后本地过滤；播放走站方自带的 /api/v1/m3u8/proxy 中转（站方接口，非作者中继）。
const domains = ['https://2048ai.vip', 'https://mdcmai4.xyz', 'https://2048ai.xyz', 'https://mdcmai5.xyz'];
const cats = [['cat-29', 'AI短剧'], ['cat-6', '麻豆原创AI'], ['cat-9', '麻豆传媒'], ['cat-13', '清纯少女'], ['cat-2', 'AV中文字幕'], ['cat-1', '国产自拍'], ['cat-4', '探花大神'], ['cat-7', '91大神'], ['cat-14', '重口调教'], ['cat-22', '白虎嫩妹'], ['cat-23', '家庭乱伦'], ['cat-19', '黑料吃瓜'], ['posts', '吃瓜图文'], ['all', '全部视频']];
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
let current = domains[0];
async function api(path) {
  let failure;
  for (const domain of [current, ...domains.filter((d) => d !== current)]) {
    try {
      const r = await req({ method: 'GET', url: domain + '/api/v1' + path, headers: { 'User-Agent': ua, Accept: 'application/json, text/plain, */*', Origin: domain, Referer: domain + '/' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error(`2048 HTTP ${r.status}`);
      const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
      if (result.code !== 200) throw new Error(`2048 接口错误 ${result.code}`);
      current = domain; return result.data || {};
    } catch (error) { failure = error; }
  }
  throw failure;
}
const abs = (v) => v?.startsWith('http') ? v : v ? new URL(v, current).href : '';
function card(kind, row) {
  if (!/^\d+$/.test(String(row.id || '')) || !row.title) return null;
  const seconds = Number(row.durationSec) || 0, views = Number(row.viewCount) || 0;
  const remarks = [seconds > 0 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : '', views > 0 ? `${views}次播放` : '', row.authorName || ''].filter(Boolean).join(' · ');
  return { vod_id: `${kind}-${row.id}`, vod_name: row.title, vod_pic: abs(row.coverUrl || row.cover), vod_remarks: remarks, vod_class: row.categoryName || '', vod_content: row.description || row.content || '' };
}
async function listing(cat, page) {
  const path = cat === 'posts' ? `/posts?page=${page}&size=24` : `/videos?${cat?.startsWith('cat-') ? `categoryId=${cat.slice(4)}&` : ''}page=${page}&size=24`;
  const kind = cat === 'posts' ? 'posts' : 'videos';
  return (await api(path)).items?.map((r) => card(kind, r)).filter(Boolean) || [];
}
async function search(wd, page) {
  if (!wd) return [];
  const pages = Math.min(5, Math.max(3, page * 2));
  const tasks = ['cat-29', 'all'].flatMap((cat) => Array.from({ length: pages }, (_, i) => listing(cat, i + 1)));
  const settled = await Promise.allSettled(tasks);
  if (settled.every((entry) => entry.status === 'rejected')) throw settled[0].reason;
  const seen = new Set(), matches = [];
  for (const entry of settled) if (entry.status === 'fulfilled') {
    for (const row of entry.value) {
      if (row.vod_name.toLowerCase().includes(wd.toLowerCase()) && !seen.has(row.vod_id)) { seen.add(row.vod_id); matches.push(row); }
    }
  }
  return matches.slice((page - 1) * 24, page * 24);
}
async function detail(id) {
  const match = /^(videos|posts)-(\d+)$/.exec(id);
  if (!match) throw new Error('2048 影片 ID 无效');
  const row = await api(`/${match[1]}/${match[2]}`);
  const vod = card(match[1], row);
  if (!vod) return { list: [] };
  return { list: [{ ...vod, vod_play_from: '2048', vod_play_url: `播放$md2048://${id}/1` }] };
}
async function play(id) {
  const match = /^md2048:\/\/(videos|posts)-(\d+)\/1$/.exec(id);
  if (!match) throw new Error('2048 播放 ID 无效');
  const row = await api(`/${match[1]}/${match[2]}`);
  const source = row.videoUrl || row.playUrl || row.url || '';
  if (!source) throw new Error('2048 没有视频源');
  return { parse: 0, url: `${current}/api/v1/m3u8/proxy?path=${encodeURIComponent(source)}`, header: { 'User-Agent': ua, Referer: current + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 24 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_md2048', name: '多聚短剧 · 2048', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('cat-29', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
