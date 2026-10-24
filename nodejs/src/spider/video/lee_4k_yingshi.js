import req from '../../util/req.js';
import crypto from 'crypto';
// 4K影视（LeeCatPaw lee_4k_yingshi 移植）：直连站方 API（默认 43.248.2.106:9001，启动时可发现新域）；
// RSA 握手 + AES-128-CBC 会话，与 bundle 原实现一致。会话缓存在模块级（20 小时）。
const defaultHost = 'http://43.248.2.106:9001';
const ua = 'okhttp/3.12.1';
const device = 'a1b2c3d4e5f67890';
const sessionTtl = 20 * 3600 * 1000;
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (body) => Math.max(1, Number.parseInt(body?.page, 10) || 1);
async function requestText(url, params, headers = {}) {
  const body = params === undefined ? undefined : new URLSearchParams(params).toString();
  const method = body === undefined ? 'GET' : 'POST';
  const h = { 'User-Agent': ua, 'app-platform': 'android', ...headers,
    ...(body === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) };
  try {
    const r = await req({ method, url, headers: h, data: body, timeout: 15000, responseType: 'text', maxRedirects: 5 });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { method, headers: h, body, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
let session;
async function client() {
  if (session && session.expires > Date.now()) return session;
  let host = defaultHost;
  try {
    const raw = (await requestText(defaultHost)).trim();
    const discovered = raw.startsWith('http') ? raw.split(/\s/)[0] : JSON.parse(raw).domain;
    if (discovered?.startsWith('http')) host = discovered.replace(/\/$/, '');
  } catch { /* use default */ }
  const pub = JSON.parse(await requestText(`${host}/api.php/qijiappapi.index/getPublicKey`));
  const publicKey = String(pub.data?.public_key || '').replace(/\\\//g, '/');
  const secret = crypto.randomBytes(64).toString('hex');
  const encrypted = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(secret));
  const result = JSON.parse(await requestText(`${host}/api.php/qijiappapi.index/handshake`, {
    encrypted_key: encrypted.toString('base64'), device_id: device, timestamp: Math.floor(Date.now() / 1000),
  }));
  if (result.code !== 1 || !result.data?.session_id) throw new Error('4K影视 handshake failed');
  session = { host, sid: result.data.session_id, key: Buffer.from(secret.slice(0, 32), 'hex'),
    iv: Buffer.from(secret.slice(32, 64), 'hex'), expires: Date.now() + sessionTtl };
  return session;
}
async function call(method, params = {}) {
  const c = await client();
  const result = JSON.parse(await requestText(`${c.host}/api.php/qijiappapi.index/${method}`, params,
    { 'app-session-id': c.sid }));
  if (result.code !== 1) return {};
  if (typeof result.data !== 'string') return result.data || {};
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', c.key, c.iv);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(result.data, 'base64')),
      decipher.final()]).toString('utf8'));
  } catch { return {}; }
}
const card = (item) => ({ vod_id: String(item.vod_id || ''), vod_name: item.vod_name || '',
  vod_pic: String(item.vod_pic || '').replace(/\\\//g, '/'), vod_remarks: item.vod_remarks || '' });
const classes = new Map();
const filters = {};
let homeVideos = [];
async function warmup() {
  const data = await call('initV119', { device_id: device, app_version: '6.0.4' });
  classes.clear();
  homeVideos = [];
  for (const type of data.type_list || []) {
    const id = String(type.type_id);
    classes.set(id, String(type.type_name || id));
    homeVideos.push(...(type.recommend_list || []).map(card));
    let ext;
    try { ext = JSON.parse(type.type_extend || '{}'); } catch { ext = {}; }
    const choices = [];
    for (const [key, name] of [['class', '类型'], ['area', '地区'], ['year', '年份'], ['lang', '语言']]) {
      const values = String(ext[key] || '').split(',').map((v) => v.trim()).filter(Boolean);
      if (values.length) choices.push({ key, name, value: [{ n: '全部', v: '' },
        ...values.map((v) => ({ n: v, v }))] });
    }
    if (choices.length) filters[id] = choices;
  }
  if (!classes.size) for (const [id, name] of [['0', '全部'], ['1', '电视剧'], ['2', '动漫'],
    ['3', '电影'], ['4', '综艺'], ['5', '短剧'], ['21', '直播'], ['22', '少儿']]) classes.set(id, name);
  homeVideos = [...new Map(homeVideos.map((vod) => [vod.vod_id, vod])).values()].slice(0, 60);
}
function listing(data, page) {
  const list = (data?.recommend_list || []).map(card);
  return { list, page, pagecount: page + Number(list.length >= 30), limit: 30, total: list.length };
}
export default function createSpider() {
  return {
  meta: { key: 'lee_4k_yingshi', name: '4K影视', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
  api: async function (fastify) {
    fastify.post('/init', async () => { await warmup(); return {}; });
    fastify.post('/home', async () => {
      if (!classes.size) await warmup();
      return { class: [...classes].map(([type_id, type_name]) => ({ type_id, type_name })),
        filters, list: homeVideos };
    });
    fastify.post('/category', async (request) => {
      const ext = request.body?.extend || {}, page = pageOf(request.body);
      return listing(await call('typeFilterVodList', {
        type_id: request.body?.id || '', page, area: ext.area || '', year: ext.year || '',
        lang: ext.lang || '', class: ext.class || '', sort: ext.sort || '',
      }), page);
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!/^\d+$/.test(id)) return { list: [] };
      const data = await call('vodDetail3', { vod_id: id }), vod = data.vod || {};
      const from = [], groups = [];
      for (const play of data.vod_play_list || []) {
        const info = play.player_info || {}, name = info.show || play.from || '线路';
        let episodes = play.urls || [];
        if (typeof episodes === 'string') {
          try { episodes = JSON.parse(episodes); } catch { episodes = []; }
        }
        if (!Array.isArray(episodes) || !episodes.length) continue;
        from.push(name);
        groups.push(episodes.map((episode, index) => {
          const payload = episode.url?.startsWith('http')
            ? { u: episode.url, t: episode.token || '', p: episode.parse_api_url || '',
              ua: info.user_agent || ua, h: info.headers || {} }
            : { p: info.parse || episode.parse_api_url || '', t: String(info.player_parse_type || '1'),
              u: episode.url || '', tok: episode.token || '', ua: info.user_agent || ua,
              h: info.headers || {} };
          const prefix = episode.url?.startsWith('http') ? 'D|' : 'P|';
          return `${String(episode.name || index + 1).replace(/[$#]/g, '_')}$${prefix}${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
        }).join('#'));
      }
      return { list: [{ ...card(vod), type_name: String(vod.vod_class || '').split(',')[0],
        vod_year: vod.vod_year || '', vod_area: vod.vod_area || '', vod_actor: vod.vod_actor || '',
        vod_director: vod.vod_director || '', vod_content: String(vod.vod_blurb || '').replace(/\\n/g, '\n'),
        vod_play_from: from.join('$$$'), vod_play_url: groups.join('$$$') }] };
    });
    fastify.post('/search', async (request) => {
      const keyword = String(request.body?.wd || '').trim(), page = pageOf(request.body);
      if (!keyword) return { list: [], page, pagecount: page, limit: 30, total: 0 };
      const result = await call('searchList', { wd: keyword, page });
      let list = (result.search_list || []).filter((item) =>
        `${item.vod_name || ''} ${item.vod_actor || ''}`.toLowerCase().includes(keyword.toLowerCase())).map(card);
      if (list.length < 5) {
        const fallback = await Promise.allSettled(['1', '2', '3', '4', '5'].map((id) =>
          call('typeFilterVodList', { type_id: id, page: 1, area: '', year: '', lang: '', class: '', sort: '' })));
        for (const batch of fallback) if (batch.status === 'fulfilled') list.push(...(batch.value.recommend_list || [])
          .filter((item) => `${item.vod_name || ''} ${item.vod_actor || ''}`.toLowerCase().includes(keyword.toLowerCase())).map(card));
      }
      list = [...new Map(list.map((item) => [item.vod_id, item])).values()].slice(0, 30);
      return { list, page, pagecount: page + Number(list.length >= 30), limit: 30, total: list.length };
    });
    fastify.post('/play', async (request) => {
      const id = one(request.body?.id);
      if (!id.startsWith('D|') && !id.startsWith('P|')) return { parse: 0, url: id, header: { 'User-Agent': ua } };
      let info;
      try { info = JSON.parse(Buffer.from(id.slice(2), 'base64').toString('utf8')); }
      catch { return { parse: 0, url: '', msg: '参数错误' }; }
      const headers = { 'User-Agent': info.ua || ua, ...(info.h || {}) };
      if (id.startsWith('D|')) return { parse: 0, url: info.u || '', header: headers };
      let url = '';
      if (String(info.t) === '2' && info.p) {
        try {
          const parsed = JSON.parse(await requestText(`${info.p}${info.u}${info.tok ? `&token=${encodeURIComponent(info.tok)}` : ''}`));
          url = parsed.url || '';
        } catch { url = ''; }
      } else {
        try {
          const key = Buffer.from('FTgP4Gq8zPiqbt7M');
          const cipher = crypto.createCipheriv('aes-128-cbc', key, key);
          const encoded = Buffer.concat([cipher.update(String(info.u || ''), 'utf8'), cipher.final()]).toString('base64');
          const parsed = await call('vodParse', { url: encoded, parse_api: info.p || '', token: info.tok || '',
            player_parse_type: info.t || '1', base_api: `${info.p || ''}${info.u || ''}` });
          url = parsed.url || '';
          if (!url && typeof parsed.json === 'string') try { url = JSON.parse(parsed.json).url || ''; } catch { /* invalid parse */ }
        } catch { url = ''; }
      }
      return { parse: 0, url: String(url).replace(/\\\//g, '/'), header: headers,
        ...(url ? {} : { msg: '解析失败，请换线路' }) };
    });
  }
};
}
