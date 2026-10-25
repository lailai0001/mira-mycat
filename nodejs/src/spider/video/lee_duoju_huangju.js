import req from '../../util/req.js';
import crypto from 'crypto';
// 黄菊（LeeCatPaw lee_duoju_huangju）：直连 huangju.net / yanyushorttv.cc / yanyushorttv.top 域名池；
// 访客授权（进程内随机 deviceId）+ 域名轮换 + 401/403 重登（bundle 原设计）。
// 播放凭证为站方 /play 返回的 CloudFront 签名 Cookie（从响应 set-cookie 提取，随播放头回传）。
const domains = ['huangju.net', 'yanyushorttv.cc', 'yanyushorttv.top'];
const cats = [['@recommend', '推荐'], ['@new', '最新'], ['@hot', '热门'], ['adult', 'AI成人短剧']];
const ua = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
let domainIndex = 0, token = '';
const deviceId = crypto.randomBytes(16).toString('hex');
const site = () => `https://${domains[domainIndex]}`;
const apiBase = () => `https://api.${domains[domainIndex]}`;
async function requestJson(method, route, body, authorized = true) {
  for (let domainTry = 0; domainTry < domains.length; domainTry++) {
    try {
      if (authorized && !token) await guest();
      for (let authTry = 0; authTry < 2; authTry++) {
        const r = await req({ method, url: apiBase() + route, headers: { 'User-Agent': ua, Accept: 'application/json, text/plain, */*', Referer: site() + '/', Origin: site(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, data: body ? JSON.stringify(body) : undefined, timeout: 20000, responseType: 'text', validateStatus: () => true });
        if ([401, 403].includes(r.status) && authorized && authTry === 0) { token = ''; await guest(); continue; }
        if (r.status < 200 || r.status >= 300) throw new Error(`黄菊 HTTP ${r.status}`);
        const setCookie = r.headers?.['set-cookie'];
        const cookies = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie || '');
        return { data: JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '')), cookies };
      }
    } catch (error) {
      if (domainTry === domains.length - 1) throw error;
      domainIndex = (domainIndex + 1) % domains.length; token = '';
    }
  }
  throw new Error('黄菊所有域名不可用');
}
async function guest() {
  const r = await req({ method: 'POST', url: apiBase() + '/auth/guest', headers: { 'User-Agent': ua, Accept: 'application/json', Referer: site() + '/', Origin: site(), 'Content-Type': 'application/json' }, data: JSON.stringify({ deviceId }), timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`黄菊授权 HTTP ${r.status}`);
  const result = JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
  token = result.token || result.data?.token || '';
  if (!token) throw new Error('黄菊未返回访客授权');
}
const payload = (r) => r?.data && !r?.id && !r?.items && !r?.url ? r.data : r;
const cover = (v) => typeof v === 'string' ? v ? new URL(v, site() + '/').href : '' : Array.isArray(v) ? cover(v[0]) : v ? cover(v.url || v.contentUrl || v.thumbnailUrl) : '';
function cards(data) {
  const seen = new Set();
  return (payload(data)?.items || []).flatMap((r) => {
    const id = String(r.id || ''), slug = String(r.slug || '');
    if (!id || !slug || !r.title || seen.has(`${slug}-${id}`)) return [];
    seen.add(`${slug}-${id}`);
    return [{ vod_id: `${slug}-${id}`, vod_name: r.title, vod_pic: cover(r.coverUrl), vod_remarks: [r.status === 'completed' ? '完结' : r.status === 'ongoing' ? '连载中' : '', r.totalEpisodes ? `全${r.totalEpisodes}集` : ''].filter(Boolean).join(' '), vod_class: typeof r.category === 'string' ? r.category : r.category?.name || '', vod_content: r.description || '' }];
  });
}
async function listing(cat, page, wd = '') {
  const query = new URLSearchParams({ page: String(page) });
  if (wd) query.set('q', wd);
  else if (cat === '@new') query.set('sort', 'new');
  else if (cat === '@hot') query.set('sort', 'hot');
  else if (cat && !['@recommend', 'all'].includes(cat)) query.set('category', cat);
  return cards((await requestJson('GET', `/dramas?${query}`)).data);
}
async function detail(id) {
  if (!/^[^/:?#%]+-[^/:?#%]+$/.test(id)) throw new Error('黄菊剧集 ID 无效');
  const row = payload((await requestJson('GET', `/dramas/${encodeURIComponent(id)}`)).data) || {};
  if (!id.endsWith(`-${row.id}`)) throw new Error('黄菊详情与请求不符');
  const episodes = (row.episodes || []).filter((e) => e?.id && e.playable !== false);
  if (!episodes.length) return { list: [] };
  const numbered = episodes.map((e, i) => ({ no: Number(e.epNo) || i + 1, id: e.id })).sort((a, b) => a.no - b.no);
  return { list: [{ vod_id: id, vod_name: row.title || id, vod_pic: cover(row.coverUrl), vod_content: row.description || '', vod_remarks: `共${numbered.length}集`, vod_play_from: '黄菊', vod_play_url: numbered.map((e) => `第${e.no}集$huangju://${encodeURIComponent(e.id)}`).join('#') }] };
}
async function play(id) {
  const ep = decodeURIComponent(id.replace(/^huangju:\/\//, ''));
  if (!ep || /[/:?#%|"<>]/.test(ep)) throw new Error('黄菊分集 ID 无效');
  const result = await requestJson('GET', `/play/${encodeURIComponent(ep)}`);
  const row = payload(result.data) || {};
  const names = ['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id'];
  const cookies = names.map((name) => {
    const found = new RegExp(`(?:^|[,;\\s])${name}=([^;,\\s"']+)`).exec(result.cookies);
    return found ? `${name}=${found[1]}` : '';
  });
  if (cookies.some((c) => !c)) throw new Error('黄菊媒体凭证不完整');
  if (row.expiresAt && Date.now() / 1000 >= Number(row.expiresAt) / (Number(row.expiresAt) > 1e11 ? 1000 : 1)) throw new Error('黄菊媒体凭证已过期');
  const url = row.url ? new URL(row.url, site() + '/').href : '';
  if (!/^https?:\/\//.test(url)) throw new Error('黄菊无媒体地址');
  return { parse: 0, url, header: { Referer: site() + '/', Cookie: cookies.join('; ') } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length === 20 ? page + 1 : page, limit: 20, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_duoju_huangju', name: '多聚短剧 · 黄菊', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('@recommend', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await listing('', pageOf(request), one(request.body?.wd)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
