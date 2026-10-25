import req from '../../util/req.js';
import crypto from 'crypto';
import zlib from 'zlib';
// 黄豆（LeeCatPaw lee_zhenguo_huangdou）：直连 tideember.cc / xqjurgek.top；
// 加密二进制协议：请求体 gzip + AES-256-CBC（密钥由随机 rid 与平台密钥派生），
// 响应可能是明文 JSON 或加密+gzip（bundle 原设计）；播放前按原法 Range 嗅探正片可读性，
// 预告/无直链时回落站方免费 HLS 线。
const hosts = ['https://tideember.cc', 'https://xqjurgek.top'];
const platformKey = '7961beb44246e3012ce228d6b5ced05a';
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const sessionId = crypto.randomBytes(16).toString('hex'), deviceId = sessionId;
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
let host = hosts[0];
async function call(path, data) {
  const rid = crypto.randomBytes(16).toString('hex'), iv = crypto.randomBytes(16),
    key = crypto.createHmac('sha256', platformKey).update(Buffer.from(rid.replaceAll('-', ''), 'hex')).digest();
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify({ token: '', deviceId, data })));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const body = Buffer.concat([iv, cipher.update(plain), cipher.final()]);
  const ts = String(Math.floor(Date.now() / 1000));
  const sign = crypto.createHash('sha256').update(`Dart|${sessionId}|${rid}|${ts}|${path}`).digest('hex') + '-' + ts;
  let failure;
  for (const base of [host, ...hosts.filter((x) => x !== host)]) {
    try {
      const r = await req({ method: 'POST', url: base + '/api' + path, data: body, headers: { 'User-Agent': ua, Accept: '*/*', Origin: base, Referer: base + '/home', 'Content-Type': 'application/octet-stream', version: '2.0.0', deviceType: 'web', requestId: rid, sessionId, time: ts, sign }, timeout: 25000, responseType: 'arraybuffer', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error(`黄豆 HTTP ${r.status}`);
      const blob = Buffer.from(r.data);
      let decoded;
      try { decoded = JSON.parse(blob.toString('utf8')); }
      catch {
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, blob.subarray(0, 16));
        let raw = Buffer.concat([decipher.update(blob.subarray(16)), decipher.final()]);
        if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw);
        decoded = JSON.parse(raw.toString('utf8'));
      }
      if (decoded.status && decoded.status !== 'y') throw new Error(`黄豆接口拒绝：${decoded.message || decoded.msg || decoded.status}`);
      host = base; return decoded.data || decoded;
    } catch (error) { failure = error; }
  }
  throw failure;
}
function card(item) {
  const id = String(item.id || item.drama_id || '').replace(/^rp_/, '');
  if (!id) return null;
  return { vod_id: id, vod_name: String(item.name || item.title || id), vod_pic: item.img_y || item.img_x || item.img || item.cover || item.pic || '', vod_remarks: item.update_label || item.corner || (item.episode_count ? `全${item.episode_count}集` : ''), vod_class: item.category || item.category_name || '', vod_content: item.description || item.summary || '' };
}
async function listing(page) { return (await call('/drama/rank', { tab: 'all', page: String(page) })).list?.map(card).filter(Boolean) || []; }
async function search(wd, page) {
  if (!wd) return [];
  const data = await call('/drama/list', { keywords: wd, page: String(page), page_size: '30' });
  return (data.list || []).map(card).filter(Boolean);
}
async function detail(id) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('黄豆剧集 ID 无效');
  const data = await call('/drama/detail', { id });
  const returned = String(data.id || data.drama_id || '').replace(/^rp_/, '');
  if (returned && returned !== id) throw new Error('黄豆详情不匹配');
  const rows = data.episodes || data.chapters || data.list || [];
  const episodes = (Array.isArray(rows) ? rows : rows.episodes || rows.list || []).map((ep) => ({ no: Number(ep.seq || ep.episode || ep.ep), name: String(ep.name || ep.title || '') })).filter((ep) => ep.no > 0).sort((a, b) => a.no - b.no);
  if (!episodes.length) return { list: [] };
  return { list: [{ vod_id: id, vod_name: data.name || data.title || id, vod_pic: data.img_y || data.img_x || data.img || data.cover || '', vod_content: data.description || data.summary || '', vod_remarks: `共${episodes.length}集`, vod_play_from: '黄豆', vod_play_url: episodes.map((ep) => `${(ep.name || `第${ep.no}集`).replaceAll('#', '_').replaceAll('$', '_')}$huangdou://${id}/${ep.no}`).join('#') }] };
}
async function mediaWorks(url) {
  try {
    const r = await req({ method: 'GET', url, headers: { 'User-Agent': ua, Referer: host + '/home', Range: 'bytes=0-1023' }, timeout: 18000, responseType: 'arraybuffer', validateStatus: () => true });
    if (r.status < 200 || r.status >= 300) return false;
    const bytes = Buffer.from(r.data);
    return bytes.subarray(0, 16).toString().includes('#EXTM3U') || bytes.subarray(4, 12).toString().includes('ftyp');
  } catch { return false; }
}
async function play(id) {
  const match = /^huangdou:\/\/([A-Za-z0-9_-]{1,100})\/(\d+)$/.exec(id);
  if (!match) throw new Error('黄豆分集 ID 无效');
  const data = await call('/drama/play', { id: match[1], seq: match[2] });
  let url = data.m3u8 || data.url || data.play_url || data.playUrl || '';
  const preview = data.is_preview || data.isPreview || (url && url === (data.preview_m3u8 || data.preview_url));
  if (preview || !url) url = `${host}/api/drama/hls/${encodeURIComponent(match[1])}/${match[2]}/play.m3u8?line=free`;
  if (!/^https?:\/\//.test(url)) url = new URL(url, host).href;
  if (!await mediaWorks(url)) throw new Error('黄豆正片不可读');
  return { parse: 0, url, header: { 'User-Agent': ua, Referer: host + '/home' } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'lee_zhenguo_huangdou', name: '真果鉴 · 黄豆', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [{ type_id: 'all', type_name: '全部' }], list: await listing(1) }));
      fastify.post('/category', async (request) => paged(await listing(pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd), pageOf(request)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
