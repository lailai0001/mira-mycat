import req from '../../util/req.js';
import crypto from 'crypto';

'use strict';
// 热播·极速 | 滴源 Node 插件。网络请求由插件运行位置发出。
const REBO_HOST = 'http://v.rbotv.cn';
const REBO_KEY = '7gp0bnd2sr85ydii2j32pcypscoc4w6c7g5spl';
const UA = 'okhttp-okgo/jeasonlzy';
function textOnly(raw) {
  return String(raw || '').replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function requestRaw(url, fields, jsonMode) {
  return (async () => {
    let body = null, headers = { 'User-Agent': UA, Accept: 'application/json' }, boundary = '';
    if (!jsonMode) {
      const data = Object.assign({}, fields || {});
      const tm = String(Math.floor(Date.now() / 1000));
      data.sign = crypto.createHash('md5').update(REBO_KEY + tm).digest('hex');
      data.timestamp = tm;
      boundary = '----rebo' + crypto.randomBytes(8).toString('hex');
      const parts = [];
      for (const [k, v] of Object.entries(data)) {
        parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + String(v) + '\r\n');
      }
      parts.push('--' + boundary + '--\r\n');
      body = parts.join('');
      headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
    }
    const parse = (txt) => {
      const parsed = JSON.parse(txt);
      return jsonMode ? parsed : (parsed && parsed.code === 1 ? (parsed.data || {}) : null);
    };
    try {
      const r = await req({ method: jsonMode ? 'GET' : 'POST', url, headers, data: body, timeout: 15000, responseType: 'text' });
      return parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
    } catch (e) {
      if (e && e.response) return null;
      if (typeof fetch !== 'undefined') {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 15000);
          try {
            const r = await fetch(url, { method: jsonMode ? 'GET' : 'POST', headers, body, signal: ctl.signal });
            return parse(await r.text());
          } finally { clearTimeout(timer); }
        } catch (e2) { return null; }
      }
      return null;
    }
  })();
}
const post = (path, data) => requestRaw(REBO_HOST + path, data, false);
const getJson = url => requestRaw(url, null, true);
function cards(items) {
  return (items || []).filter(x => x && x.vod_id && String(x.vod_id) !== '0')
    .map(x => ({ vod_id: String(x.vod_id), vod_name: x.vod_name || '',
      vod_pic: x.vod_pic || x.vod_pic_thumb || '', vod_year: x.tag || '', vod_remarks: x.vod_remarks || '' }));
}
function bodyOf(req) { return req && req.body || {}; }
const meta = { key: 'py_rebo_fast', name: '🔥热播 - 极速', type: 3, searchable: 1, quickSearch: 1, filterable: 1 };
export default function createSpider() {
  return {
  meta,
  api: async function(fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => {
      const d1 = await post('/v3/type/top_type');
      const classes = [], filters = {};
      for (const k of (d1 && d1.list || [])) {
        classes.push({ type_name: k.type_name, type_id: k.type_id });
        const ff = [];
        for (const key of Object.keys(k)) {
          const val = k[key];
          if (Array.isArray(val) && val.length > 2) ff.push({ name: key, key,
            value: val.filter(x => x && x !== '全部').map(x => ({ n: x, v: x })) });
        }
        if (ff.length) filters[String(k.type_id)] = ff;
      }
      const d2 = await post('/v3/type/tj_vod');
      return { class: classes, filters, list: cards([].concat(d2 && d2.cai || [], d2 && d2.loop || [])) };
    });
    fastify.post('/category', async req => {
      const b = bodyOf(req), ext = b.extend || b.filters || b.ext || {};
      const tid = b.id || b.tid || b.type_id || ext.cateId || ext.id || '1';
      const page = Math.max(1, parseInt(b.page || b.pg, 10) || 1);
      const form = { type_id: String(tid), limit: '12', page: String(page) };
      for (const k of Object.keys(ext)) form[k === 'extend' ? 'class' : k] = String(ext[k]);
      const d = await post('/v3/home/type_search', form), list = cards(d && d.list || []);
      return { page, pagecount: page + (list.length >= 12 ? 1 : 0), limit: 12,
        total: (page + (list.length >= 12 ? 1 : 0)) * 12, list };
    });
    fastify.post('/detail', async req => {
      const b = bodyOf(req), raw = b.ids || b.id || b.vod_id;
      const id = String(Array.isArray(raw) ? raw[0] : raw || '');
      if (!id) return { list: [] };
      const v = await post('/v3/home/vod_details', { vod_id: id });
      if (!v) return { list: [] };
      const from = [], groups = [];
      for (const [index, line] of (v.vod_play_list || []).entries()) {
        const eps = [];
        for (const e of line.urls || []) {
          if (!e || !e.url) continue;
          const payload = { url: e.url, p: line.parse_urls || [], r: line.referer || '', u: line.ua || '' };
          eps.push(String(e.name || '播放').replace(/[$#]/g, '_') + '$' + Buffer.from(JSON.stringify(payload)).toString('base64'));
        }
        if (eps.length) { from.push('线路' + (index + 1) + '(' + (line.flag || '') + ')'); groups.push(eps.join('#')); }
      }
      return { list: [{ vod_id: id, vod_name: v.vod_name || '', vod_pic: v.vod_pic || v.vod_pic_thumb || '',
        type_name: v.type_name || '', vod_year: v.vod_year || '', vod_area: v.vod_area || '',
        vod_actor: v.vod_actor || '', vod_director: v.vod_director || '',
        vod_remarks: v.vod_remarks || '', vod_content: textOnly(v.vod_content),
        vod_play_from: from.join('$$$'), vod_play_url: groups.join('$$$') }] };
    });
    fastify.post('/search', async req => {
      const b = bodyOf(req), wd = String(b.wd || b.word || b.keyword || '').trim();
      const page = Math.max(1, parseInt(b.page || b.pg, 10) || 1);
      if (!wd) return { page, list: [] };
      const d = await post('/v3/home/search', { limit: '12', page: String(page), keyword: wd });
      return { page, list: cards(d && d.list || []) };
    });
    fastify.post('/play', async req => {
      const b = bodyOf(req), raw = b.id || b.play || b.vod_id || '';
      const id = String(Array.isArray(raw) ? raw[0] : raw);
      let data;
      try { data = JSON.parse(Buffer.from(id, 'base64').toString('utf8')); } catch (e) { data = null; }
      if (!data || !data.url) return { parse: 1, url: id };
      const headers = {};
      if (data.r) headers.Referer = data.r;
      if (data.u) headers['User-Agent'] = data.u;
      for (const parser of Array.isArray(data.p) ? data.p : []) {
        const result = await getJson(String(parser) + data.url);
        const real = result && (result.url || result.data && result.data.url);
        if (real) return { parse: 0, url: real, header: headers };
      }
      return { parse: Array.isArray(data.p) && data.p.length ? 1 : 0, url: data.url, header: headers };
    });
  }
};
}