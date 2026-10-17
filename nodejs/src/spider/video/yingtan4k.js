// 影探4K - MiraPlayer 源
// 转换自 4K.py，站点 http://cms.lyyytv.cn（苹果CMS）
// key: py_yingtan4k
import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_yingtan4k';
const NAME = '影探4K';

const HOST = 'http://cms.lyyytv.cn';
const CMSKEY = 'wP5bvxoc3yv7FoBQENFZuAF0EUYr4LTy';
const UA = 'okhttp/4.12.0';
const TIMEOUT = 25000;
const PARSE_API = 'http://61.184.23.217:6163/api/index?parsesId=4&appid=10001&videoUrl=';

// ================= 双通道请求 =================
async function httpGet(url, headers) {
  const h = Object.assign({ 'User-Agent': UA }, headers || {});
  // 先框架 req
  try {
    const r = await req.get(url, { headers: h, timeout: TIMEOUT });
    const d = r.data;
    if (typeof d === 'string') return d;
    return JSON.stringify(d);
  } catch (e) { /* fallthrough */ }
  // 再 fetch 兜底
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(url, { headers: h, signal: ctl.signal });
    clearTimeout(t);
    return await r.text();
  } catch (e) {
    return '';
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

// ================= ldmax 解密 =================
function ldmaxDecrypt(encryptedBase64, depth) {
  depth = depth || 0;
  if (depth > 5) return null;
  const cleaned = String(encryptedBase64 || '').replace(/\s+/g, '');
  let decoded;
  try {
    decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
    // 严格校验：重新编码必须一致，否则视为非 base64
    if (Buffer.from(decoded, 'utf-8').toString('base64').replace(/=+$/, '') !== cleaned.replace(/=+$/, '')) {
      return encryptedBase64;
    }
  } catch (e) {
    return encryptedBase64;
  }
  const url = decoded.replace(/\s+/g, '');
  if (url.indexOf('ldmax.cooom') < 0) return url;
  const path = url.replace(/https?:\/\/ldmax\.cooom\//, '');
  if (path.length < 16) return null;
  const keyStr = path.slice(0, 16).split('').reverse().join('');
  const ctB64 = path.slice(16).replace(/\s+/g, '');
  let decrypted;
  try {
    const key = Buffer.from(keyStr, 'utf-8');
    const ct = Buffer.from(ctB64, 'base64');
    const d = crypto.createDecipheriv('aes-128-cbc', key, key);
    d.setAutoPadding(false);
    decrypted = Buffer.concat([d.update(ct), d.final()]);
  } catch (e) {
    return null;
  }
  if (decrypted && decrypted.length) {
    const pad = decrypted[decrypted.length - 1];
    let plain = decrypted;
    if (pad > 0 && pad <= 16) plain = decrypted.slice(0, -pad);
    const result = plain.toString('utf-8').trim();
    if (result.indexOf('ldmax.cooom') >= 0) {
      return ldmaxDecrypt(Buffer.from(result, 'utf-8').toString('base64'), depth + 1);
    }
    return result;
  }
  return null;
}

// ================= lvdou 解密 =================
function lvdouDecrypt(text) {
  const prefix = 'lvdou+';
  if (String(text || '').indexOf(prefix) !== 0) return text;
  try {
    const key = Buffer.from(CMSKEY.slice(0, 16), 'utf-8');
    const iv = Buffer.from(CMSKEY.slice(-16), 'utf-8');
    const ct = Buffer.from(String(text).slice(prefix.length), 'base64');
    const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf-8');
  } catch (e) {
    return text;
  }
}

function isPlainUrl(s) {
  return /^https?:\/\//i.test(String(s || ''));
}

// ================= 路由处理 =================
async function init() { return {}; }

async function home() {
  const text = await httpGet(HOST + '/api.php/app/nav?token=');
  const data = parseJson(text);
  const classes = [];
  const filters = {};
  const keys = ['class', 'area', 'lang', 'year'];
  if (data && Array.isArray(data.list)) {
    for (const item of data.list) {
      classes.push({ type_id: String(item.type_id), type_name: item.type_name || '' });
      const ext = item.type_extend || {};
      const fl = [];
      for (const k of keys) {
        const v = String(ext[k] || '').trim();
        if (v) {
          fl.push({
            key: k, name: k,
            value: v.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ n: s, v: s })),
          });
        }
      }
      if (fl.length) filters[String(item.type_id)] = fl;
    }
  }
  // 首页推荐
  let list = [];
  try {
    const t2 = await httpGet(HOST + '/api.php/app/index_video?token=');
    const d2 = parseJson(t2);
    if (d2 && Array.isArray(d2.list)) {
      for (const g of d2.list) {
        if (Array.isArray(g.vlist)) {
          for (const v of g.vlist) list.push(toVod(v));
        }
      }
    }
  } catch (e) { /* ignore */ }
  return { class: classes, filters, list };
}

