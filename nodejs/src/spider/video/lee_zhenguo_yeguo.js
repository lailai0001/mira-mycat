import req from '../../util/req.js';
import crypto from 'crypto';
// 野果（LeeCatPaw lee_zhenguo_yeguo）：直连 ekzhadks.cc 三站；
// 加密配置（AES key/iv/sign_key）不在代码里写死，而是每次从站方自己的 Nuxt JS 里动态发现、缓存 1 小时（bundle 原设计）；
// 响应验签（sha256+md5）+ AES-CBC 解密后才可用。
const sites = ['https://blue.ekzhadks.cc', 'https://aids.ekzhadks.cc', 'https://adopt.ekzhadks.cc'];
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const identifier = crypto.randomBytes(16).toString('hex');
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
let access, site = sites[0];
async function getText(url, referer) {
  const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, Accept: '*/*', Referer: referer || site + '/' }, timeout: 25000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`野果 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
const bytes = (value) => value.includes('_') ? Buffer.from(value.split('_').map((part) => Number(part))) : Buffer.from(value);
function config(js) {
  const fields = {};
  for (const match of js.matchAll(/\b(version|mode|padding|key|iv|sign_key)\s*:\s*(?:[a-zA-Z_$][a-zA-Z0-9_$]*\(\s*)?["'`]([^"'`\\\r\n]{1,512})["'`]/g)) fields[match[1]] = match[2];
  if (fields.version !== 'v0' || fields.mode !== 'CBC' || fields.padding !== 'Pkcs7') return null;
  const key = bytes(fields.key || ''), iv = bytes(fields.iv || ''), signKey = bytes(fields.sign_key || '');
  if (![16, 24, 32].includes(key.length) || iv.length !== 16 || !signKey.length) return null;
  return { key, iv, signKey };
}
async function discover(base) {
  const html = await getText(base + '/', base + '/');
  const modules = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/gi)];
  const entry = modules.map((m) => new URL(m[1], base).href).find((url) => url.startsWith(base + '/_nuxt/') && url.includes('.js'));
  if (!entry) throw new Error('野果配置脚本缺失');
  const script = await getText(entry, base + '/');
  const imports = [...script.matchAll(/import\s*\{([^{};]+)\}\s*from\s*["'`]([^"'`]+)["'`]/gs)].sort((a, b) => Number(a[1].includes(',')) - Number(b[1].includes(',')));
  let api = /https:\/\/[a-z0-9.-]+\/api\.php/i.exec(script)?.[0] || '';
  const seen = new Set();
  for (const item of imports) {
    if (item[1].length > 2400 || seen.size >= 20) continue;
    const url = new URL(item[2], entry).href;
    if (!url.startsWith(base + '/_nuxt/') || !url.includes('.js') || seen.has(url)) continue;
    seen.add(url);
    const module = await getText(url, base + '/');
    api ||= /https:\/\/[a-z0-9.-]+\/api\.php/i.exec(module)?.[0] || '';
    const found = config(module);
    if (found) return { ...found, api: api || 'https://www.yeguodj.com/api.php', site: base, loaded: Date.now() };
  }
  throw new Error('野果加密配置失效');
}
async function credentials() {
  if (access && Date.now() - access.loaded < 3600000) return access;
  let failure;
  for (const base of [site, ...sites.filter((item) => item !== site)]) {
    try { access = await discover(base); site = base; return access; }
    catch (error) { failure = error; }
  }
  throw failure;
}
function decode(env, credentials) {
  if (env.sign) {
    const line = Object.keys(env).filter((key) => !['sign', '_ver'].includes(key) && env[key] != null).sort().map((key) => `${key}=${key === 'data' ? String(env[key]).replaceAll(' ', '+') : String(env[key])}`).join('&');
    const sha = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(line), credentials.signKey])).digest();
    const expected = crypto.createHash('md5').update(sha.toString('hex')).digest('hex');
    if (expected !== String(env.sign).toLowerCase()) throw new Error('野果响应签名不匹配');
  }
  if (typeof env.data !== 'string') return env;
  const decipher = crypto.createDecipheriv(`aes-${credentials.key.length * 8}-cbc`, credentials.key, credentials.iv);
  const raw = Buffer.concat([decipher.update(Buffer.from(env.data.replaceAll(' ', '+'), 'base64')), decipher.final()]);
  return JSON.parse(raw.toString('utf8'));
}
async function call(route, params = {}) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await credentials();
    const body = new URLSearchParams(Object.entries({ bundleId: 'com.pwa.mater', version: '1.3.2', oauth_type: 'web', language: 'zh', via: 'pwa', oauth_id: identifier, trace_id: identifier, token: '', ...params }).sort(([x], [y]) => x.localeCompare(y))).toString();
    try {
      const r = await req({ method: 'POST', url: a.api + route, data: body, headers: { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json, text/plain, */*', Origin: a.site, Referer: a.site + '/' }, timeout: 25000, responseType: 'text', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error(`野果 HTTP ${r.status}`);
      const payload = decode(JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '')), a);
      if (String(payload.status) !== '1') throw new Error(`野果请求失败：${payload.msg || payload.status}`);
      return payload.data || {};
    } catch (error) { failure = error; access = undefined; }
  }
  throw failure;
}
const cover = (value) => {
  if (Array.isArray(value)) return cover(value[0]);
  if (value && typeof value === 'object') return cover(value.url || value.contentUrl || value.thumbnailUrl);
  if (!value || typeof value !== 'string') return '';
  try { return new URL(value, site).href; } catch { return ''; }
};
function card(row) {
  const id = String(row.video_id || row.id || ''), title = String(row.title || '').trim();
  if (!/^[1-9]\d{0,17}$/.test(id) || !title) return null;
  const count = Number(row.episode_count || row.episodes || row.total_serial || 0);
  const status = row.serialize_status === 1 ? '连载中' : row.serialize_status === 2 ? '已完结' : '';
  return { vod_id: id, vod_name: title, vod_pic: cover(row.cover), vod_remarks: `${status}${count > 0 ? ` 全${count}集` : ''}`.trim(), vod_class: '推荐', vod_content: String(row.description || '') };
}
function cards(rows) { return (rows || []).map(card).filter(Boolean); }
async function listing(page) { return cards((await call('/api/theater/exploreList', { page: String(page), limit: '20' })).list); }
async function search(wd, page) { return wd ? cards((await call('/api/search/result', { keyword: wd, tab: 'video', page: String(page), limit: '20' })).list) : []; }
async function detail(id) {
  if (!/^[1-9]\d{0,17}$/.test(id)) throw new Error('野果剧集 ID 无效');
  const data = await call('/api/playlet/detail', { video_id: id, id, episode_id: '0', related_limit: '0' });
  if (String(data.video_id || data.id) !== id) throw new Error('野果详情不匹配');
  const episodes = (data.episodes || []).filter((ep) => !ep.is_adv && /^[1-9]\d{0,17}$/.test(String(ep.id)) && Number(ep.sort) > 0).sort((a, b) => Number(a.sort) - Number(b.sort));
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: data.title || id, vod_pic: cover(data.cover), vod_content: data.description || '', vod_remarks: `共${episodes.length}集`, vod_play_from: '野果', vod_play_url: episodes.map((ep) => `第${ep.sort}集$yeguo://${id}/${ep.id}`).join('#') }] };
}
async function play(id) {
  const match = /^yeguo:\/\/([1-9]\d{0,17})\/([1-9]\d{0,17})$/.exec(id);
  if (!match) throw new Error('野果分集 ID 无效');
  const data = await call('/api/playlet/play', { playlet_id: match[1], video_id: match[1], episode_id: match[2] });
  if (String(data.playlet_id) !== match[1] || String(data.id) !== match[2] || data.is_adv) throw new Error('野果播放分集不匹配');
  const no = Number(data.episode_sort);
  if (no < 1) throw new Error('野果分集编号无效');
  const referer = `${site}/drama/video/${match[1]}/${no > 1 ? `ep-${no}/` : ''}`;
  const url = data.video_url || data.video_url_h265;
  if (!/^https?:\/\//.test(url)) throw new Error('野果没有媒体地址');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: referer } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_zhenguo_yeguo', name: '真果鉴 · 野果', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [{ type_id: 'all', type_name: '推荐' }], list: await listing(1) }));
      fastify.post('/category', async (request) => paged(await listing(pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
