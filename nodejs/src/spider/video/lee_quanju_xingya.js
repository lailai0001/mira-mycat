import req from '../../util/req.js';
// 星芽（LeeCatPaw lee_duoju_xingya / lee_quanju_xingya / lee_zhenguo_yaguo 共享实现）：
// 直连 app.whjzjx.cn，登录走 u.shytkjgs.com；device/devToken 为 bundle 内嵌的客户端参数，
// 登录返回的 token 只存模块级内存、401/403 时自动重登（与 bundle 一致）。
const host = 'https://app.whjzjx.cn';
const device = '24250683a3bdb3f118dff25ba4b1cba1a';
const devToken = 'Bnf9uRPIcKTIOZasAUgUJAUDXhIOlB4lpDKsyLD4yvKm708G4J8PN1Z-gMaFgPwkRvqJrEje81VRxh41IaSj0lN' + 'WuoRLUg1r08Z1f0IqSv2q1lvfxrYckKavmnAPYLdkT9P1fPFNRt0RuN3DLLFZqApRDdPD3mM2jB6d79CF2LtM*';
const appUa = 'Mozilla/5.0 (Linux; Android 9; RMX1931 Build/PQ3A.190605.05081124; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36';
const cats = [['juchang', '剧场', '1'], ['reboduanju', '热播剧', '2'], ['huiyuan', '会员专享', '8'], ['xingxuan', '星选好剧', '7'], ['xinju', '新剧', '3'], ['yangguang', '阳光剧场', '5']];
const baseHeaders = { 'User-Agent': 'okhttp/4.10.0', 'x-app-id': '7', platform: '1', version_name: '3.3.1', app_version: '3.3.1', device_platform: 'android', device_id: device, device_type: 'RMX1931', device_brand: 'realme', os_version: '9', channel: 'default', uuid: 'randomUUID_914e7a9b-deac-4f80-9247-db56669187df' };
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
let token = '';
async function requestJson(url, method, headers, body) {
  const payload = body == null ? undefined : String(body);
  const r = await req({ method, url, headers, data: payload, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`星芽接口 HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
async function login() {
  const body = `device=${device}&install_first_open=false&first_install_time=1723214205125&last_update_time=1723214205125&report_link_url=`;
  const res = await requestJson('https://u.shytkjgs.com/user/v1/account/login', 'POST', { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  token = clean(res.data?.token);
  if (!token) throw new Error('星芽登录未返回 token');
}
async function call(path, method = 'GET', payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!token) await login();
    const headers = { ...baseHeaders, authorization: token, dev_token: devToken, user_agent: appUa, support_h265: '1' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const result = await requestJson(`${host}${path}`, method, headers, payload === undefined ? undefined : JSON.stringify(payload));
      if (!result.data) throw new Error(`星芽接口无数据 ${result.msg || ''}`);
      return result.data;
    } catch (error) {
      if (attempt === 0 && /HTTP 40[13]|token|登录/i.test(error.message)) { token = ''; continue; }
      throw error;
    }
  }
  throw new Error('星芽鉴权失败');
}
function cards(items, category) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = clean(item?.id), name = clean(item?.title);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ vod_id: id, vod_name: name, vod_pic: clean(item.cover_url), vod_remarks: item.total ? `共${item.total}集` : '', vod_class: category }];
  });
}
async function listing(id, page) {
  const [, name, classId] = cats.find(([key]) => key === id) || cats[0];
  const data = await call(`/cloud/v2/theater/home_page?theater_class_id=${classId}&type=1&class2_ids=0&page_num=${page}&page_size=24`);
  return cards((data.list || []).map((row) => row.theater), name);
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 24 ? page + 1 : page, limit: 24, total: list.length });
async function search(wd, page) {
  if (!wd) return paged([], page);
  const data = await call('/v3/search', 'POST', { text: wd });
  return paged(cards(data.theater?.search_data, '搜索'), page);
}
const detailData = (id) => call(`/v2/theater_parent/detail?theater_parent_id=${encodeURIComponent(id)}`);
async function detail(id) {
  const data = await detailData(id);
  const seen = new Set(), eps = [];
  for (const [index, entry] of (data.theaters || []).entries()) {
    const n = Number(entry.num) || index + 1;
    if (seen.has(n)) continue;
    seen.add(n);
    const son = clean(entry.son_title);
    const name = son && son !== clean(data.title) ? `第${n}集 ${son}` : `第${n}集`;
    eps.push({ n, item: `${name.replace(/[$#]/g, '_')}$xingya://${id}/${n}` });
  }
  eps.sort((a, b) => a.n - b.n);
  if (!eps.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: clean(data.title), vod_pic: clean(data.cover_url), vod_content: clean(data.introduction), vod_remarks: `共${eps.length}集`, vod_play_from: '星芽', vod_play_url: eps.map((x) => x.item).join('#') }] };
}
async function play(raw) {
  const match = raw.match(/^xingya:\/\/([^/]+)\/(\d+)$/);
  if (!match) throw new Error('星芽分集 ID 无效');
  const data = await detailData(match[1]);
  const ep = (data.theaters || []).find((x) => Number(x.num) === Number(match[2]));
  const url = clean(ep?.son_video_url);
  if (!/^https?:\/\//.test(url)) throw new Error('星芽未返回媒体地址');
  return { parse: 0, url, header: { 'User-Agent': appUa, Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_quanju_xingya', name: '全聚合短剧 · 星芽', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('juchang', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => search(one(request.body?.wd), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
