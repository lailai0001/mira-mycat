import req from '../../util/req.js';
import crypto from 'crypto';
// 百度短剧（LeeCatPaw lee_duoju_baidu / lee_quanju_baidu 共享实现）：
// 分类直连 mbd.baidu.com；详情/播放复用好看短剧接口（bundle 里即跨源调用好看 handler，
// 猫端蜘蛛互相隔离，故把好看 detail/play 内联于此，并按 bundle 原样把 haokan:// 重标为 baidu://）。
// 注意：mbd 请求头带 bundle 内嵌的 BAIDUCUID 设备标识（客户端级参数，非个人登录态）。
const host = 'https://mbd.baidu.com';
const ua = 'Dalvik/2.1.0 (Linux; U; Android 9; 22081212C Build/PQ3B.190801.002) Talos/1.8.13 SP-engine/3.47.0 bd_dvt/1 baiduboxapp/15.21.0.10 (Baidu; P1 9)';
const cookie = 'BAIDUCUID=0Ovgu0uAvu0_828wj8Hma_8i28joaSuIlOvOigiAH88ikS8f0k35aD6mA';
const cats = [['quanbu', '全部'], ['shenyi', '神医'], ['dushi', '都市'], ['xiandaiyanqing', '现代言情'], ['yineng', '异能'], ['nixi', '逆袭'], ['tianchong', '甜宠'], ['zongcai', '总裁'], ['mengbao', '萌宝'], ['zhanshen', '战神'], ['gongdouzhaidou', '宫斗宅斗'], ['shenhao', '神豪'], ['nuelian', '虐恋'], ['shanhun', '闪婚'], ['xuanhuan', '玄幻'], ['chuanyuechongsheng', '穿越重生'], ['niandai', '年代'], ['jiatinglunli', '家庭伦理'], ['gudaiyanqing', '古代言情'], ['wuxiawuda', '武侠武打'], ['zhuixu', '赘婿'], ['qingchunxiaoyuan', '青春校园']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
async function postForm(url, fields, headers) {
  const body = new URLSearchParams(fields).toString();
  const r = await req({ method: 'POST', url, headers, data: body, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`百度短剧接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function listing(id, page) {
  const name = cats.find(([key]) => key === id)?.[1] || '全部';
  const stamp = Math.floor(Date.now() / 1000);
  const version = crypto.createHash('md5').update(`${stamp}v2`).digest('hex');
  const data = { data: { refreshIndex: page, timestamp: stamp, version, themes: [{ kind: '综合', names: ['新剧'] }, { kind: '题材', names: [name === '全部' ? '' : name] }], extRequest: { flow_tabid: '13' }, from: 'feed', page: 'channel_video_landing', pd: 'feed', theme: '' } };
  const result = await postForm(`${host}/feedapi/v1/videoserver/playlets/list?service=bdbox`, { data: JSON.stringify(data) }, { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': ua, Cookie: cookie });
  const rows = result.data?.items || [];
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const vid = String(row.collId || '').trim(), title = String(row.title || '').trim();
    if (!vid || !title) return [];
    return [{ vod_id: vid, vod_name: title, vod_pic: String(row.img || ''), vod_remarks: String(row.updateStatus || '全集'), vod_class: name }];
  });
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 12 ? page + 1 : page, limit: 12, total: list.length });
// ---- 内联的好看 detail/play（与 tpl_haokan.js 同源，仅分集前缀重标为 baidu://）----
const hkHost = 'https://sv.baidu.com';
const hkQuery = 'log=vhk&tn=1020970b&ctn=1008350n&blur=1';
const hkUa = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
async function hkPost(path, fields) {
  const body = new URLSearchParams(fields).toString();
  const r = await req({ method: 'POST', url: `${hkHost}${path}`, headers: { 'User-Agent': hkUa, 'Content-Type': 'application/x-www-form-urlencoded' }, data: body, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`好看接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function hkDetail(raw) {
  const [id, progress = 'undefined'] = raw.split('@');
  const result = await hkPost(`/haokan/ui-video/playlet/rec/detail?${hkQuery}`, { playlet_id: id, vid: progress });
  const data = result.data || {}, vids = Array.isArray(data.vid_list) ? data.vid_list : [];
  const episodes = vids.flatMap((vid, index) => clean(vid) ? [`第${index + 1}集$haokan://${clean(vid)}`] : []);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(data.playlet_title), vod_pic: clean(data.playlet_poster), vod_content: clean(data.description), vod_remarks: `共${episodes.length}集`, vod_play_from: '好看', vod_play_url: episodes.join('#') }] };
}
async function hkPlay(id) {
  if (!id.startsWith('haokan://')) throw new Error('好看分集 ID 无效');
  const result = await hkPost(`/appui/api?cmd=video/relate&${hkQuery}`, { method: 'post', vid: id.slice(9) });
  const rows = result['video/relate']?.data?.cur_video?.clarityUrl || [];
  const best = rows.filter((item) => /^https?:\/\//.test(clean(item.url))).sort((a, b) => Number(b.video_quality || 0) - Number(a.video_quality || 0))[0];
  if (!best) throw new Error('好看未返回媒体地址');
  return { parse: 0, url: best.url, header: { 'User-Agent': hkUa, Referer: `${hkHost}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_quanju_baidu', name: '全聚合短剧 · 百度', type: 3, searchable: 0, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('quanbu', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged([], pageOf(request)));
      fastify.post('/detail', async (request) => {
        const result = await hkDetail(one(request.body?.id));
        return { list: (result.list || []).map((vod) => ({ ...vod, vod_play_from: '百度', vod_play_url: vod.vod_play_url.replace(/haokan:\/\//g, 'baidu://') })) };
      });
      fastify.post('/play', async (request) => hkPlay(one(request.body?.id).replace(/^baidu:\/\//, 'haokan://')));
    },
  };
}
