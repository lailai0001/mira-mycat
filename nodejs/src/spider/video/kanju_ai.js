// 滴源 Node 插件兼容基础环境；原始业务源码保留在此文件中。
'use strict';
import req from '../../util/req.js';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';
import zlib from 'node:zlib';
import crypto from 'crypto';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
const log = (...a)=>console.log(...a);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const CryptoJS={HmacSHA256:(str,key)=>({toString:()=>crypto.createHmac('sha256',key).update(str).digest('hex')})};
function base64Decode(x){return Buffer.from(String(x),'base64').toString('utf8')}
function base64Encode(x){return Buffer.from(String(x)).toString('base64')}
function setResult(v){return Array.isArray(v)?v.map(x=>({vod_id:String(x.vod_id||x.url||x.id||''),vod_name:String(x.vod_name||x.title||x.name||''),vod_pic:String(x.vod_pic||x.img||x.pic_url||x.pic||''),vod_remarks:String(x.vod_remarks||x.desc||'')})):[]}
function urljoin(a,b){return new URL(String(b||''),String(a)).href}
function buildUrl(raw, params){const u=new URL(raw);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return u.href}
function urlDeal(x){return x}
const local={get:()=>'',set:()=>{}};
async function request(url, opt) {
  const o = opt || {};
  const method = String(o.method || 'GET').toUpperCase();
  const r = await req({ method, url, headers: o.headers || {}, data: o.body || o.data || undefined, timeout: o.timeout || 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ' ' + url);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function post(url, opt = {}) { return request(url, { ...opt, method: 'POST' }); }

const HOST = 'https://kanju.ai';
const SIGN_KEY = '557d0e4ae929f438da6bd84412374e6086b8af09b3fed54bf22601d5bf8c54a0';
const BUILD_VERSION = 'dianyingtiantang-v2026.09.09.2-72abea110b8e-web';
const PROTOCOL_VERSION = '2026-07-05.library-v2.playback-v1';

function nonce() {
    let s = '';
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
}

function signHeaders(path, method) {
    const ts = String(Date.now());
    const n = nonce();
    const raw = `${method || 'GET'}\n${path}\n${ts}\n${n}`;
    return {
        'x-ai-movie-timestamp': ts,
        'x-ai-movie-nonce': n,
        'x-ai-movie-signature': CryptoJS.HmacSHA256(raw, SIGN_KEY).toString(),
        'x-ai-movie-client-name': 'dianyingtiantang-frontend',
        'x-ai-movie-client-version': '1.0.0',
        'x-ai-movie-build-version': BUILD_VERSION,
        'x-ai-movie-protocol-version': PROTOCOL_VERSION,
        'Referer': `${HOST}/`,
        'User-Agent': MOBILE_UA
    };
}

async function api(path) {
    const txt = await request(`${HOST}${path}`, {headers: signHeaders(path, 'GET')});
    return JSON.parse(txt);
}

async function postSigned(path, body) {
    return request(`${HOST}${path}`, {
        method: 'POST',
        headers: Object.assign({}, signHeaders(path, 'POST'), {'Content-Type': 'application/json'}),
        body: JSON.stringify(body)
    });
}

// 播放页只给网页地址；真正的 m3u8/mp4 在 line_options 里：
// - 部分线路直接给 http(s) 直链（稳定、无需签名中转，优先用）
// - 部分线路给 resolve://ticket，要 POST /v1/playback/resolve-line 换直链
// 线路里混有失效线路（封面 jpg、404、过期签名），必须逐条探测真实响应再返回。
const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|svg)(\?|$)|~tplv-|image\.image/i;

function mediaOk(url, depth = 0) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(String(url || '')); } catch (e) { return resolve(false); }
        let settled = false;
        let req = null;
        const finish = (v) => {
            if (settled) return;
            settled = true;
            try { if (req) req.destroy(); } catch (e) { /* 忽略 */ }
            resolve(v);
        };
        try {
            req = (u.protocol === 'http:' ? http : https).request(u, {
                method: 'GET',
                headers: {'User-Agent': MOBILE_UA, 'Referer': `${HOST}/`, 'Accept-Encoding': 'identity', Range: 'bytes=0-2047'},
                rejectUnauthorized: false,
                timeout: 6000
            }, (res) => {
                const code = res.statusCode || 0;
                if (code >= 300 && code < 400 && res.headers.location && depth < 3) {
                    res.resume();
                    let next;
                    try { next = new URL(res.headers.location, u).href; } catch (e) { return finish(false); }
                    return mediaOk(next, depth + 1).then(resolve);
                }
                if (code !== 200 && code !== 206) { res.resume(); return finish(false); }
                const ct = String(res.headers['content-type'] || '');
                if (/^(image\/|text\/html)/i.test(ct)) { res.resume(); return finish(false); }
                res.once('data', (chunk) => {
                    if (/^(video\/|application\/(?:x-mpegurl|vnd\.apple\.mpegurl|octet-stream))/i.test(ct)) return finish(true);
                    const buf = Buffer.from(chunk);
                    const head = buf.subarray(0, 64).toString('utf8').replace(/^\uFEFF/, '').trim();
                    if (/^#EXTM3U/i.test(head)) return finish(true);
                    if (buf[0] === 0x47) return finish(true);
                    finish(false);
                });
                res.on('end', () => finish(false));
                res.on('error', () => finish(false));
            });
        } catch (e) { return finish(false); }
        req.on('timeout', () => finish(false));
        req.on('error', () => finish(false));
        req.end();
    });
}

