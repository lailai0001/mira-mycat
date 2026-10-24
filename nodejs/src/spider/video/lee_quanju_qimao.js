import req from '../../util/req.js';
import crypto from 'crypto';
// 七猫（LeeCatPaw lee_duoju_qimao / lee_quanju_qimao 共享实现）：
// 直连 api-store.qmplaylet.com / api-read.qmplaylet.com；请求签名 md5 + 设备头 base64 字符映射均为 bundle 内嵌的客户端参数。
const store = 'https://api-store.qmplaylet.com';
const read = 'https://api-read.qmplaylet.com';
const key = 'd3dGiJc651gSQ8w1';
const trackId = 'ec1280db127955061754851657967';
const charMap = {"+":"P","/":"X","0":"M","1":"U","2":"l","3":"E","4":"r","5":"Y","6":"W","7":"b","8":"d","9":"J","A":"9","B":"s","C":"a","D":"I","E":"0","F":"o","G":"y","H":"_","I":"H","J":"G","K":"i","L":"t","M":"g","N":"N","O":"A","P":"8","Q":"F","R":"k","S":"3","T":"h","U":"f","V":"R","W":"q","X":"C","Y":"4","Z":"p","a":"m","b":"B","c":"O","d":"u","e":"c","f":"6","g":"K","h":"x","i":"5","j":"T","k":"-","l":"2","m":"z","n":"S","o":"Z","p":"1","q":"V","r":"v","s":"j","t":"Q","u":"7","v":"D","w":"w","x":"n","y":"L","z":"e"};
const cats = [["0","推荐"],["-1","新剧"],["1273","都市情感"],["1272","古装"],["571","都市"],["1286","玄幻仙侠"],["570","奇幻"],["590","乡村"],["573","民国"],["572","年代"],["1288","青春校园"],["371","武侠"],["594","科幻"],["556","末世"],["1289","二次元"],["400","逆袭"],["373","穿越"],["795","复仇"],["787","系统"],["790","权谋"],["784","重生"],["1294","女性成长"],["716","打脸虐渣"],["480","闪婚"],["402","强者回归"],["715","追妻火葬场"],["670","家庭"],["558","马甲"],["724","职场"],["343","宫斗"],["1299","高手下山"],["1295","娱乐明星"],["727","异能"],["342","宅斗"],["712","替身"],["338","穿书"],["723","商战"],["1291","种田经商"],["1293","伦理"],["1290","社会话题"],["492","致富"],["1258","偷听心声"],["526","脑洞"],["624","豪门总裁"],["356","萌宝"],["527","战神"],["812","真假千金"],["36","赘婿"],["1269","神医"],["37","神豪"],["1296","小人物"],["545","团宠"],["464","欢喜冤家"],["617","女帝"],["1297","银发"],["28","兵王"],["16","虐恋"],["21","甜宠"],["27","悬疑"],["793","搞笑"],["1287","灵异"]];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
function headers() {
  const device = { static_score: '0.8', uuid: '00000000-7fc7-08dc-0000-000000000000', 'device-id': '20250220125449b9b8cac84c2dd3d035c9052a2572f7dd0122edde3cc42a70', mac: '', sourceuid: 'aa7de295aad621a6', 'refresh-type': '0', model: '22021211RC', 'wlb-imei': '', 'client-id': 'aa7de295aad621a6', brand: 'Redmi', oaid: '', 'oaid-no-cache': '', 'sys-ver': '12', 'trusted-id': '', 'phone-level': 'H', imei: '', 'wlb-uid': 'aa7de295aad621a6', 'session-id': String(Date.now()) };
  const b64 = Buffer.from(JSON.stringify(device)).toString('base64');
  const qmp = Array.from(b64, (ch) => charMap[ch] || ch).join('');
  const sign = md5('AUTHORIZATION=app-version=10001application-id=com.duoduo.read' + 'channel=unknownis-white=net-env=5platform=androidqm-params=' + qmp + 'reg=' + key);
  return { 'net-env': '5', reg: '', channel: 'unknown', 'is-white': '', platform: 'android', 'application-id': 'com.duoduo.read', authorization: '', 'app-version': '10001', 'user-agent': 'webviewversion/0', 'qm-params': qmp, sign, 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.87 Safari/537.36' };
}
async function get(url) {
  const r = await req({ method: 'GET', url, headers: headers(), timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`七猫接口 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (result.errors) throw new Error(`七猫接口错误 ${result.errors.title || result.errors.code}`);
  return result.data || result;
}
function cards(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.playlet_id || item?.id);
    const title = clean(item?.title).replace(/<[^>]*>/g, '');
    if (!id || !title || seen.has(id)) return [];
    seen.add(id);
    const parts = [clean(item.tags), item.total_episode_num || item.total_num ? `${item.total_episode_num || item.total_num}集` : '', clean(item.hot_value) !== '0' ? clean(item.hot_value) : ''].filter(Boolean);
    const cover = clean(item.image_link);
    return [{ vod_id: id, vod_name: title, vod_pic: cover ? new URL(cover, `${store}/`).href : '', vod_remarks: parts.join(' · '), vod_class: clean(item.tags) }];
  });
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: list.length });
async function listing(id, page) {
  const tag = cats.some(([key]) => key === id) ? id : '0';
  let query, sign;
  if (page === 1) { sign = md5(`operation=1playlet_privacy=1tag_id=${tag}${key}`); query = `tag_id=${tag}&playlet_privacy=1&operation=1&sign=${sign}`; }
  else { sign = md5(`next_id=${page}operation=1playlet_privacy=1tag_id=${tag}${key}`); query = `tag_id=${tag}&next_id=${page}&playlet_privacy=1&operation=1&sign=${sign}`; }
  const data = await get(`${store}/api/v1/playlet/index?${query}`);
  return cards(data.list);
}
async function search(wd, page) {
  if (!wd) return paged([], page);
  const sign = md5(`extend=page=${page}read_preference=0track_id=${trackId}wd=${wd}${key}`);
  const url = `${store}/api/v1/playlet/search?extend=&page=${page}&wd=${encodeURIComponent(wd)}&read_preference=0&track_id=${trackId}&sign=${sign}`;
  return paged(cards((await get(url)).list), page);
}
const info = (id) => get(`${read}/player/api/v1/playlet/info?playlet_id=${encodeURIComponent(id)}&sign=${md5(`playlet_id=${id}${key}`)}`);
async function detail(id) {
  const data = await info(id);
  const seen = new Set(), episodes = [];
  for (const item of data.play_list || []) {
    const n = Number(item.sort);
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) continue;
    seen.add(n); episodes.push({ n, row: `第${n}集$qimao://${id}/${n}` });
  }
  episodes.sort((a, b) => a.n - b.n);
  if (!episodes.length) return { list: [] };
  const cover = clean(data.image_link);
  return { list: [{ vod_id: id, vod_name: clean(data.title), vod_pic: cover ? new URL(cover, `${store}/`).href : '', vod_content: clean(data.intro), vod_class: clean(data.tags), vod_remarks: `共${episodes.length}集`, vod_play_from: '七猫', vod_play_url: episodes.map((x) => x.row).join('#') }] };
}
async function play(raw) {
  const match = raw.match(/^qimao:\/\/([^/]+)\/(\d+)$/);
  if (!match) throw new Error('七猫分集 ID 无效');
  const data = await info(match[1]);
  const ep = (data.play_list || []).find((x) => Number(x.sort) === Number(match[2]));
  const url = clean(ep?.video_url);
  if (!/^https?:\/\//.test(url)) throw new Error('七猫未返回媒体地址');
  return { parse: 0, url, header: { Referer: `${store}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_quanju_qimao', name: '全聚合短剧 · 七猫', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('0', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
