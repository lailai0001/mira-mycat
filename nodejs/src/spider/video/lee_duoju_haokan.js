import req from '../../util/req.js';
// 好看短剧（LeeCatPaw lee_duoju_haokan / lee_quanju_haokan 共享实现）：
// 直连 sv.baidu.com 好看接口；搜索在 bundle 里即返回空（原设计）。
const host = 'https://sv.baidu.com';
const query = 'log=vhk&tn=1020970b&ctn=1008350n&blur=1';
const ua = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const cats = [['reboduanju', '热播剧', '1'], ['xinju', '新剧', '2'], ['zhanshen', '战神', '1001'], ['shenhao', '神豪', '2001'], ['shenyi', '神医', '1002'], ['tianchong', '甜宠', '1007'], ['zhuixu', '赘婿', '1003'], ['chuanyue', '穿越重生', '2004'], ['yineng', '异能', '2005'], ['nuelian', '虐恋', '1006'], ['gongdou', '宫斗宅斗', '2006'], ['xuanhuan', '玄幻', '2009']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function post(path, fields) {
  const body = new URLSearchParams(fields).toString();
  const r = await req({ method: 'POST', url: `${host}${path}`, headers: { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded' }, data: body, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`好看接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
function cards(rows, category) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const id = clean(row?.playlet_id), name = clean(row?.playlet_title);
    if (!id || !name) return [];
    return [{ vod_id: id, vod_name: name, vod_pic: clean(row.playlet_poster), vod_remarks: row.episodes_num ? `更新${row.episodes_num}集` : '', vod_class: category }];
  });
}
async function listing(id, page) {
  const [, name, tagId] = cats.find(([key]) => key === id) || cats[0];
  const result = await post(`/haokan/ui-feed/playletTagsFeed?${query}`, { tag_id: tagId, pn: String(page), rn: '12' });
  return cards(result.data?.list, name);
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 12 ? page + 1 : page, limit: 12, total: list.length });
async function detail(raw) {
  const [id, progress = 'undefined'] = raw.split('@');
  const result = await post(`/haokan/ui-video/playlet/rec/detail?${query}`, { playlet_id: id, vid: progress });
  const data = result.data || {}, vids = Array.isArray(data.vid_list) ? data.vid_list : [];
  const episodes = vids.flatMap((vid, index) => clean(vid) ? [`第${index + 1}集$haokan://${clean(vid)}`] : []);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(data.playlet_title), vod_pic: clean(data.playlet_poster), vod_content: clean(data.description), vod_remarks: `共${episodes.length}集`, vod_play_from: '好看', vod_play_url: episodes.join('#') }] };
}
async function play(id) {
  if (!id.startsWith('haokan://')) throw new Error('好看分集 ID 无效');
  const result = await post(`/appui/api?cmd=video/relate&${query}`, { method: 'post', vid: id.slice(9) });
  const rows = result['video/relate']?.data?.cur_video?.clarityUrl || [];
  const best = rows.filter((item) => /^https?:\/\//.test(clean(item.url))).sort((a, b) => Number(b.video_quality || 0) - Number(a.video_quality || 0))[0];
  if (!best) throw new Error('好看未返回媒体地址');
  return { parse: 0, url: best.url, header: { 'User-Agent': ua, Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_haokan', name: '多聚短剧 · 好看', type: 3, searchable: 0, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing(cats[0][0], 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged([], pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
