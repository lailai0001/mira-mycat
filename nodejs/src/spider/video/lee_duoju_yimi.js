import req from '../../util/req.js';
import crypto from 'crypto';
// 薏米（LeeCatPaw lee_duoju_yimi / lee_quanju_yimi 共享实现）：
// 直连 yimi-api.zhangyue.com；请求用 RSA-SHA256 签名（签名私钥与固定设备/用户参数均为 bundle 内嵌的客户端参数，
// 非用户个人登录态；若介意共享客户端身份，可删此源——见批次报告）。
// 搜索在 bundle 里即返回空（原设计）；分集地址遇 zhangyuecdn 时按原法改写为 ireader 母站。
const host = 'https://yimi-api.zhangyue.com';
const common = 'p1=1750574688516674369&p16=22081212C&p2=341201&p21=10&p22=15&p24=0&p25=21200&p28=cca83346da195d11&p29=zy9351ae&p3=102120009&p31=29d1af74b128f29f&p33=com.zhangyue.app.shortplay&p34=force_fsg_nav_bar&p35=BUZGFVakskazFWG2XwZ/LNs4fOnQczc4iivy1qLFvZqmerp2Abe2hv5Tu1jOHQJO5PGANizg3JbzgaTOon0qkmQ==&p4=501609&p5=16&p7=cca83346da195d11&p9=3';
const user = 'usr=tj1290623468&zyeid=4fc4c6737a87b603e1b8ce9210032bae';
const listSec = 'AAF4IWZnITkqeX4hJCB5eio4IWc4IH4=';
const detailSec = 'AAFzKmZkKjIqenUqJCNycSo7Kmw4I3U=';
const key = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDwCPsMptVn80Im4VVfJ2uAkjs7NpJzzsyGxleK1uN9ux/KTiY2o8kiXcRIcAYVChfdX4ywUs0jrjh8iTcC91r6qgeBaDS8wWsL5bZrn7O/8sqq2hbizV4AvvsqhxVJzRUJZjbNOcMZOPJoeL5K4U4YsiOyV8a9lt5C6zEC4Qy0xjscvOTGyVTqtWeJedEedXtiKLQxAiy6OKJxyHQqdwMHUfAgAbLzAHcVpg1RSXwud+5vtTJNXOXT98FHoFDcRIEcHiiqfU9dskzAhG2nPbFujO+YFq9tZBrWmrhPaXcHfXZqtEYePM4vuvMYjhmANdG4Ehl6pN9nuEaLZ+L35/3nAgMBAAECggEBAOe+M+s2E2ll8WMqQEs6+s5J4Ee9201Vxh8E1TYlW8Ni60FdjAVKwgCc+Mla5nRfp0TCYElH1+hv5vdNXsBNYhgKGm701Z27O4dkA2gK6vcSCFtFbb0Qu4YK3OFlQ8dZ6cqGVbhz4Qmz8k2s7UPMHKM5Mb+YgTc/tlxzR4FZF/RaY8MDpv6iMcXPY27xJzZAV1jROCXjZTZNYbgjsKDAbthRDkjMyuKCIdq7rAHrEyFSx3n7/uxnZYh42bXzWyyWudbkAJoq1ZYx+NyYj5TsN/WNoYbCPcX0Ko+CNnpkC/6qtQbHrBiMprnld67qdLCVhWpmOBYukXVPwFMJjOFlYKkCgYEA+WDh3LpitYSO6hn7mhnbqEQba13cutbJW9RQa0BjGf1OGXdqXpimcWK7viZYAKhLlyGWQmoWduDq4bjSRx7ZxY8pMtpIUWoVkKItD7D2yvmYN1guHNRpHlUIAsSH3HGwQIeXy36hJcB5gC+3XgRVPz/juTMWJDC0usECNFz17bsCgYEA9miWi6JPnZ1ffQzAyE+P6vGC/Vrl7Uyr9gqxI/OkZa8bUqfZtGo5UDGSaGRUsoTsYiEJ8m5blPY0X4xr5x1kO6rfk0gHxn1OXlCP42yT2+CqQvjNO2DHOnWNryKjmAqaAITbmC2lgj0PiiPO32ZT3aXTOgwxTKbFP3LBDmwA18UCgYAQuEgsbmqz1OFoHLnbySQLEhXsiuyDsmbpu0BxEG4UjgEwf+sn0IBIVeBUjWmVEbOPvHbAmTBMZCQbYjLnBdCACGswt6Xln4E2o0j2Jl1Fmpp0C3t7/1nU6MqStO6O/yhcCztIL4NKbq82wvw+V3gHt5bjEePIJWPYqZwmOp1ahQKBgCqfHKs6gBr7RbETq6T6XiJ9c/Lu7iaFxJjicJGPazhLeaZqcjXKye8dI/36nMvkQh8XJ+lPPXgeviBo4aEwbE4F2HZZVz72HcAin0DvXwQBcHH1J0rGCrAJ9V/91d5OtySv1mwUOTS16yIx3260/HyyWj8ILN7dWfEHoG0mMV8hAoGBAI0KBzR9WfzxNKI4ZqRD9/sN+SH4oxymo2oJ+FnOW7hk1E0EyrsGzIDCrS/f7MPzLJI7F4DULsrU5RIQyouIybZra29Vqe4L8kdIae5O0R4Y2r7gt/yWo4cWnW53Q0f5o7mzV10Dc8ewuT1DyJrt25dMWsGsP8rQ/0pVUBLEf93b\n-----END PRIVATE KEY-----';
const ua = 'Dalvik/2.1.0 (Linux; U; Android 15; 22081212C Build/AQ3A.241006.001)';
const cats = [["jingxuan","精选","channel_c6f50cd9"],["nixi","逆袭","channel_a8e10abc"],["fuchou","复仇","channel_d26dd434"],["lianai","恋爱","channel_75afe84a"],["chongsheng","重生","channel_2272aac5"],["gufeng","古风","channel_73190d4f"],["shenyi","神医","channel_2d7eae6b"],["yanqing","言情","channel_614820bd"],["dushi","都市","channel_13dfce8b"],["xuanyi","悬疑","channel_861b9642"],["lishi","历史","channel_18157927"]];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const clean = (value) => String(value ?? '').trim();
const cache = new Map();
async function call(path, query, sec) {
  const timestamp = String(Date.now());
  const message = `&${query}&${path}&${timestamp}&${sec}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(message), key).toString('base64');
  const headers = { 'x-appid': 'zy9351ae', 'x-sig-timestamp': timestamp, 'x-sig-alg': 'RSA-SHA256', 'x-sig-sign': signature, 'x-sig-ver': 'v1.1', 'x-sig-sec': sec, 'User-Agent': ua };
  const r = await req({ method: 'GET', url: `${host}${path}?${query}`, headers, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`薏米接口 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  if (!result.body) throw new Error('薏米接口无数据');
  return result.body;
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 10 ? page + 1 : page, limit: 10, total: list.length });
async function listing(id, page) {
  const [, display, channel] = cats.find(([key]) => key === id) || cats[0];
  const query = `key=${encodeURIComponent(channel)}&${common}&page=${page}&pc=10&${user}`;
  const body = await call('/bookstore/local/visual/channel/list', query, listSec);
  const items = body.list?.[0]?.short_plays || [];
  const seen = new Set();
  return items.flatMap((item) => {
    const vid = clean(item.id), name = clean(item.short_play_name);
    if (!vid || !name || seen.has(vid)) return [];
    seen.add(vid);
    return [{ vod_id: vid, vod_name: name, vod_pic: clean(item.cover_url), vod_remarks: item.favor_count_format ? `热度值:${item.favor_count_format}` : '', vod_class: display }];
  });
}
async function fetchAll(id) {
  const saved = cache.get(id);
  if (saved && Date.now() - saved.at < 300000) return saved.data;
  const episodes = []; let name = '', intro = '', total = Infinity;
  for (let start = 1; start <= Math.min(total, 2000); start += 30) {
    const query = `end_id=${start + 29}&${common}&pc=10&play_id=${encodeURIComponent(id)}&start_id=${start}&${user}`;
    const body = await call('/video/client/short_play/episode_list', query, detailSec);
    if (start === 1) { name = clean(body.name); intro = clean(body.introduce); total = Number(body.target_count) || 2000; }
    const batch = Array.isArray(body.episode_list) ? body.episode_list : [];
    if (!batch.length) break;
    episodes.push(...batch);
  }
  const data = { name, intro, episodes }; cache.set(id, { at: Date.now(), data });
  return data;
}
async function detail(id) {
  const data = await fetchAll(id), seen = new Set(), episodes = [];
  for (const [index, item] of data.episodes.entries()) {
    const n = Number(item.order) || index + 1;
    if (seen.has(n)) continue;
    seen.add(n); episodes.push({ n, row: `第${n}集$yimi://${id}/${n}` });
  }
  episodes.sort((a, b) => a.n - b.n);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: data.name || `薏米短剧 ${id}`, vod_pic: '', vod_content: data.intro, vod_remarks: `共${episodes.length}集`, vod_play_from: '薏米', vod_play_url: episodes.map((x) => x.row).join('#') }] };
}
function fixUrl(raw) {
  const value = clean(raw);
  if (value.includes('zhangyuecdn')) {
    const at = value.indexOf('com');
    if (at >= 0) return `https://mother-t.d.ireader.com${value.slice(at + 3)}`;
  }
  return value;
}
async function play(raw) {
  const match = raw.match(/^yimi:\/\/([^/]+)\/(\d+)$/);
  if (!match) throw new Error('薏米分集 ID 无效');
  const data = await fetchAll(match[1]);
  const ep = data.episodes.find((item, index) => (Number(item.order) || index + 1) === Number(match[2]));
  const url = fixUrl(ep?.play_url || ep?.playUrl);
  if (!/^https?:\/\//.test(url)) throw new Error('薏米未返回媒体地址');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: `${host}/` } };
}
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_yimi', name: '多聚短剧 · 薏米', type: 3, searchable: 0, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('jingxuan', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged([], pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
