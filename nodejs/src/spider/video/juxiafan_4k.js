import req from '../../util/req.js';
import crypto from 'crypto';
// 剧下饭4K（LeeCatPaw lee_juxiafan4k 移植，替换 mycat 原 juxiafan_4k；key/名/meta 不变，只换实现）。
// 直连剧下饭镜像站群；AES-256-ECB datasign 与 bundle 原实现一致。
const hosts = ['http://manian.juxiafan.com', 'http://195.225.24.128:6213', 'http://jugaoqing.com',
  'http://jumianfei.com', 'http://juyongjiu.com', 'http://kuailezhuiju2.com',
  'http://zhuiju666.com', 'http://194.147.100.155:7744'];
const ua = 'okhttp/4.12.0', key = Buffer.from('kZ6fT8oF6oM8eX6lF7eH2rJ3pW7gW0kC');
const direct = (value) => /^https?:\/\//i.test(String(value || ''));
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (body) => Math.max(1, Number.parseInt(body?.page, 10) || 1);
async function requestJson(url, body, contentType) {
  const method = body === undefined ? 'GET' : 'POST';
  const headers = { 'User-Agent': ua, ...(contentType ? { 'Content-Type': contentType } : {}) };
  try {
    const r = await req({ method, url, headers, data: body, timeout: 12000, responseType: 'text', maxRedirects: 5 });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    const status = r.status;
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    return JSON.parse(text);
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 12000);
      try {
        const r = await fetch(url, { method, headers, body, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.json();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
async function post(path, params = {}, form = false) {
  const values = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
  const sorted = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
  const concat = sorted.map(([k, v]) => `${k}=${form ? encodeURIComponent(String(v)).replace(/%20/g, '+') : v}`).join('&');
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  const signature = Buffer.concat([cipher.update(concat, 'utf8'), cipher.final()]).toString('base64');
  const body = form ? new URLSearchParams({ ...values, datasign: signature }).toString()
    : JSON.stringify({ ...values, datasign: signature });
  let last;
  for (const host of hosts) {
    try { return await requestJson(`${host}${path}`, body, form ? 'application/x-www-form-urlencoded'
      : 'application/json;charset=UTF-8'); } catch (error) { last = error; }
  }
  throw last || new Error('No site mirror available');
}
const get = async (path) => {
  let last;
  for (const host of hosts) {
    try { return await requestJson(path.startsWith('http') ? path : `${host}${path}`); }
    catch (error) { last = error; if (path.startsWith('http')) break; }
  }
  throw last || new Error('No site mirror available');
};
function listing(response, page, newest = false) {
  const data = response.data || {};
  const list = (data.list || []).filter((item) => item.id).map((item) => ({ vod_id: String(item.id),
    vod_name: item.name || '', vod_pic: item.videoPic || '', vod_remarks: item.remarks || '' }));
  if (newest) list.sort((a, b) => Number(b.vod_id) - Number(a.vod_id));
  return { list, page, pagecount: Math.max(page, Number(data.totalPage) || 1),
    limit: Number(data.limit) || 20, total: Number(data.totalCount) || 0 };
}
async function detail(id) {
  return (await post('/api/v1/video/videoDetails', { id }, true)).data || {};
}
export default function createSpider() {
  return {
  meta: { key: 'py_juxiafan_4k', name: '🍚剧饭 - 4K', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => {
      let response;
      for (const mirror of hosts) {
        try { response = await requestJson(`${mirror}/api/v1/video/classifies`, '', 'application/x-protobuf'); break; }
        catch { /* try another mirror */ }
      }
      response ||= {};
      const classes = (response.data || []).filter((item) => item.id && item.name)
        .map((item) => ({ type_id: String(item.id), type_name: item.name }))
        .sort((a, b) => Number(a.type_id) - Number(b.type_id));
      if (!classes.some((item) => item.type_id === '22023')) classes.push({ type_id: '22023', type_name: '直播' });
      return { class: classes, filters: {}, list: [] };
    });
    fastify.post('/category', async (request) => {
      const id = Number(request.body?.id) || 0, page = pageOf(request.body);
      if (id === 22023) {
        const data = (await get('/api/v1/video/liveVideo')).data || {};
        return listing({ data }, 1);
      }
      let response = listing(await post('/api/v1/video/index', { pageNum: page, typeId: id }), page);
      if (response.list.length < 10) response = listing(await post('/api/v1/video/search',
        { keyword: '', typeId: id, pageNum: page }), page, true);
      return response;
    });
    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!id) return { list: [] };
      const data = await detail(id), from = [], groups = [], seen = new Map();
      for (const [sourceIndex, source] of (data.playerSource || []).entries()) {
        const episodes = source.episodes || [];
        if (!episodes.length) continue;
        const name = source.sourceName || '剧下饭', count = (seen.get(name) || 0) + 1;
        seen.set(name, count);
        from.push(count > 1 ? `${name}${count}` : name);
        groups.push(episodes.map((episode, index) =>
          `${String(episode.episodeName || `第${index + 1}集`).replace(/[$#]/g, '_')}$${id}@@${sourceIndex}_${index + 1}`).join('#'));
      }
      if (!groups.length) return { list: [] };
      return { list: [{ vod_id: String(data.id || id), vod_name: data.name || '', vod_pic: data.videoPic || '',
        vod_actor: data.actor || '', vod_director: data.director || '', vod_remarks: data.remarks || '',
        vod_content: data.content || '', vod_year: data.year || '', vod_area: data.area || '',
        vod_play_from: from.join('$$$'), vod_play_url: groups.join('$$$') }] };
    });
    fastify.post('/search', async (request) => {
      const page = pageOf(request.body), keyword = decodeURIComponent(String(request.body?.wd || '').trim());
      return listing(await post('/api/v1/video/search', { keyword, pageNum: page }), page, true);
    });
    fastify.post('/play', async (request) => {
      const id = one(request.body?.id), exact = /^(.*)@@(\d+)_(\d+)$/.exec(id);
      const match = exact || /^(.*)_(\d+)$/.exec(id), header = { 'User-Agent': ua };
      if (!match) return { parse: 0, url: direct(id) ? id : '', header,
        msg: direct(id) ? undefined : '剧下饭未返回可播放地址' };
      const data = await detail(match[1]);
      const selected = String(request.body?.flag || '');
      const sources = exact ? [data.playerSource?.[Number(exact[2])]].filter(Boolean)
        : [...(data.playerSource || [])].sort((a, b) =>
          Number(b.sourceName === selected) - Number(a.sourceName === selected));
      for (const source of sources) {
        const episode = source.episodes?.[Number(exact ? exact[3] : match[2]) - 1];
        if (!episode) continue;
        const code = String(episode.playerCode || '');
        if (source.parseUrl && code) {
          const parsed = await get(`${source.parseUrl}${code}`).catch(() => ({}));
          if (direct(parsed.url)) return { parse: 0, url: parsed.url, header };
        }
        if (code && !code.startsWith('http')) {
          const parsed = await post('/api/v1/player/analysisUrl',
            { from: source.sourceCode || '', code }, true).catch(() => ({}));
          const value = typeof parsed.data === 'object' ? parsed.data?.url : parsed.data;
          const url = String(value || '');
          if (direct(url)) {
            if (source.sourceCode === 'huya') header.Referer = 'https://www.huya.com/';
            return { parse: 0, url, header };
          }
        }
        if (direct(code)) return { parse: 0, url: code, header };
      }
      return { parse: 0, url: '', header, msg: '剧下饭解析未返回可播放地址' };
    });
  }
};
}
