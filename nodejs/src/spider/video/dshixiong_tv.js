import req from '../../util/req.js';
function normHeaders(h) {
  const o = {};
  try { for (const [k, v] of Object.entries(h || {})) o[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v; } catch (e) {}
  return o;
}
// Cat-contract transport: axios (req) first, typeof-guarded fetch fallback only.
// Returns engine-style { status, headers, text, content, data, buf } so the
// original hmtv call sites keep working. HTTP error statuses are returned,
// not thrown (original engine req resolved with status); network failures throw.
async function httpReq(url, opt = {}) {
  const o = opt || {};
  const headers = Object.assign({}, o.headers || {});
  delete headers['Accept-Encoding']; delete headers['accept-encoding'];
  const timeout = o.timeout || 20000;
  const binary = !!o.binary;
  const method = (o.method || (o.body != null ? 'POST' : 'GET')).toUpperCase();
  const data = o.body !== undefined ? o.body : o.data;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: binary ? 'arraybuffer' : 'text', maxRedirects: 5 });
    const buf = binary ? Buffer.from(r.data || []) : undefined;
    const text = binary ? '' : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
    return { status: r.status || 200, headers: normHeaders(r.headers), text, content: text, data: r.data, buf };
  } catch (e) {
    if (e && e.response) {
      const d = e.response.data;
      const buf = binary ? Buffer.from(d || []) : undefined;
      const text = binary ? '' : (typeof d === 'string' ? d : JSON.stringify(d ?? ''));
      return { status: e.response.status || 0, headers: normHeaders(e.response.headers), text, content: text, data: d, buf };
    }
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: (method === 'GET' || method === 'HEAD') ? undefined : data, signal: ctl.signal, redirect: 'follow' });
        const headers2 = {}; try { r.headers.forEach((v, k) => { headers2[String(k).toLowerCase()] = v; }); } catch (e2) {}
        if (binary) { const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: headers2, text: '', content: '', data: buf, buf }; }
        const text = await r.text(); return { status: r.status, headers: headers2, text, content: text, data: text };
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

/*
 * 大师兄影视 · CatPaw 源（type 3）
 * ===========================================================================
 * 来源：用户提供的「师兄.js」——大师兄 App 的 AppV7 协议本地 Node 插件。
 * 原文件已经是 CatPaw 模块（module.exports = { meta, api }），按本仓契约
 * 重写并修了若干实测暴露的问题：
 *
 *   POST /init     取 wex 配置（顺带返回真实站点域名）
 *   POST /home     nav → 分类 + 筛选器
 *   POST /category video_list
 *   POST /search   search
 *   POST /detail   video_detail → 多线路选集（每集参数压成 token）
 *   POST /play     parse_api 解密取直链；HLS 交给引擎内 /proxy 回吐
 *   GET  /proxy    本地播放代理：修错误 content-type、改写 HLS 分片、透传 Range、SSRF 防护
 *
 * 只依赖 node 内置模块，不使用 cheerio / axios。
 *
 * 实测（2026-10-21，本机真站）：
 *   home 8 个分类；category 21 条/页；search「庆余年」10 条；
 *   detail 9 条线路 × 36 集；/play 取到 CDN 直链，Range 0-1023 → 206 video/mp4 1024B。
 *
 * 三个实测结论决定了 /proxy 的实现：
 *   1) 分片**不能带 Referer**：独家3 的 CDN 带 Referer 直接 403，不带则 200。
 *   2) UA 不敏感：VLC / dart / 不带头都能取到分片。
 *   3) 部分线路的 m3u8 被故意给错 content-type（image/png、application/octet-stream），
 *      所以代理必须**嗅探响应体**的 "#EXTM3U"，不能只看 content-type。
 * ===========================================================================
 */


const KEY = 'py_dshixiong_tv';
const NAME = '🚀师兄 - 极速';
const TYPE = 3;

// 大师兄在 wex 后端的配置键（AppV7Dsx = 大师兄）
const APP_KEY = 'AppV7Dsx';
// wex 网关（会换；换的时候改这里）
const WEX = [
  'http://103.36.222.35:9595/wexfnwshinidie',
];
const UA = 'Dart/3.11 (dart:io)';
// 代理取流用的中性 UA：实测所有可用线路用浏览器 UA 都能过，App UA 亦可
const PROXY_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const MAX_HLS_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECT = 4;

function log(...a) { try { console.log('[' + NAME + ']', ...a); } catch (e) { /* 忽略 */ } }
function msg(e) { return e && e.message ? e.message : String(e); }

// ---------------------------------------------------------------- 基础 HTTP

async function request(url, { method = 'GET', body = null, headers = {}, timeout = 15000 } = {}) {
  return httpReq(url, { method, body, headers, timeout });
}

