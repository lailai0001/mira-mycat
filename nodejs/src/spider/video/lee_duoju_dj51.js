import req from '../../util/req.js';
// 51短剧（LeeCatPaw lee_duoju_dj51）：直连 arab.bqdikpcrx.cc；
// 列表按 /play/<id>/1/ 锚点 + 附近 aria-label/alt 取名，详情/播放解析 __NUXT_DATA__ 引用表（bundle 原设计）。
const base = 'https://arab.bqdikpcrx.cc', ua = 'Mozilla/5.0 (Linux; Android 13)';
const cats = [['rank', '总榜', '/rank/']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
async function get(path) {
  const r = await req({ method: 'GET', url: base + path, headers: { 'User-Agent': ua, Referer: base + '/' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`51短剧 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
function rows(html) {
  const raw = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function resolve(table, value, depth = 0) {
  if (depth > 24) return null;
  if (Number.isInteger(value)) return value >= 0 && value < table.length ? resolve(table, table[value], depth + 1) : value;
  if (Array.isArray(value) && value.length === 2 && ['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef'].includes(value[0])) return resolve(table, value[1], depth + 1);
  return value;
}
const field = (table, obj, keys) => keys.map((k) => resolve(table, obj?.[k])).find((v) => v !== undefined && v !== null && v !== '') ?? '';
function cards(html, cls) {
  const pattern = /<a\b[^>]*href="\/play\/(\d+)\/1\/"[^>]*>/gi;
  const seen = new Set(), found = [];
  for (const match of html.matchAll(pattern)) {
    const id = match[1]; if (seen.has(id)) continue;
    const near = html.slice(Math.max(0, match.index - 1200), match.index + 1200);
    const label = clean(/aria-label="([^"]+)"/i.exec(match[0])?.[1]);
    const alt = clean(/\balt="([^"]+)"/i.exec(near)?.[1]);
    const title = label && !label.includes('播放') ? label : alt;
    if (!title || title === 'logo') continue;
    seen.add(id);
    const image = /(?:data-src|src)="(\/_img\/[^" ]+|https?:\/\/[^" ]*pic[^" ]*)"/i.exec(near)?.[1] || '';
    found.push({ vod_id: id, vod_name: title, vod_pic: image ? new URL(image, base).href : '', vod_remarks: '', vod_class: cls });
  }
  return found;
}
async function listing(cat, page) {
  const entry = cats.find(([id]) => id === cat) || cats[0];
  const path = page > 1 ? `${entry[2].replace(/\/$/, '')}/page/${page}/` : entry[2];
  return cards(await get(encodeURI(path)), entry[1]);
}
async function search(wd, page) {
  if (!wd) return [];
  const html = await get(`/search/?keyword=${encodeURIComponent(wd)}${page > 1 ? `&page=${page}` : ''}`);
  const hits = cards(html, '51短剧').filter((v) => v.vod_name.toLowerCase().includes(wd.toLowerCase()));
  if (hits.length) return hits;
  const lists = [await listing('rank', 1)];
  const seen = new Set();
  return lists.flat().filter((v) => v.vod_name.toLowerCase().includes(wd.toLowerCase()) && !seen.has(v.vod_id) && seen.add(v.vod_id));
}
async function detail(id) {
  if (!/^\d+$/.test(id)) throw new Error('51短剧 ID 无效');
  let html;
  try { html = await get(`/play/${id}/1/`); }
  catch { return { list: [] }; }
  const table = rows(html);
  const info = table.find((r) => r && typeof r === 'object' && !Array.isArray(r) && 'drama_name' in r) || {};
  const episodes = new Map();
  for (const entry of table) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('episode_title' in entry)) continue;
    const no = Number(field(table, entry, ['sort']));
    if (no > 0 && !episodes.has(no)) episodes.set(no, String(field(table, entry, ['episode_title']) || `第${no}集`));
  }
  if (!episodes.size) return { list: [] };
  const sorted = [...episodes].sort((a, b) => a[0] - b[0]);
  return { list: [{ vod_id: id, vod_name: String(field(table, info, ['drama_name', 'video_title']) || id), vod_pic: String(field(table, info, ['cover_img', 'cover']) || ''), vod_content: String(field(table, info, ['description']) || ''), vod_remarks: `共${sorted.length}集`, vod_play_from: '51短剧', vod_play_url: sorted.map(([no, title]) => `${title.replace(/[$#]/g, '_')}$dj51://${id}/${no}`).join('#') }] };
}
async function play(id) {
  const match = /^dj51:\/\/(\d+)\/(\d+)$/.exec(id);
  if (!match) throw new Error('51短剧分集 ID 无效');
  const html = (await get(`/play/${match[1]}/${match[2]}/`)).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  let media = '';
  const table = rows(html);
  for (const entry of table) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !('episode_title' in entry)) continue;
    if (Number(field(table, entry, ['sort'])) === Number(match[2])) {
      const candidate = String(field(table, entry, ['video_url']) || '');
      if (candidate.includes('.m3u8')) { media = candidate; break; }
    }
  }
  if (!media) media = /https?:\/\/[^\s"'<>\\]{10,200}\.m3u8[^\s"'<>\\]{0,200}/i.exec(html)?.[0] || '';
  if (!/^https?:\/\//.test(media)) throw new Error('51短剧无媒体地址');
  return { parse: 0, url: media, header: { 'User-Agent': ua, Referer: base + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_dj51', name: '多聚短剧 · 51短剧', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('rank', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