function toVod(v) {
  return {
    vod_id: String(v.vod_id ?? ''),
    vod_name: v.vod_name || '',
    vod_pic: v.vod_pic || '',
    vod_remarks: v.vod_remarks || v.vod_score || '',
  };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  const tid = String(body.tid ?? body.id ?? '1').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.extend || {};
  const qp = ['tid=' + encodeURIComponent(tid), 'pg=' + page, 'limit=18'];
  for (const k of ['class', 'area', 'lang', 'year']) {
    if (extend[k]) qp.push(k + '=' + encodeURIComponent(extend[k]));
  }
  const text = await httpGet(HOST + '/api.php/app/video?' + qp.join('&'));
  const data = parseJson(text);
  const list = Array.isArray(data?.list) ? data.list.map(toVod) : [];
  const total = parseInt(data?.total, 10) || 0;
  const pagecount = parseInt(data?.pagecount, 10) || (total > 0 ? Math.max(1, Math.ceil(total / 18)) : (list.length >= 18 ? page + 1 : page));
  return { page, pagecount, limit: 18, total, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id ?? '').trim().split('/')[0];
  if (!id) return { list: [] };
  const text = await httpGet(HOST + '/api.php/app/video_detail?id=' + encodeURIComponent(id));
  const data = parseJson(text)?.data;
  if (!data) return { list: [] };
  const froms = [];
  const urls = [];
  for (const src of (data.vod_url_with_player || [])) {
    const name = String(src.name || '').trim();
    const parts = [];
    for (const ep of String(src.url || '').split('#')) {
      if (!ep || ep.indexOf('$') < 0) continue;
      const idx = ep.indexOf('$');
      const epName = ep.slice(0, idx);
      const rawUrl = lvdouDecrypt(ep.slice(idx + 1));
      parts.push(epName + '$' + rawUrl);
    }
    if (parts.length) {
      froms.push(name);
      urls.push(parts.join('#'));
    }
  }
  return {
    list: [{
      vod_id: String(data.vod_id ?? id),
      vod_name: data.vod_name || '',
      vod_pic: data.vod_pic || '',
      vod_year: data.vod_year || '',
      vod_area: data.vod_area || '',
      vod_actor: data.vod_actor || '',
      vod_director: data.vod_director || '',
      vod_content: data.vod_content || '',
      vod_play_from: froms.join('$$$'),
      vod_play_url: urls.join('$$$'),
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let videoId = String(body.id ?? '').trim();
  if (!videoId) return { parse: 0, url: '' };
  // Python 原版会删掉 %XX 编码；但经验证这会破坏中文文件名 URL，保留原样
  const plain = isPlainUrl(videoId);
  const needParse = !plain || (plain && videoId.indexOf('lyyytv.cn') >= 0);
  if (needParse) {
    // ldmax 解密
    const dec = ldmaxDecrypt(videoId);
    if (dec && isPlainUrl(dec)) videoId = dec;
    // 解析接口（目前已死，失败则继续走直链逻辑）
    if (isPlainUrl(videoId)) {
      try {
        const t = await httpGet(PARSE_API + encodeURIComponent(videoId), { 'User-Agent': 'okhttp-okgo/jeasonlzy' });
        const r = parseJson(t);
        if (r && r.code === 200 && r.url) {
          const fin = ldmaxDecrypt(r.url) || r.url;
          if (isPlainUrl(fin)) return { parse: 0, url: fin, header: { 'User-Agent': UA } };
        }
      } catch (e) { /* parse api dead, ignore */ }
    }
  }
  if (isPlainUrl(videoId)) {
    return { parse: 0, url: videoId, header: { 'User-Agent': UA } };
  }
  return { parse: 1, url: videoId };
}

async function search(reqIn) {
  const body = reqIn?.body || {};
  const key = String(body.wd ?? body.key ?? '').trim();
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  if (!key) return { page, pagecount: page, limit: 18, total: 0, list: [] };
  const text = await httpGet(HOST + '/api.php/app/search?text=' + encodeURIComponent(key) + '&pg=' + page);
  const data = parseJson(text);
  const list = Array.isArray(data?.list) ? data.list.map(toVod) : [];
  return { page, pagecount: list.length >= 18 ? page + 1 : page, limit: 18, total: list.length, list };
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
