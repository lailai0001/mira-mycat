import req from '../../util/req.js';
import crypto from 'crypto';
// 牛牛（LeeCatPaw lee_duoju_niuniu / lee_quanju_niuniu 共享实现）：
// 主站 new.tianjinzhitongdaohe.com（游客 token，进程内随机 deviceId）；
// 第三方剧集走牛牛 App 自带的 csj-sp.csjdeveloper.com 短剧服务（HMAC/AES 均为 bundle 内嵌的客户端参数）。
const host = 'https://new.tianjinzhitongdaohe.com';
const csjHost = 'https://csj-sp.csjdeveloper.com';
const hmacKey = 'aceaa47f96b4875d446b2e1d97e03bbb';
const siteId = '5627189';
const cats = [['', '全部'], ['现言', '现言'], ['古言', '古言'], ['历史', '历史'], ['都市', '都市'], ['亲情', '亲情'], ['玄幻', '玄幻'], ['热血', '热血'], ['动作', '动作'], ['喜剧', '喜剧'], ['悬疑', '悬疑'], ['军事', '军事'], ['二次元', '二次元'], ['其他剧情', '其他剧情']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
const deviceId = crypto.randomBytes(16).toString('hex');
let token = '';
let csjToken = '', csjTokenAt = 0;
async function requestJson(url, method, headers, body) {
  const payload = body == null ? undefined : String(body);
  const r = await req({ method, url, headers, data: payload, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`牛牛接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function requestText(url, method, headers, body) {
  const payload = body == null ? undefined : String(body);
  const r = await req({ method, url, headers, data: payload, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`牛牛 CSJ 接口 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function visitor() {
  const result = await requestJson(`${host}/api/v1/app/user/visitorInfo`, 'GET', { deviceid: deviceId, token: '', client: 'app', devicetype: 'Android', 'User-Agent': 'okhttp/4.12.0' });
  token = clean(result.data?.token);
  if (!token) throw new Error('牛牛游客接口未返回 token');
}
async function post(path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) await visitor();
    const result = await requestJson(`${host}${path}`, 'POST', { token, deviceid: deviceId, 'Content-Type': 'application/json;charset=UTF-8', 'User-Agent': 'okhttp/4.12.0' }, JSON.stringify(body));
    if (Number(result.code) === 2006 && attempt === 0) { token = ''; continue; }
    if (![0, 200].includes(Number(result.code))) throw new Error(`牛牛接口错误 ${result.code} ${result.msg || ''}`);
    return result.data || {};
  }
  throw new Error('牛牛游客鉴权失败');
}
const hmac = (message) => crypto.createHmac('sha256', hmacKey).update(message).digest('hex');
function aes(plain, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(key), null);
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64');
}
function unaes(encoded, key) {
  const cipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key), null);
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(encoded, 'base64')), cipher.final()]).toString('utf8'));
}
function loginBody() {
  return 'ac=wifi&os=Android&vod_version=1.10.21.6-tob&os_version=9&type=1' + '&clientVersion=v5.2.5&uuid=Y4WNZ3SAWK7MAJMH7CXCDHJ4VMPVFRZQTBSIA4XTYO4AWEUHIK6Q01' + '&resolution=1280*2618&openudid=889edced38f1069b&dt=Pixel%204' + '&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9&os_api=28' + '&install_id=1549688030634536&device_brand=google&sdk_version=1.1.3.0' + '&package_name=com.niuniu.ztdh.app&siteid=' + siteId + '&dev_log_aid=667431&oaid=&timestamp=' + Math.floor(Date.now() / 1000);
}
async function csjLogin(force = false) {
  if (!force && csjToken && Date.now() - csjTokenAt < 1800000) return csjToken;
  const plain = loginBody(), ts = String(Math.floor(Date.now() / 1000));
  const key = 'dafdb3d2a5c343d6', nonce = 'VX1KKGtoBDCi1fB1';
  const result = await requestText(`${csjHost}/csj_sp/api/v1/user/login?siteid=${siteId}`, 'POST', { 'X-Salt': '786774955F', 'X-Nonce': nonce, 'X-Timestamp': ts, 'X-Signature': hmac(ts + nonce + plain), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'okhttp/4.12.0' }, aes(plain, key));
  csjToken = clean(unaes(result, key).data?.access_token);
  if (!csjToken) throw new Error('牛牛 CSJ 登录未返回 access_token');
  csjTokenAt = Date.now(); return csjToken;
}
async function csjPost(path, plain) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const access = await csjLogin(attempt > 0);
    const ts = String(Math.floor(Date.now() / 1000));
    const key = 'ce49b18dd4e0a4d8', nonce = 'X9UknYKtLa3DmtjC';
    const result = await requestText(`${csjHost}${path}`, 'POST', { 'X-Salt': 'FD8188A8D5', 'X-Nonce': nonce, 'X-Timestamp': ts, 'X-Access-Token': access, 'X-Signature': hmac(ts + nonce + plain), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'okhttp/3.12.11' }, aes(plain, key));
    const data = unaes(result, key);
    if ([0, 200].includes(Number(data.ret || 0)) && [0, 200].includes(Number(data.code || 0))) return data;
    csjToken = '';
  }
  throw new Error('牛牛 CSJ 接口返回错误');
}
function csjBody(id, index) {
  const ts = Math.floor(Date.now() / 1000);
  return 'not_include=0&lock_free=1&type=1&clientVersion=v5.2.5' + '&uuid=6IDYUSASPQY5BBVACWQW3LLTPV4V7DE26UOCX5TZTVUGX4VUJNXQ01' + '&resolution=1080*2320&openudid=82f4175d577a2939&dt=22021211RC&os_api=31' + '&install_id=1496879012031075&sdk_version=1.1.3.0&siteid=' + siteId + '&dev_log_aid=667431&oaid=abec0dfff623201b&timestamp=' + ts + '&direction=0&ac=mobile&os=Android&vod_version=1.10.21.6-tob' + '&os_version=12&count=1&index=' + index + '&lock_index=' + index + (id ? '&shortplay_id=' + id : '') + '&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9' + '&device_brand=Redmi&package_name=com.niuniu.ztdh.app';
}
function unlockBody(id, index) {
  return 'ac=mobile&os=Android&vod_version=1.10.21.6-tob&os_version=12' + '&lock_ad=1&lock_free=1&type=1&clientVersion=v5.2.5' + '&uuid=6IDYUSASPQY5BBVACWQW3LLTPV4V7DE26UOCX5TZTVUGX4VUJNXQ01' + '&resolution=1080*2320&openudid=82f4175d577a2939&shortplay_id=' + id + '&dt=22021211RC&sha1=46121F77CE2FCAD3DBC3B9EC8A24908C1A8AD6D9' + '&lock_index=' + index + '&os_api=31&install_id=1496879012031075' + '&device_brand=Redmi&sdk_version=1.1.3.0&package_name=com.niuniu.ztdh.app' + '&siteid=' + siteId + '&dev_log_aid=667431&oaid=abec0dfff623201b' + '&timestamp=' + Math.floor(Date.now() / 1000);
}
const csjDetail = (id, index) => csjPost(`/csj_sp/api/v1/shortplay/detail?siteid=${siteId}`, csjBody(id, index));
function cards(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.id), name = clean(item?.name);
    if (!id || id === '0' || !name || seen.has(id)) return [];
    seen.add(id);
    const count = Number(item.totalEpisode) || 0;
    const remarks = [clean(item.type), count > 0 ? `共${count}集` : ''].filter(Boolean).join(' · ');
    return [{ vod_id: id, vod_name: name, vod_pic: clean(item.cover), vod_remarks: remarks, vod_class: '牛牛短剧' }];
  });
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 40 ? page + 1 : page, limit: 40, total: list.length });
async function listing(id, page) {
  const data = await post('/api/v1/app/screen/screenMovie', { condition: { classify: id === '全部' ? '' : id, typeId: 'S1' }, pageNum: page, pageSize: 40 });
  return cards(data.records);
}
async function search(wd, page) {
  if (!wd) return paged([], page);
  const data = await post('/api/v1/app/search/searchMovie', { condition: { typeId: 'S1', value: wd }, pageNum: page, pageSize: 40 });
  return paged(cards(data.records), page);
}
const num = (value) => /^\d+$/.test(value) ? Number(value) : value;
async function detail(id) {
  const desc = await post('/api/v1/app/play/movieDesc', { id: num(id), typeId: 'S1' });
  const data = await post('/api/v1/app/play/movieDetails', { id: num(id), source: 0, typeId: 'S1', userId: '546932' });
  const episodes = (data.episodeList || []).flatMap((item, index) => {
    const epId = clean(item.id); if (!epId) return [];
    const number = clean(item.episode) || String(index + 1);
    const name = number.includes('集') ? number : `第${number}集`;
    return [`${name.replace(/[$#]/g, '_')}$niuniu://${id}/f${epId}`];
  });
  const third = clean(data.thirdPlayId);
  if (!episodes.length && third && third !== '0') {
    const csj = await csjDetail(third, 1);
    for (const entry of csj.data?.episode_right_list || []) {
      const index = Number(entry.index);
      if (index > 0) episodes.push(`第${index}集$niuniu://${third}/t${index}`);
    }
  }
  if (!episodes.length) return { list: [] };
  const content = [desc.classify ? `类型：${desc.classify}` : '', desc.score ? `评分：${desc.score}` : '', desc.introduce || data.introduce ? `简介：${desc.introduce || data.introduce}` : ''].filter(Boolean).join('\n');
  return { list: [{ vod_id: id, vod_name: clean(desc.name || data.name) || `牛牛短剧 ${id}`, vod_pic: clean(desc.cover || data.cover), vod_content: content, vod_remarks: `共${episodes.length}集`, vod_play_from: '牛牛', vod_play_url: episodes.join('#') }] };
}
async function play(raw) {
  const match = raw.match(/^niuniu:\/\/([^/]+)\/([ft])(.+)$/);
  if (!match) throw new Error('牛牛分集 ID 无效');
  if (match[2] === 't') {
    const index = Number(match[3]);
    if (!Number.isInteger(index) || index < 1) throw new Error('牛牛 CSJ 集数无效');
    try { await csjPost(`/csj_sp/api/v1/pay/ad_unlock?siteid=${siteId}`, unlockBody(match[1], index)); } catch { /* 免费章节可直接取地址 */ }
    const csj = await csjDetail(match[1], index);
    for (const item of csj.data?.list || []) {
      const encoded = clean(item.video_model?.video_list?.video_1?.main_url);
      if (!encoded) continue;
      const url = Buffer.from(encoded, 'base64').toString('utf8').trim();
      if (/^https?:\/\//.test(url)) return { parse: 0, url, header: { 'User-Agent': 'okhttp/4.12.0' } };
    }
    throw new Error('牛牛 CSJ 未返回媒体地址');
  }
  const data = await post('/api/v1/app/play/movieDetails', { id: num(match[3]), source: 0, typeId: 'S1', userId: '546932', episodeId: num(match[1]) });
  const url = clean(data.url);
  if (!/^https?:\/\//.test(url)) throw new Error('牛牛未返回媒体地址');
  return { parse: 0, url, header: { 'User-Agent': 'okhttp/4.12.0' } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_niuniu', name: '多聚短剧 · 牛牛', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
