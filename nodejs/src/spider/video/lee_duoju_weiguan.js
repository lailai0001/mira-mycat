import req from '../../util/req.js';
// 围观（LeeCatPaw lee_duoju_weiguan / lee_zhenguo_guanguo / lee_quanju_weiguan 共享实现）：
// 直连 api.drama.9ddm.com；分集走 weiguan:// 内部 ID，play 时再取清晰度（优先 1080/超清）。
const host = 'https://api.drama.9ddm.com';
const ua = 'okhttp/4.10.0';
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function call(path, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const r = await req({ method: payload ? 'POST' : 'GET', url: host + path, headers: { 'User-Agent': ua, Accept: 'application/json, text/plain, */*', Origin: host, Referer: `${host}/`, ...(payload ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) }, data: payload, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`围观接口 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (!Array.isArray(result.data)) throw new Error(`围观接口无数据: ${result.msg || ''}`);
  return result.data;
}
const find = (word, page) => call('/drama/home/search?version_code=1500&os_type=1', { audience: '全部受众', page, pageSize: 30, searchWord: word, subject: '全部主题' });
const episodes = (id) => call(`/drama/home/shortVideoDetail?version_code=1000&os_type=1&oneId=${encodeURIComponent(id)}&page=1&pageSize=1000`);
const order = (row, index) => Number(row.playOrder) || Number(row.episode) || index + 1;
function media(row) {
  let value = row.playSetting ?? row.videoClarityList;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return clean(row.playUrl); } }
  if (Array.isArray(value)) {
    const best = value.find((item) => /1080|超清/.test(clean(item?.clarity))) || value[0] || {};
    return clean(best.url || best.playUrl || row.playUrl);
  }
  if (value && typeof value === 'object') return clean(value.super || value.high || value.normal || value.url || value.playUrl || row.playUrl);
  return clean(row.playUrl);
}
const cards = (rows) => rows.flatMap((row) => {
  const id = clean(row?.oneId), title = clean(row?.title);
  return id && title ? [{ vod_id: id, vod_name: title, vod_pic: clean(row.vertPoster || row.horizonPoster), vod_remarks: row.episodeCount ? `共${row.episodeCount}集` : '' }] : [];
});
const paged = (list, page) => ({ list, page, pagecount: list.length === 30 ? page + 1 : page, limit: 30, total: list.length });
async function detail(id) {
  if (!id) return { list: [] };
  const rows = await episodes(id);
  const first = rows[0] || {};
  const urls = rows.flatMap((row, index) => /^https?:\/\//.test(media(row)) ? [`第${order(row, index)}集$weiguan://${id}/${order(row, index)}`] : []);
  if (!urls.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(first.title), vod_pic: clean(first.vertPoster || first.horizonPoster), vod_content: clean(first.description || first.desc), vod_play_from: '围观', vod_play_url: urls.join('#') }] };
}
async function play(id) {
  let url = id;
  if (id.startsWith('weiguan://')) {
    const match = /^weiguan:\/\/(.+)\/(\d+)$/.exec(id);
    if (!match) throw new Error('围观分集参数无效');
    const rows = await episodes(match[1]);
    url = media(rows.find((row, index) => order(row, index) === Number(match[2])) || {});
  }
  if (!/^https?:\/\//.test(url)) throw new Error('围观分集没有可播放地址');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_weiguan', name: '多聚短剧 · 围观', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [{ type_id: 'all', type_name: '全部' }], list: cards(await find('', 1)) }));
      fastify.post('/category', async (request) => { const page = pageOf(request); return paged(cards(await find('', page)), page); });
      fastify.post('/search', async (request) => { const page = pageOf(request); return paged(cards(await find(one(request.body?.wd), page)), page); });
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