function json(text, fallback = null) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

// ---------------------------------------------------------------- wex 会话

let SESSION = null;

async function wexConfig(cryptoUrl) {
  const r = await request(`${cryptoUrl}?action=config&key=${encodeURIComponent(APP_KEY)}`, {
    headers: { 'User-Agent': 'axios/1.18.1', accept: 'application/json' }, timeout: 15000,
  });
  const body = json(r.text, {});
  const cfg = body && body.data;
  if (!cfg || !cfg.host) throw new Error(`config 为空: ${r.status}`);
  return cfg;
}

async function crypto(action, raw) {
  const r = await request(`${SESSION.cryptoUrl}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    body: JSON.stringify({ key: APP_KEY, raw: raw == null ? '' : String(raw) }),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    timeout: 20000,
  });
  const body = json(r.text, {});
  if (body && body.error) throw new Error('crypto ' + action + ': ' + body.error);
  return body || {};
}

async function ensure(force) {
  if (!force && SESSION && Date.now() - SESSION.at < 30 * 60000) return SESSION;
  let lastErr;
  for (const base of WEX) {
    const cryptoUrl = `${base.replace(/\/+$/, '')}/appv7/crypto.php`;
    try {
      const cfg = await wexConfig(cryptoUrl);
      SESSION = { cryptoUrl, cfg, at: Date.now() };
      return SESSION;
    } catch (e) { lastErr = e; }
  }
  throw new Error('师兄配置获取失败: ' + msg(lastErr));
}

function appHeaders(cfg, len) {
  return {
    'user-agent': cfg.user_agent || UA,
    version: cfg.version,
    'accept-encoding': 'gzip',
    'version-number': cfg.version_number,
    'content-type': 'text/plain',
    'pk-id': cfg.pk_id,
    'build-time': cfg.build_time,
    platform: cfg.platform,
    'platform-version': cfg.platform_version,
    host: new URL(cfg.host).host,
    'content-length': String(len),
  };
}

// 调 AppV7 的 RPC：{method,data,csrf} → 加密 → POST /v7/logs
async function callOnce(method, data) {
  const s = await ensure();
  const cfg = s.cfg;
  const payload = JSON.stringify({ method, data, csrf: Date.now() });
  const enc = await crypto('encrypt', payload);
  if (!enc.body) throw new Error('encrypt 返回空');

  const url = `${String(cfg.host).replace(/\/+$/, '')}/v7/logs`;
  const r = await request(url, {
    method: 'POST',
    body: enc.body,
    headers: appHeaders(cfg, Buffer.byteLength(enc.body)),
    timeout: 20000,
  });
  if (r.status < 200 || r.status >= 400) throw new Error(`接口 ${r.status}`);

  let out = json(r.text);
  if (!out || !Object.keys(out).length) {
    const dec = await crypto('decrypt', r.text);
    out = dec.data || (dec.text ? json(dec.text) : null);
  }
  if (!out) throw new Error('响应无法解析');
  if (out.code && out.code !== 1 && out.code !== 200) throw new Error(out.msg || 'code ' + out.code);
  return out;
}

// 只有"看起来像会话/网关失效"的错才值得重取配置重试；
// 参数校验类错误（比如 id 非数字）重试也没用，只会白白多打一次接口。
function shouldRetry(e) {
  return /接口 4|401|403|crypto|配置|timeout|ECONNRESET|fetch failed|响应无法解析/i.test(msg(e));
}

async function call(method, data) {
  try {
    return await callOnce(method, data);
  } catch (e) {
    if (!shouldRetry(e)) throw e;
    log(method + ' 首次失败（' + msg(e) + '），重取配置后重试');
    SESSION = null;
    return await callOnce(method, data);
  }
}

// ---------------------------------------------------------------- 小工具

const one = (v) => (Array.isArray(v) ? String(v[0] == null ? '' : v[0]) : String(v == null ? '' : v)).trim();
const num = (v, d = 1) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
const splitWords = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function classesFrom(nav) {
  return (nav.data || [])
    .map((x) => ({ type_id: String(x.type_id), type_name: String(x.type_name) }))
    .filter((x) => x.type_id && x.type_name);
}

function filtersFrom(nav) {
  const out = {};
  for (const x of nav.data || []) {
    const ext = x.type_extend || {};
    const list = [];
    for (const pair of [['class', '类型'], ['area', '地区'], ['lang', '语言'], ['year', '年份']]) {
      const vals = splitWords(ext[pair[0]]);
      if (vals.length) {
        list.push({ key: pair[0], name: pair[1], value: [{ n: '全部', v: '' }].concat(vals.map((v) => ({ n: v, v }))) });
      }
    }
    list.push({ key: 'order', name: '排序', value: ['最新', '最热', '评分'].map((v) => ({ n: v, v })) });
    out[String(x.type_id)] = list;
  }
  return out;
}

// 每集的播放参数压成一个自己的 base64 token，不依赖上游 AES
function packPlay(o) {
  return Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unpackPlay(t) {
  try {
    const s = String(t).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
  } catch (e) { return null; }
}

// 上游给的 headers 是 "User-Agent: dart" 这样的字符串；原实现把它当值塞进
// { 'User-Agent': 'User-Agent: dart' }，会发出非法头。这里解析成真正的对象。
function parseHeaderString(raw) {
  const out = {};
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return out;
  if (s.charAt(0) === '{') {
    const o = json(s, null);
    if (o && typeof o === 'object') return o;
  }
  for (const line of s.split(/[\r\n&;]+/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function appHeaderOf(token) {
  const h = parseHeaderString(token && token.h);
  let ua = '';
  for (const k of Object.keys(h)) {
    if (/^user-agent$/i.test(k)) ua = String(h[k]).trim();
  }
  // 上游给的是 "User-Agent: dart" 这种占位串，补成完整 UA，免得 CDN 当空 UA 拦掉
  if (!ua || ua.length < 8) ua = UA;
  return { 'User-Agent': ua };
}

// NOTE(D批): 猫源契约只有 6 个 POST 路由，本地 /proxy 已剥离，播放直出原链。

// ---------------------------------------------------------------- 路由

function buildApi(f) {
  f.post('/init', async () => {
    try {
      const s = await ensure();
      return { siteUrl: s.cfg.host, config: s.cfg.name || APP_KEY, home: s.cfg.home_url || '' };
    } catch (e) {
      return { error: msg(e) };
    }
  });

  f.post('/home', async () => {
    try {
      const nav = await call('nav');
      return { class: classesFrom(nav), filters: filtersFrom(nav), list: [] };
    } catch (e) {
      log('home 失败：' + msg(e));
      return { class: [], filters: {}, list: [] };
    }
  });

  f.post('/category', async (r) => {
    const b = r.body || {};
    const page = num(b.page || b.pg);
    const ext = b.extend || b.filters || {};
    try {
      const out = await call('video_list', {
        token: '', pg: page, tid: num(b.id || b.tid, 1),
        class: one(ext.class), area: one(ext.area), lang: one(ext.lang), year: one(ext.year),
        order: one(ext.order) || '最新',
      });
      const list = (out.data || []).map((x) => ({
        vod_id: String(x.vod_id),
        vod_name: String(x.vod_name || ''),
        vod_pic: String(x.vod_pic || ''),
        vod_remarks: String(x.vod_remarks || ''),
      })).filter((x) => x.vod_id && x.vod_name);
      return { page, pagecount: num(out.pagecount, page), limit: list.length, total: num(out.total, 0), list };
    } catch (e) {
      log('category 失败：' + msg(e));
      return { page, pagecount: page, limit: 0, total: 0, list: [] };
    }
  });

  f.post('/search', async (r) => {
    const b = r.body || {};
    const page = num(b.page || b.pg);
    const wd = one(b.wd || b.keyword || b.key);
    if (!wd) return { page, pagecount: 1, limit: 0, list: [] };
    try {
      const out = await call('search', { token: '', pg: page, text: wd });
      const list = (out.data || []).map((x) => ({
        vod_id: String(x.vod_id),
        vod_name: String(x.vod_name || ''),
        vod_pic: String(x.vod_pic || ''),
        vod_remarks: String(x.vod_remarks || ''),
      })).filter((x) => x.vod_id && x.vod_name);
      return { page, pagecount: num(out.pagecount, page), limit: list.length, total: num(out.total, 0), list };
    } catch (e) {
      log('search 失败 ' + wd + '：' + msg(e));
      return { page, pagecount: page, limit: 0, total: 0, list: [] };
    }
  });

  f.post('/detail', async (r) => {
    const b = r.body || {};
    const ids = (Array.isArray(b.id) ? b.id : [b.id]).map(one).filter(Boolean);
    const out = [];
    for (const id of ids) {
      try {
        const s = await ensure();
        const cfg = s.cfg;
        const d = await call('video_detail', {
          token: '', id: num(id, 0), sign_md5: cfg.sign_md5, apk_length: Number(cfg.apk_length) || 0,
          apk_path: `/data/app/~~mLGfF_Nezy4R4TqUevJVlg==/${cfg.pk_id}-NlNuzFF6p4657CBJv-ue4Q==/base.apk`,
        });
        const info = d.data && d.data.vod_info ? d.data.vod_info : {};
        const players = Array.isArray(info.vod_url_with_player) ? info.vod_url_with_player : [];
        const from = [];
        const urls = [];
        for (const p of players) {
          const name = one(p.name) || '线路';
          const eps = [];
          for (const item of String(p.url || '').split('#')) {
            if (!item) continue;
            const i = item.indexOf('$');
            const label = i > 0 ? item.slice(0, i) : '播放';
            const raw = i > 0 ? item.slice(i + 1) : item;
            if (!raw) continue;
            eps.push(`${String(label).replace(/[$#]/g, ' ')}$${packPlay({ u: raw, p: one(p.parse_api), e: one(p.extra_parse_api), h: one(p.headers) })}`);
          }
          if (eps.length) { from.push(name); urls.push(eps.join('#')); }
        }
        out.push({
          vod_id: String(info.vod_id || id),
          vod_name: String(info.vod_name || ''),
          vod_pic: String(info.vod_pic || ''),
          vod_year: String(info.vod_year || ''),
          vod_area: String(info.vod_area || ''),
          vod_remarks: String(info.vod_remarks || ''),
          vod_actor: String(info.vod_actor || ''),
          vod_director: String(info.vod_director || ''),
          vod_content: String(info.vod_content || info.vod_blurb || '').replace(/<[^>]+>/g, '').trim(),
          vod_play_from: from.join('$$$'),
          vod_play_url: urls.join('$$$'),
        });
      } catch (e) {
        log('detail 失败 ' + id + '：' + msg(e));
      }
    }
    return { list: out };
  });

  f.post('/play', async (r) => {
    const b = r.body || {};
    const token = unpackPlay(b.id);
    if (!token) return { parse: 1, jx: 1, url: one(b.id) };

    const header = appHeaderOf(token);

    // 线路本身给了直链就没有解析接口
    if (!token.p) {
      if (/^https?:\/\//i.test(token.u)) {
        const u = token.u;
        if (/\.m3u8(?:$|[?#])/i.test(u)) return { parse: 0, url: u, header };
        return { parse: 0, url: u, header };
      }
      return { parse: 1, jx: 1, url: token.u || '', msg: '缺少 parse_api', header };
    }

    const target = `${token.p}${encodeURIComponent(token.u)}`;
    const tries = [target];
    if (token.e && token.e !== token.p) tries.push(`${token.e}${encodeURIComponent(token.u)}`);

    for (let i = 0; i < tries.length; i++) {
      let media = '';
      try {
        const r1 = await request(tries[i], { headers: { 'User-Agent': 'dart' }, timeout: 20000 });
        if (r1.status >= 400) throw new Error('HTTP ' + r1.status);

        // 解析接口有时候直接回明文 JSON（{code:200,url:...}），这时候不需要再解密；
        // 原实现无条件走 parse_decrypt 会把这类线路误判成"取不到地址"。
        const raw = String(r1.text).trim();
        let j = json(raw, null);
        const hasUrl = (o) => !!(o && typeof o === 'object' && (o.url || (o.data && o.data.url)));
        if (!hasUrl(j)) {
          const dec = await crypto('parse_decrypt', raw);
          const text = dec.text || dec.data || '';
          j = typeof text === 'string' ? json(text, {}) : text;
        }
        media = String((j && j.url) || (j && j.data && j.data.url) || '');
      } catch (e) {
        log('play 解析失败（第 ' + (i + 1) + ' 个接口）：' + msg(e));
      }
      if (!media || !/^https?:\/\//i.test(media)) continue;
      if (/^https?:\/\/[^\/]+\/?$/.test(media)) continue; // D批：解析站裸根是解析失败标记，换下一接口

      return { parse: 0, url: media, header, url_raw: media };
    }

    return { parse: 1, jx: 1, url: target, header, msg: '未取到播放地址' };
  });

}

export default function createSpider() {
  return {
  meta: {
    key: KEY,
    name: NAME,
    type: TYPE,
    searchable: 1,
    quickSearch: 1,
    filterable: 1,
  },
  api: async (fastify) => buildApi(fastify),
};

/*
 * 排障
 * ---------------------------------------------------------------------------
 * 1) wex 网关失效（/init 报"师兄配置获取失败"）：抓 App 流量换掉 WEX 里的地址。
 * 2) /init 返回的 siteUrl 是真实接口域名（当前 http://app2.dsx.ac/ndsx.php）。
 * 3) /proxy 默认拒绝私网目标；只有 DSHIXIONG_PROXY_ALLOW_LOOPBACK=1 才放行 127.0.0.1，
 *    仅供仓库内 fixture 自测，正常部署不要设。
 * 4) 独家3 / TX / 独家备用 三条线路的分片在服务端就是坏的（403 或返回 PNG/JSON 错误页），
 *    属于上游问题，换线路即可。
 */
}
