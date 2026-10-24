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

// 蒙太奇|秒播 · AppV7 协议 · 滴源本地 Node 插件（无第三方依赖）
// 协议链路：crypto.php?action=config 取配置 → crypto.php?action=encrypt 加密请求
//          → POST {host}/v7/logs 取数据（明文/密文自适应）→ 播放走 parse_api + parse_decrypt

const APP_KEY = 'AppV7Mtq';                 // 师兄在 wex 后端的配置键
// wex 网关（会换，换的时候改这里；脚本里能拿到 3 个候选就依次试）
const WEX = [
  'http://103.36.222.35:9595/wexfnwshinidie',
];
const UA = 'Dart/3.11 (dart:io)';

// ---------- 基础 HTTP ----------
async function request(url, { method = 'GET', body = null, headers = {}, timeout = 15000 } = {}) {
  return httpReq(url, { method, body, headers, timeout });
}

function json(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

// ---------- wex 会话（config / 加解密） ----------
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

async function ensure() {
  if (SESSION && Date.now() - SESSION.at < 30 * 60000) return SESSION;
  let lastErr;
  for (const base of WEX) {
    const cryptoUrl = `${base.replace(/\/+$/, '')}/appv7/crypto.php`;
    try {
      const cfg = await wexConfig(cryptoUrl);
      SESSION = { cryptoUrl, cfg, at: Date.now() };
      return SESSION;
    } catch (e) { lastErr = e; }
  }
  throw new Error('师兄配置获取失败: ' + (lastErr && lastErr.message));
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
async function call(method, data = { token: '' }) {
  const { cfg } = await ensure();
  const payload = JSON.stringify({ method, data, csrf: Date.now() });
  const enc = await crypto('encrypt', payload);
  if (!enc.body) throw new Error('encrypt 返回空');
  const url = `${String(cfg.host).replace(/\/+$/, '')}/v7/logs`;
  const r = await request(url, { method: 'POST', body: enc.body, headers: appHeaders(cfg, Buffer.byteLength(enc.body)), timeout: 20000 });
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

// ---------- 小工具 ----------
const one = (v) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();
const num = (v, d = 1) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
const splitWords = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function classesFrom(nav) {
  return (nav.data || []).map((x) => ({ type_id: String(x.type_id), type_name: String(x.type_name) })).filter((x) => x.type_id && x.type_name);
}

function filtersFrom(nav) {
  const out = {};
  for (const x of nav.data || []) {
    const ext = x.type_extend || {};
    const list = [];
    for (const [k, title] of [['class', '类型'], ['area', '地区'], ['lang', '语言'], ['year', '年份']]) {
      const vals = splitWords(ext[k]);
      if (vals.length) list.push({ key: k, name: title, value: [{ n: '全部', v: '' }, ...vals.map((v) => ({ n: v, v }))] });
    }
    list.push({ key: 'order', name: '排序', value: ['最新', '最热', '评分'].map((v) => ({ n: v, v })) });
    out[String(x.type_id)] = list;
  }
  return out;
}

// 详情里的每一集的播放参数，压成一个 token（用自己的 base64，不依赖上游 AES）
function packPlay(o) {
  return Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unpackPlay(t) {
  try {
    const s = String(t).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
  } catch { return null; }
}

// ---------- 插件 ----------
const api = async (f) => {
  f.post('/init', async () => {
    try { const s = await ensure(); return { siteUrl: s.cfg.host, config: s.cfg.name || APP_KEY }; } catch (e) { return { error: e.message }; }
  });

  f.post('/home', async () => {
    const nav = await call('nav');
    return { class: classesFrom(nav), filters: filtersFrom(nav), list: [] };
  });

  f.post('/category', async (r) => {
    const b = r.body || {};
    const page = num(b.page || b.pg);
    const ext = b.extend || b.filters || {};
    const out = await call('video_list', {
      token: '', pg: page, tid: num(b.id || b.tid, 1),
      class: one(ext.class), area: one(ext.area), lang: one(ext.lang), year: one(ext.year),
      order: one(ext.order) || '最新',
    });
    const list = (out.data || []).map((x) => ({
      vod_id: String(x.vod_id), vod_name: String(x.vod_name || ''), vod_pic: String(x.vod_pic || ''),
      vod_remarks: String(x.vod_remarks || ''),
    })).filter((x) => x.vod_id && x.vod_name);
    return { page, pagecount: num(out.pagecount, 9999), limit: 21, total: num(out.total, 999999), list };
  });

  f.post('/search', async (r) => {
    const b = r.body || {};
    const page = num(b.page || b.pg);
    const wd = one(b.wd || b.keyword || b.key);
    if (!wd) return { page, pagecount: 1, limit: 21, list: [] };
    const out = await call('search', { token: '', pg: page, text: wd });
    const list = (out.data || []).map((x) => ({
      vod_id: String(x.vod_id), vod_name: String(x.vod_name || ''), vod_pic: String(x.vod_pic || ''),
      vod_remarks: String(x.vod_remarks || ''),
    })).filter((x) => x.vod_id && x.vod_name);
    return { page, pagecount: num(out.pagecount, 9999), limit: 21, total: num(out.total, 999999), list };
  });

  f.post('/detail', async (r) => {
    const b = r.body || {};
    const ids = (Array.isArray(b.id) ? b.id : [b.id]).map(one).filter(Boolean);
    const out = [];
    for (const id of ids) {
      const { cfg } = await ensure();
      const d = await call('video_detail', {
        token: '', id: num(id, 0), sign_md5: cfg.sign_md5, apk_length: Number(cfg.apk_length) || 0,
        apk_path: `/data/app/~~mLGfF_Nezy4R4TqUevJVlg==/${cfg.pk_id}-NlNuzFF6p4657CBJv-ue4Q==/base.apk`,
      });
      const info = d.data && d.data.vod_info ? d.data.vod_info : {};
      const players = Array.isArray(info.vod_url_with_player) ? info.vod_url_with_player : [];
      // 普通线路排前面（secret 线路需要额外换票，成功率低）
      const ordered = [...players].sort((a, b) => Number(!!a.parse_secret) - Number(!!b.parse_secret));
      const from = [];
      const urls = [];
      for (const p of ordered) {
        const name = one(p.name) || '线路';
        const eps = [];
        for (const item of String(p.url || '').split('#')) {
          if (!item) continue;
          const i = item.indexOf('$');
          const label = i > 0 ? item.slice(0, i) : '播放';
          const raw = i > 0 ? item.slice(i + 1) : item;
          if (!raw) continue;
          eps.push(`${String(label).replace(/[$#]/g, ' ')}$${packPlay({ u: raw, p: one(p.parse_api), e: one(p.extra_parse_api), h: one(p.headers), s: !!p.parse_secret, c: one(p.code) })}`);
        }
        if (eps.length) { from.push(name); urls.push(eps.join('#')); }
      }
      out.push({
        vod_id: String(info.vod_id || id), vod_name: String(info.vod_name || ''),
        vod_pic: String(info.vod_pic || ''), vod_year: String(info.vod_year || ''),
        vod_area: String(info.vod_area || ''), vod_remarks: String(info.vod_remarks || ''),
        vod_actor: String(info.vod_actor || ''), vod_director: String(info.vod_director || ''),
        vod_content: String(info.vod_content || info.vod_blurb || '').replace(/<[^>]+>/g, '').trim(),
        vod_play_from: from.join('$$$'), vod_play_url: urls.join('$$$'),
      });
    }
    return { list: out };
  });

  f.post('/play', async (r) => {
    const b = r.body || {};
    const token = unpackPlay(b.id);
    if (!token) return { parse: 1, jx: 1, url: one(b.id) };
    const header = { 'User-Agent': one(token.h) || UA };
    if (!token.p) {
      if (/^https?:\/\//i.test(token.u)) return { parse: 0, url: token.u, header };
      return { msg: '缺少 parse_api' };
    }

    // secret 线路：先用 secret_parse_api_url 换一张票，再拼到解析接口后面
    if (token.s) {
      try {
        const sec = await call('secret_parse_api_url', { token: '', url: token.u, player_code: playerCode(token.u, token.c) });
        if (sec && sec.data) token.u = String(sec.data);
      } catch (e) { /* 换票失败就按原样试 */ }
    }

    // 依次尝试主解析、备用解析；每个都先按明文 JSON 试，再按密文 decrypt 试
    const apis = [token.p, token.e].map(one).filter((x, i, a) => x && a.indexOf(x) === i);
    for (const api of apis) {
      const target = `${api}${encodeURIComponent(token.u)}`;
      try {
        const r1 = await request(target, { headers: { 'User-Agent': 'dart' }, timeout: 20000 });
        const txt = String(r1.text || '').trim();
        if (!txt) continue;

        let j = json(txt);
        if (!j || !pickUrl(j)) {
          const dec = await crypto('parse_decrypt', txt).catch(() => ({}));
          const t2 = dec.text || dec.data || '';
          if (t2) j = typeof t2 === 'string' ? json(t2, {}) : t2;
        }
        const url = pickUrl(j);
        if (url && !/^https?:\/\/[^\/]+\/?$/.test(url)) return { parse: 0, url, header };
        if (/^https?:\/\//i.test(txt) && !/^https?:\/\/[^\/]+\/?$/.test(txt.trim())) return { parse: 0, url: txt, header }; // 个别解析直接回 302 后的地址
      } catch (e) { /* 换下一个 */ }
    }
    return { parse: 1, jx: 1, url: `${token.p}${encodeURIComponent(token.u)}` };
  });
};

// 线路码：优先取 "BBBB-xxx" 这种前缀，其次按平台域名判断
function playerCode(url, fallback) {
  const n = String(url || '');
  const s = n.indexOf('-');
  if (s > 0 && !n.slice(0, s).includes('://')) return n.slice(0, s);
  const c = n.toLowerCase();
  if (c.includes('v.qq.com') || c.includes('qq.com')) return 'qq';
  if (c.includes('iqiyi.com') || c.includes('qiyi.com')) return 'qiyi';
  if (c.includes('youku.com')) return 'youku';
  if (c.includes('mgtv.com')) return 'mgtv';
  if (c.includes('bilibili.com') || c.includes('b23.tv')) return 'bilibili';
  return fallback || '';
}

// 解析服务返回的结构五花八门，统一扒一个播放地址出来
function pickUrl(j) {
  if (!j || typeof j !== 'object') return '';
  const cands = [j.url, j.play_url, j.playUrl, j.video, j.src, j.data && j.data.url, j.data && j.data.play_url, j.result && j.result.url, j.data && j.data[0] && j.data[0].url];
  for (const c of cands) if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  return '';
}

export default function createSpider() {
  return {
  meta: { key: 'py_mengtaiqi', name: '🐺灰太狼 - 极速', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
  api,
};
}