async function resolvePlay(token) {
    const data = await api(`/v1/playback/resolve/${encodeURIComponent(token)}?line=yjplayer&view=compact`);
    const all = Array.isArray(data.line_options) ? data.line_options : [];
    const lines = all.filter(x => x && x.selected).concat(all.filter(x => !x || !x.selected));
    const direct = [];
    const tickets = [];
    for (const line of lines) {
        const raw = String((line && line.url) || '');
        if (/^https?:\/\//i.test(raw)) direct.push(raw);
        else if (/^resolve:\/\//i.test(raw)) tickets.push(raw.replace(/^resolve:\/\//, ''));
    }
    // 直链线路优先：并发探测（每批 4 条），避免某条线路超时把 /play 拖到十几秒
    const probeAll = async (list) => {
        const uniq = [...new Set(list)].filter(Boolean).slice(0, 12);
        for (let i = 0; i < uniq.length; i += 4) {
            const batch = uniq.slice(i, i + 4);
            const hits = await Promise.all(batch.map(async (u) => (await mediaOk(u)) ? u : ''));
            const hit = hits.find(Boolean);
            if (hit) return hit;
        }
        return '';
    };
    const directList = direct.filter(u => u && !IMAGE_URL_RE.test(u));
    const directHit = await probeAll(directList);
    if (directHit) return directHit;
    // 直链都不可用时，再把 resolve:// 线路换成直链重试（最多 6 条）
    const resolved = [];
    for (const ticket of tickets.slice(0, 6)) {
        try {
            const obj = JSON.parse(await postSigned('/v1/playback/resolve-line?view=compact', {ticket}));
            const url = String((obj && obj.line && obj.line.url) || '');
            if (/^https?:\/\//i.test(url) && !IMAGE_URL_RE.test(url)) resolved.push(url);
        } catch (e) { /* 换下一条 */ }
    }
    return probeAll(resolved);
}

function toVod(item) {
    return {
        vod_id: item.id || item.variant_id,
        vod_name: item.title || item.normalized_title || '',
        vod_pic: item.poster_url || item.carousel_url || item.backdrop_url || '',
        vod_remarks: item.remarks || item.area || '',
        vod_year: item.year ? String(item.year) : '',
        vod_area: item.area || '',
        vod_content: item.description || item.overview || item.remarks || ''
    };
}

function joinNonEmpty(list) {
    return (list || []).filter(Boolean).join(',');
}

// ---------------- 本地播放代理：带 UA/Referer、透传 Range、重写 HLS 播放列表 ----------------
// 壳子播放器不认 /play 返回的 header；本站签名直链对播放器 UA 会返回 502。
// 由引擎代取后回吐字节，并把 m3u8 内的分片/密钥地址改写成代理地址，播放器无需再直连。
const PROXY_KEY = 'py_kanju_ai';
const PROXY_UA = MOBILE_UA;
const PROXY_REFERER = HOST + '/';

function ipPrivate(ip) {
    const s = String(ip || '').toLowerCase();
    if (net.isIPv4(s)) {
        const p = s.split('.').map(Number);
        if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
        if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
        if (p[0] === 169 && p[1] === 254) return true;
        if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
        if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;
        if (p[0] === 192 && p[1] === 168) return true;
        if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
        if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;
        if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;
        if (p[0] >= 224) return true;
        return false;
    }
    if (!net.isIPv6(s)) return false;
    if (s === '::' || s === '::1') return true;
    const dotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return ipPrivate(dotted[1]);
    const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
        const n = parseInt(hex[1], 16) * 65536 + parseInt(hex[2], 16);
        return ipPrivate([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s)) return true;
    return false;
}

async function checkProxyTarget(raw) {
    let u;
    try { u = new URL(String(raw || '')); } catch (e) { throw Error('bad url'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Error('bad protocol');
    if (u.username || u.password) throw Error('bad url');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!host || /^(?:localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw Error('private host');
    let addrs;
    const fam = net.isIP(host);
    if (fam) addrs = [{ address: host, family: fam }];
    else {
        addrs = await dns.promises.lookup(host, { all: true, verbatim: true });
        addrs.sort((a, b) => (a.family === 4 ? 0 : 1) - (b.family === 4 ? 0 : 1));
    }
    if (!addrs || !addrs.length) throw Error('dns');
    for (const a of addrs) if (ipPrivate(a.address)) throw Error('private address');
    return { url: u, addresses: addrs };
}

function pinnedLookup(addrs) {
    return (hostname, options, cb) => {
        if (typeof options === 'function') { cb = options; options = {}; }
        const fam = options && options.family ? Number(options.family) : 0;
        const a = addrs.find((x) => !fam || x.family === fam) || addrs[0];
        if (options && options.all) return cb(null, addrs.map((x) => ({ address: x.address, family: x.family })));
        cb(null, a.address, a.family);
    };
}

function localProxyHost(host) {
    const h = String(host || '').trim();
    if (!/^(?:[a-zA-Z0-9.\-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/.test(h)) return '';
    const m = h.match(/^\[([0-9a-fA-F:]+)\](?::\d{1,5})?$/);
    const hp = m ? m[1] : h.split(':')[0];
    if (/^localhost$/i.test(hp)) return h;
    if (net.isIP(hp) && ipPrivate(hp)) return h;
    return '';
}

function proxyBase(request) {
    const host = localProxyHost(request && request.headers && request.headers.host) || '127.0.0.1:9988';
    return 'http://' + host + '/spider/' + PROXY_KEY + '/3/proxy?url=';
}

function rewriteHls(text, playlistUrl, base) {
    const prox = (raw) => {
        try {
            const abs = new URL(String(raw).replace(/&amp;/g, '&'), playlistUrl).href;
            if (!/^https?:\/\//i.test(abs) || /\/spider\/[^/]+\/\d+\/proxy\?/i.test(abs)) return raw;
            return base + encodeURIComponent(abs);
        } catch (e) { return raw; }
    };
    return String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => {
        const t = line.trim();
        if (!t) return line;
        if (t.charAt(0) === '#') return line.replace(/URI="([^"]*)"/g, (m, uri) => 'URI="' + prox(uri) + '"');
        return prox(t);
    }).join('\n');
}

async function playProxy(request, reply) {
    let checked;
    try { checked = await checkProxyTarget(request.query && request.query.url); }
    catch (e) { return reply.code(400).type('text/plain; charset=utf-8').send('bad url'); }
    reply.hijack();
    const res = reply.raw;
    const base = proxyBase(request);
    const range = request.headers && request.headers.range ? String(request.headers.range) : '';
    const MAX_REDIRECT = 4;
    let done = false;
    const fail = (code, msg) => {
        if (done) return;
        done = true;
        try { if (!res.headersSent) res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(msg || 'proxy error'); } catch (e) { /* 忽略 */ }
    };
    const go = (urlObj, addrs, depth) => {
        let up;
        try {
            const headers = { 'User-Agent': PROXY_UA, 'Referer': PROXY_REFERER, 'Accept': '*/*', 'Accept-Encoding': 'identity' };
            if (range && !/\.m3u8(?:$|[?#])/i.test(urlObj.href)) headers.Range = range;
            up = (urlObj.protocol === 'http:' ? http : https).request(urlObj, {
                method: 'GET', headers, lookup: pinnedLookup(addrs), rejectUnauthorized: false, timeout: 25000
            }, (ur) => {
                const code = ur.statusCode || 502;
                if (code >= 300 && code < 400 && ur.headers.location && depth < MAX_REDIRECT) {
                    ur.resume();
                    let next;
                    try { next = new URL(ur.headers.location, urlObj).href; } catch (e) { return fail(502, 'bad redirect'); }
                    checkProxyTarget(next).then((c) => go(c.url, c.addresses, depth + 1)).catch(() => fail(502, 'redirect blocked'));
                    return;
                }
                const ct = String(ur.headers['content-type'] || '');
                const isHls = /mpegurl/i.test(ct) || /\.m3u8(?:$|[?#])/i.test(urlObj.href);
                if (!isHls) {
                    done = true;
                    const h = Object.assign({}, ur.headers);
                    delete h['transfer-encoding']; delete h.connection; delete h['keep-alive']; delete h['proxy-connection'];
                    try { res.writeHead(code, h); } catch (e) { return fail(502); }
                    ur.pipe(res);
                    return;
                }
                const chunks = [];
                let size = 0;
                ur.on('data', (c) => {
                    size += c.length;
                    if (size > 8 * 1024 * 1024) { try { ur.destroy(); } catch (e) { /* 忽略 */ } return; }
                    chunks.push(c);
                });
                ur.on('error', () => fail(502, 'upstream stream error'));
                ur.on('end', () => {
                    if (done) return;
                    let body = Buffer.concat(chunks);
                    const enc = String(ur.headers['content-encoding'] || '').toLowerCase();
                    try {
                        if (enc === 'gzip') body = zlib.gunzipSync(body);
                        else if (enc === 'deflate') body = zlib.inflateSync(body);
                        else if (enc === 'br') body = zlib.brotliDecompressSync(body);
                    } catch (e) { /* 保持原样 */ }
                    const text = body.toString('utf8');
                    const h = Object.assign({}, ur.headers);
                    delete h['content-encoding']; delete h['transfer-encoding']; delete h['content-range']; delete h['accept-ranges']; delete h.connection;
                    if (!/^\s*#EXTM3U/i.test(text)) {
                        done = true;
                        try { res.writeHead(code, h); } catch (e) { return fail(502); }
                        res.end(body);
                        return;
                    }
                    done = true;
                    const out = Buffer.from(rewriteHls(text, urlObj.href, base), 'utf8');
                    h['content-type'] = 'application/vnd.apple.mpegurl';
                    h['content-length'] = out.length;
                    h['cache-control'] = 'no-store';
                    try { res.writeHead(200, h); } catch (e) { return fail(502); }
                    res.end(out);
                });
            });
        } catch (e) { return fail(502, 'upstream error'); }
        up.setTimeout(25000, () => { try { up.destroy(new Error('timeout')); } catch (e) { /* 忽略 */ } });
        up.on('error', () => fail(502, 'upstream error'));
        up.end();
    };
    go(checked.url, checked.addresses, 0);
}

function toProxyUrl(request, u) {
    const s = String(u || '');
    if (!/^https?:\/\//i.test(s)) return s;
    if (/\/spider\/[^/]+\/\d+\/proxy\?/i.test(s)) return s;
    return proxyBase(request) + encodeURIComponent(s);
}

var rule = {
    类型: '影视',
    title: '看剧AI',
    desc: '看剧AI 影视搜索与内容发现',
    host: HOST,
    url: '/v1/browse/catalog?kind=fyclass&page=fypage&limit=20',
    searchUrl: '/v1/browse/catalog?q=**&page=fypage&limit=20',
    searchable: 2,
    quickSearch: 1,
    filterable: 0,
    play_parse: true,
    class_name: '电视剧&电影&动漫&综艺&纪录片&短剧',
    class_url: 'series&movie&anime&variety&documentary&short_drama',

    推荐: async function () {
        const json = await api('/v1/feed/home');
        const list = [];
        (json.sections || []).forEach(section => {
            (section.cards || []).forEach(card => list.push(toVod(card)));
        });
        const seen = new Set();
        return list.filter(v => v.vod_id && !seen.has(v.vod_id) && seen.add(v.vod_id));
    },

    一级: async function (tid, pg) {
        const page = pg || 1;
        const path = `/v1/browse/catalog?kind=${encodeURIComponent(tid)}&page=${page}&limit=20`;
        const json = await api(path);
        return (json.cards || []).map(toVod);
    },

    二级: async function (ids) {
        const id = Array.isArray(ids) ? ids[0] : (ids || this.input);
        const detail = await api(`/v1/catalog/${encodeURIComponent(id)}`);
        let episodes = detail.episodes || [];
        if (!episodes.length || detail.episode_pagination?.has_more) {
            const epJson = await api(`/v1/catalog/${encodeURIComponent(id)}/episodes?offset=0&limit=200`);
            episodes = epJson.episodes || episodes;
        }

        const vod = {
            vod_id: id,
            vod_name: detail.title || detail.normalized_title || '',
            vod_pic: detail.poster_url || detail.carousel_url || detail.backdrop_url || '',
            vod_year: detail.year ? String(detail.year) : '',
            vod_area: detail.area || '',
            vod_lang: detail.language || '',
            vod_actor: joinNonEmpty(detail.actors),
            vod_director: joinNonEmpty(detail.directors),
            vod_type: joinNonEmpty(detail.genres),
            vod_remarks: detail.remarks || '',
            vod_content: detail.description || detail.overview || detail.remarks || ''
        };

        const normalEpisodes = episodes.filter(e => e.token && (e.episode_track || 'main') === 'main');
        const playList = (normalEpisodes.length ? normalEpisodes : episodes)
            .filter(e => e.token)
            .map(e => `${e.title || e.display_name || e.key || e.number}$${id}|${e.token}|${e.title || ''}`);

        vod.vod_play_from = '看剧AI';
        vod.vod_play_url = playList.join('#');
        return vod;
    },

    搜索: async function (wd, quick, pg) {
        const page = pg || 1;
        const path = `/v1/browse/catalog?q=${encodeURIComponent(wd)}&page=${page}&limit=20`;
        const json = await api(path);
        return (json.cards || []).map(toVod);
    },

    lazy: async function (flag, id, request) {
        const parts = String(id || '').split('|');
        const vid = parts[0] || '';
        const token = parts[1] || '';
        const title = parts[2] || '';
        const url = `${HOST}/player/${encodeURIComponent(vid)}?episode=${encodeURIComponent(token)}&line=yjplayer`;
        try {
            const media = await resolvePlay(token);
            if (media) {
                return {
                    parse: 0,
                    url: toProxyUrl(request, media),
                    name: title
                };
            }
        } catch (e) {
            log('[看剧AI] 取直链失败: ' + (e && e.message ? e.message : e));
        }
        return {
            parse: 1,
            url,
            header: {
                Referer: `${HOST}/`,
                'User-Agent': MOBILE_UA
            },
            name: title
        };
    }
};


// 插件入口必须为 const __spider={meta,api}；所有 key 均为英文标识。
const __key='py_kanju_ai',__title='🤖看剧 AI - 极速';
function __cls(){return String(rule.class_url||'').split('&').filter(Boolean).map((id,i)=>({type_id:id,type_name:String(rule.class_name||'').split('&')[i]||id}))}
function __page(b){return Math.max(1,Number.parseInt(b.page||b.pg||1,10)||1)}
function __url(pattern,{id='',page=1,wd='',ext={}}={}){
 let s=String(pattern||'/').replace(/fyclass/g,encodeURIComponent(id)).replace(/fypage/g,String(page)).replace(/fyid/g,encodeURIComponent(id)).replace(/\*\*/g,encodeURIComponent(wd));
 s=s.replace(/\{\{fl\.([\w]+)(?:\s+or\s+[^}]+)?\}\}/g,(_,k)=>encodeURIComponent(ext[k]||''));
 return /^https?:\/\//.test(s)?s:new URL(s,rule.host||rule.homeUrl||'https://invalid.local').href;
}
function __list(v){if(typeof v==='string')throw Error('原始 drpy 声明式规则需单独移植，不能直接当函数执行');if(Array.isArray(v))return setResult(v);return setResult(v&&v.list||[])}
function __detail(v){return {list:Array.isArray(v)?v:(v&&v.list?v.list:v?[v]:[])}}
async function __run(name,args=[],ctx={}){
 const fn=rule[name];if(typeof fn!=='function')throw Error(name+' 当前使用 drpy 声明式/内置解析规则，需 DOM 适配，尚未完成');
 const old={};for(const k of Object.keys(ctx)){old[k]=rule[k];rule[k]=ctx[k]}
 try {return await fn.apply(rule,args)}finally{for(const k of Object.keys(ctx))rule[k]=old[k]}
}
const __spider={meta:{key:__key,name:__title,type:3,searchable:rule.searchable?1:0,quickSearch:rule.quickSearch?1:0,filterable:rule.filterable?1:0},api:async fastify=>{
 let ready=false;const initialize=async()=>{if(ready)return;if(typeof rule['预处理']==='function')await __run('预处理');ready=true};
 fastify.post('/init',async()=>{await initialize();return {}});
 fastify.post('/home',async req=>{await initialize();let classes=__cls(),filters=rule.filter||{};
 if(typeof rule.class_parse==='function'){const c=await __run('class_parse');classes=c.class||classes;filters=c.filters||filters;}
 let list=[];if(typeof rule['推荐']==='function')list=__list(await __run('推荐',[],{input:__url(rule.homeUrl||'/')}));
 return {class:classes,filters,list};});
 fastify.post('/category',async req=>{await initialize();const b=req.body||{},id=String(b.id||'1'),page=__page(b),ext=b.extend||b.filters||{};
 const v=await __run('一级',[id,page,true,ext],{input:__url(rule.url,{id,page,ext}),MY_CATE:id,MY_PAGE:page,MY_FL:ext});const list=__list(v);
 return {page,pagecount:page+(list.length>=20?1:0),list,limit:list.length,total:list.length?9999:0};});
 fastify.post('/detail',async req=>{await initialize();const b=req.body||{},id=String(Array.isArray(b.id)?b.id[0]:b.id||'');
 return __detail(await __run('二级',[[id]],{input:rule.detailUrl?__url(rule.detailUrl,{id}):id,MY_URL:id}));});
 fastify.post('/search',async req=>{await initialize();const b=req.body||{},wd=String(b.wd||b.keyword||''),page=__page(b);if(!wd)return {list:[],page,pagecount:page};
 const list=__list(await __run('搜索',[wd,false,page],{input:__url(rule.searchUrl,{wd,page}),KEY:wd,MY_PAGE:page}));return {page,pagecount:page+(list.length>=20?1:0),list,limit:list.length,total:list.length?9999:0};});
 fastify.post('/play',async req=>{await initialize();const b=req.body||{},id=String(Array.isArray(b.id)?b.id[0]:b.id||'');
 if(typeof rule.lazy!=='function')return {parse:0,url:id};const result=await __run('lazy',[b.flag||'',id,req],{input:id,MY_FLAG:b.flag||''});
 const p=typeof result==='string'?{parse:0,url:result}:result||{parse:0,url:''}; if(p.url&&/\.(m3u8|mp4)(?:[?#]|$)/i.test(p.url))p.parse=0;return p;});
 fastify.get('/proxy',playProxy);
 if(typeof fastify.head==='function')fastify.head('/proxy',playProxy);
}};

export default function createSpider() { return __spider; }
