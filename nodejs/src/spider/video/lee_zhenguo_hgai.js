import req from '../../util/req.js';
// 黄果AI（LeeCatPaw lee_zhenguo_hgai）：直连 huangguoai.com / ediayikma.cc 域名池；
// 列表走站方 /api/videos/category 接口，详情/播放解析详情页 videoInitialData 脚本（epPlaySrcs）。
// 注：bundle 原版另带一套 HTTPS_PROXY 环境代理（作者服务器环境用），猫端不适用，已去掉，改走直连 + 域名池轮换。
const bases = ['https://huangguoai.com', 'https://ttvoij.ediayikma.cc', 'https://thu.ediayikma.cc', 'https://pku.ediayikma.cc'];
const cats = [['ai-duanju', 'AI短剧'], ['ai-manju', 'AI漫剧'], ['ai-huanlian', 'AI换脸'], ['ai-mogai', 'AI魔改']];
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
let current = bases[0];
async function raw(url, base) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, Referer: base + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' }, timeout: 15000, responseType: 'text', validateStatus: () => true, maxRedirects: 4 });
  if (r.status !== 200) throw new Error(`黄果AI HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function get(path) {
  let failure;
  for (const base of [current, ...bases.filter((b) => b !== current)]) {
    try { const response = await raw(base + path, base); current = base; return response; }
    catch (error) { failure = error; }
  }
  throw failure;
}
const abs = (url) => url ? new URL(url, current).href : '';
const card = (item) => {
  const id = String(item.id || item.videoId || ''), name = String(item.title || item.name || '').trim();
  if (!id || !name) return null;
  const count = Number(item.episode_count || item.episodeCount || 0);
  return { vod_id: id, vod_name: name, vod_pic: abs(item.cover || item.coverUrl || ''), vod_remarks: count ? `${item.is_finished ? '全' : '更新至'}${count}集` : '', vod_content: String(item.description || item.desc || '') };
};
async function listing(cat, page) {
  const raw = await get(`/api/videos/category/${encodeURIComponent(cat || cats[0][0])}?sort=hot&page=${page}&size=24`);
  const items = JSON.parse(raw)?.data?.items || [];
  return items.map(card).filter(Boolean);
}
async function pageData(id) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('黄果AI剧集 ID 无效');
  const html = await get(`/detail/${encodeURIComponent(id)}/`);
  const raw = /<script[^>]*id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!raw) throw new Error('黄果AI播放数据缺失');
  const data = JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  return { html, data };
}
async function detail(id) {
  const { html, data } = await pageData(id), srcs = data.epPlaySrcs || {};
  let eps = Object.keys(srcs).filter((key) => /^\d+$/.test(key) && /^https?:\/\//.test(srcs[key])).map(Number).sort((a, b) => a - b);
  if (!eps.length && /^https?:\/\//.test(data.videoSrc || '')) eps = [1];
  if (!eps.length) return { list: [] };
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.split(/[_-]/)[0]?.trim() || id;
  const play = eps.map((ep) => `第${ep}集$hgai://${id}/${ep}`).join('#');
  return { list: [{ vod_id: id, vod_name: title, vod_pic: abs(data.coverSrc || data.cover || ''), vod_content: data.description || '', vod_remarks: `共${eps.length}集`, vod_play_from: '黄果AI', vod_play_url: play }] };
}
async function play(id) {
  const match = /^hgai:\/\/([A-Za-z0-9_-]{1,80})\/(\d+)$/.exec(id);
  if (!match) throw new Error('黄果AI分集 ID 无效');
  const { data } = await pageData(match[1]);
  const url = data.epPlaySrcs?.[match[2]] || (match[2] === '1' ? data.videoSrc : '');
  if (!/^https?:\/\//.test(url)) throw new Error('黄果AI分集无法播放');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: current + '/' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 24 ? page + 1 : page, limit: 24, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_zhenguo_hgai', name: '真果鉴 · 黄果AI', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing(cats[0][0], 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => {
        const wd = one(request.body?.wd), page = pageOf(request);
        if (!wd) return paged([], page);
        const a = await listing(cats[0][0], 1), b = await listing(cats[0][0], 2);
        return paged([...a, ...b].filter((row) => row.vod_name.includes(wd)), page);
      });
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
