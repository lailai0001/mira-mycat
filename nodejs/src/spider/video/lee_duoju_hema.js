import req from '../../util/req.js';
import crypto from 'crypto';
// 河马（LeeCatPaw lee_duoju_hema / lee_quanju_hema 共享实现）：
// 直连 freevideo.zqqds.cn；请求体 AES-128-CBC 加密、响应同算法解密（key/iv 与固定 datas 头均为 bundle 内嵌的客户端参数）。
const host = 'https://freevideo.zqqds.cn';
const datas = 'e5f22c6e2c82fe001738cb9ce4696eab0556d064a55aef402e0fbe6b29a083f6538e4567de38e67de2071a49d9751526bfba45314e1fd4702b11c76ab9a3b5f873262854ba66e6715ed51364dbc6ee62c7180e047fcbcdbfd49874fc8f28674b16d90ca71a02de76c70598e0b75e647c37c2c19287e49be5f2a259d727dfc4df3d28802388bf3c356576b342e17e30a2ab74859263dba4d1c8eba79990d22d60d60927fdacb2addf2f0eaadd8887585ca2eb87f603faf0c207dda18cf67dc25b2199d303baff9e6605b3314a7d2631f62864f48619daceb9452f2b7b0667773553741856df030cca68af3c57810f983d452bb428ef5fc32206aef4865ae06c629bee7f5135547304acc7ef4e7c6df887308f2e79c493fd2ee03488722861b5bb51b09cb8911dfc92c288d94e601c066d2f9d612ad2c8d4eeb4920b1d44aff3e13fd75229b857f64925df1cf12f75a00d438c422ec1726462b915903f1dd1f4bb7cdf82cc15a6d507f80c789903e710f39a62aef073f3f93a6c681e75d295428aa290d7e98f82e7e9ad6e2b23d9086dfe8c63c5d8550b13fd61a77291473a8bdd43c7c2639f264be69d9d07f0585de4342a399275a64e7d1d4400b8ed4421a2f289f622e40cdd1cfc916a0b9ce747c924ac33e32d24b91ed5d64772d6ad6896412f52724006eabf12aaecfd6e81dad432c7b3800bbf793a1c375e3e7b4fb3b097724b5fc88a8c9bcf3dbc10cbdb252965';
const key = Buffer.from('647a6b6a67667978677368796c677a6d', 'hex');
const iv = Buffer.from('6170697570646f776e65646372797074', 'hex');
const cats = [['jingxuan', '精选', 53], ['guzhuang', '古装', 54], ['chongsheng', '重生', 55], ['jiating', '家庭', 56], ['lianai', '恋爱', 57]];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
function seal(value) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value))), cipher.final()]).toString('hex').toUpperCase();
}
function unseal(value) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(Buffer.from(value, 'hex')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
async function request(code, payload) {
  const body = seal(payload);
  const r = await req({ method: 'POST', url: `${host}/free-video-portal/portal/${code}`, headers: { datas, 'Content-Type': 'text/plain', 'User-Agent': 'okhttp/4.10.0', Referer: host }, data: body, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`河马接口 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (!result.data) throw new Error('河马接口无数据');
  return unseal(result.data);
}
function cards(items, category) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.bookId), name = clean(item?.bookName);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ vod_id: id, vod_name: name, vod_pic: clean(item.coverWap), vod_remarks: item.updateNum ? `更新${item.updateNum}集` : '', vod_class: category }];
  });
}
const paged = (list, page, size) => ({ list, page, pagecount: list.length === size ? page + 1 : page, limit: size, total: list.length });
async function listing(id, page) {
  const [, name, channel] = cats.find(([key]) => key === id) || cats[0];
  const data = await request('1125', { recSwitch: true, storePageId: 10002, channelGroupId: '10', channelId: channel, channelName: name, lastColumnStyle: 3, fromColumnId: '1', pageFlag: String(page), theaterSubscriptSwitch: true });
  return cards(data.columnData?.[0]?.videoData, name);
}
async function search(wd, page) {
  if (!wd) return paged([], page, 15);
  const data = await request('1803', { keyword: wd, page, size: 15 });
  return paged(cards(data.searchVos, ''), page, 15);
}
async function detail(id) {
  const [infoRes, chapterRes] = await Promise.all([request('1131', { bookId: id }), request('1132', { bookId: id, chapterMin: 1, chapterMax: 10000 })]);
  const info = infoRes.videoInfo || {}, seen = new Set(), episodes = [];
  for (const [index, chapter] of (chapterRes.chapterList || []).entries()) {
    const chapterId = clean(chapter.chapterId), n = Number(chapter.chapterIndex) || index + 1;
    if (!chapterId || seen.has(n)) continue;
    seen.add(n);
    const name = clean(chapter.chapterName) || `第${n}集`;
    episodes.push({ n, row: `${name.replace(/[$#]/g, '_')}$hema://${id}/${chapterId}` });
  }
  episodes.sort((a, b) => a.n - b.n);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(info.bookName), vod_pic: clean(info.coverWap), vod_class: clean(info.finishStatusCn), vod_content: clean(info.introduction), vod_remarks: `共${episodes.length}集`, vod_play_from: '河马', vod_play_url: episodes.map((x) => x.row).join('#') }] };
}
async function play(raw) {
  const match = raw.match(/^hema:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error('河马分集 ID 无效');
  const data = await request('1133', { bookId: match[1], chapterId: match[2], unClockType: 'pay', confirmPay: 2, autoPayFlag: true, omap: { channelName: '精选', logId: '17a6500357709bb2547e1e122b438cfc', originName: '书城', recId: 'bigdata_rec', scene: 'nsc_727', sceneId: 'dzmf_video_sc_reco', strategyId: 'g6y6b5sq' } });
  if (data.chaptersPayType !== '免费') throw new Error('河马该集需要付费');
  const content = data.chapterInfo?.[0]?.content || {};
  const media = clean(content.m3u8720p) || (content.mp4SwitchUrl || []).find((x) => clean(x));
  if (!/^https?:\/\//.test(media || '')) throw new Error('河马未返回媒体地址');
  return { parse: 0, url: media, header: { 'User-Agent': 'okhttp/4.10.0', Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_hema', name: '多聚短剧 · 河马', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('jingxuan', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request), 15));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
