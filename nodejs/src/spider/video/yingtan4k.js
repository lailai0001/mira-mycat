// 影探4K —— catBridge 單檔 cat 源（後台「Cat 源」→ 上傳導入，熱重載）
// 由 others/影探4K.py（tvbox python 源）移植。六介面契約見 docs/spider.md。
// 沙箱內 import 會被改寫為 __CAT_JS_UTIL：'util/req.js' 走宿主 HTTP 客戶端，'crypto' 為 node:crypto。
import req from '../../util/req.js';
import crypto from 'crypto';

const HOST = 'http://cms.lyyytv.cn';
const CMS_KEY = 'wP5bvxoc3yv7FoBQENFZuAF0EUYr4LTy';
const PARSE_API = 'http://61.184.23.217:6163/api/index?parsesId=4&appid=10001&videoUrl=';

const HEADERS = { 'User-Agent': 'okhttp/4.12.0' };
const PARSE_HEADERS = { 'User-Agent': 'okhttp-okgo/jeasonlzy' };

const FILTER_KEYS = ['class', 'area', 'lang', 'year', 'letter', 'by', 'sort'];

const toStr = (v) => (v == null ? '' : String(v));

// ===================== 加解密 =====================

// 嚴格 base64 判定（對應 PHP/Python base64_decode(..., true)）：非法字元 / 長度不符回 null。
// 明文 URL 含 ':' '/' 等非 base64 字元，會在此被擋下、由上層原樣返回。
function strictB64(s) {
    const t = toStr(s);
    if (!t || t.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return null;
    try {
        return Buffer.from(t, 'base64');
    } catch {
        return null;
    }
}

// AES-CBC 解密 + PKCS7 手動去填充（對應 Python 手動 pad 剝離，容忍非法填充）
function aesCbcDecryptRaw(ctBuf, keyBuf, ivBuf) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf);
    decipher.setAutoPadding(false);
    let out = Buffer.concat([decipher.update(ctBuf), decipher.final()]);
    if (out.length) {
        const pad = out[out.length - 1];
        if (pad > 0 && pad <= 16) out = out.slice(0, out.length - pad);
    }
    return out;
}

// 對應 Python LdmaxDecryptor::decrypt：base64 解碼 -> 遇 ldmax.cooom 遞迴解密
function ldmaxDecrypt(encrypted, depth = 0) {
    if (depth > 5) return null;
    const buf = strictB64(encrypted);
    if (!buf) return toStr(encrypted);
    const url = buf.toString('utf8').replace(/\s+/g, '');
    if (!url.includes('ldmax.cooom')) return url;

    const pathPart = url.replace(/https?:\/\/ldmax\.cooom\//, '');
    if (pathPart.length < 16) return null;

    const key = Buffer.from(pathPart.slice(0, 16).split('').reverse().join(''), 'utf8');
    const ctBuf = strictB64(pathPart.slice(16).replace(/\s+/g, ''));
    if (!ctBuf) return null;

    let result;
    try {
        result = aesCbcDecryptRaw(ctBuf, key, key).toString('utf8').trim();
    } catch {
        return null;
    }
    if (result.includes('ldmax.cooom')) {
        return ldmaxDecrypt(Buffer.from(result, 'utf8').toString('base64'), depth + 1);
    }
    return result;
}

// 對應 Python ldmax_parse：解密 -> 內置解析接口 -> 二次解密
async function ldmaxParse(videoUrl) {
    const decrypted = ldmaxDecrypt(videoUrl);
    if (!decrypted || !/^https?:\/\//.test(decrypted)) return null;
    try {
        const parseUrl = PARSE_API + encodeURIComponent(decrypted);
        const resp = (await req.get(parseUrl, { headers: PARSE_HEADERS, timeout: 8000 })).data;
        if (!resp || resp.code !== 200 || !resp.url) return null;
        const finalUrl = ldmaxDecrypt(resp.url);
        if (finalUrl && /^https?:\/\//.test(finalUrl)) {
            return { url: finalUrl, type: resp.type || 'video' };
        }
    } catch {
        return null;
    }
    return null;
}

// 對應 Python lvdou：lvdou+ 前綴地址 AES-CBC(cmskey[:16] / cmskey[-16:]) 解密
function lvdou(text) {
    const original = toStr(text);
    const prefix = 'lvdou+';
    if (!original.startsWith(prefix)) return original;
    try {
        const key = Buffer.from(CMS_KEY.slice(0, 16), 'utf8');
        const iv = Buffer.from(CMS_KEY.slice(-16), 'utf8');
        const ct = Buffer.from(original.slice(prefix.length), 'base64');
        return aesCbcDecryptRaw(ct, key, iv).toString('utf8');
    } catch {
        return original;
    }
}

// 對應 Python check_paly_url：媒體直鏈或 lyyytv.cn 偽直鏈
function checkPlayUrl(content) {
    return /https?:\/\/.*(?:\.(?:mp4|m3u8|flv|avi|mkv|ts|mov|wmv|webm)|lyyytv\.cn\/)/i.test(toStr(content));
}

// ===================== 六大介面 =====================

// /home：nav 取分類 + 篩選器，index_video 取推薦列表（合併 Python homeContent + homeVideoContent）
async function home() {
    const classes = [];
    const filters = {};
    let list = [];
    try {
        const nav = (await req.get(`${HOST}/api.php/app/nav?token=`, { headers: HEADERS })).data || {};
        for (const item of nav.list || []) {
            const tid = toStr(item.type_id);
            classes.push({ type_id: tid, type_name: item.type_name });

            const ext = item.type_extend || {};
            let hasNonEmpty = false;
            for (const k of FILTER_KEYS) {
                if (toStr(ext[k]).trim() !== '') {
                    hasNonEmpty = true;
                    break;
                }
            }
            if (hasNonEmpty) filters[tid] = [];
            for (const k of FILTER_KEYS) {
                const raw = toStr(ext[k]).trim();
                if (raw === '') continue;
                const value = raw
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s !== '')
                    .map((s) => ({ n: s, v: s }));
                if (value.length) filters[tid].push({ key: k, name: k, value });
            }
        }
    } catch (e) {
        console.error('[影探4K] home nav error:', e.message);
    }
    try {
        const idx = (await req.get(`${HOST}/api.php/app/index_video?token=`, { headers: HEADERS })).data || {};
        for (const item of idx.list || []) {
            if (Array.isArray(item.vlist)) list.push(...item.vlist);
        }
    } catch (e) {
        console.error('[影探4K] home index_video error:', e.message);
    }
    return { class: classes, filters, list };
}

// /category：CMS 原生分頁介面透傳歸一
async function category(inReq) {
    const tid = toStr(inReq.body?.id);
    let pg = inReq.body?.page || 1;
    if (pg == 0) pg = 1;
    const extend = inReq.body?.filters || {};

    const params = [`tid=${encodeURIComponent(tid)}`, `pg=${pg}`, 'limit=18'];
    for (const k of ['class', 'area', 'lang', 'year']) {
        if (extend[k]) params.push(`${k}=${encodeURIComponent(toStr(extend[k]))}`);
    }

    try {
        const data = (await req.get(`${HOST}/api.php/app/video?${params.join('&')}`, { headers: HEADERS })).data || {};
        const list = Array.isArray(data.list) ? data.list : [];
        return {
            page: Number(data.page) || pg,
            pagecount: Number(data.pagecount) || pg,
            limit: Number(data.limit) || list.length,
            total: Number(data.total) || 0,
            list,
        };
    } catch (e) {
        console.error('[影探4K] category error:', e.message);
        return { page: pg, pagecount: pg, list: [] };
    }
}

// /detail：vod_url_with_player -> vod_play_from/vod_play_url（逐集 lvdou 解密）
async function detail(inReq) {
    const rawId = inReq.body?.id;
    const id = Array.isArray(rawId) ? rawId[0] : toStr(rawId);
    try {
        const data = (await req.get(`${HOST}/api.php/app/video_detail?id=${encodeURIComponent(id)}`, { headers: HEADERS })).data?.data;
        if (!data) return { list: [] };

        const show = [];
        const playUrls = [];
        for (const item of data.vod_url_with_player || []) {
            const episodes = toStr(item.url).split('#');
            const eps = [];
            for (const ep of episodes) {
                if (!ep) continue;
                const sep = ep.indexOf('$');
                const name = sep >= 0 ? ep.slice(0, sep) : ep;
                const raw = sep >= 0 ? ep.slice(sep + 1) : ep;
                eps.push(`${name}$${lvdou(raw)}`);
            }
            playUrls.push(eps.join('#'));
            show.push(toStr(item.name).trim());
        }

        delete data.vod_url_with_player;
        data.vod_play_from = show.join('$$$');
        data.vod_play_url = playUrls.join('$$$');
        return { list: [data] };
    } catch (e) {
        console.error('[影探4K] detail error:', e.message);
        return { list: [] };
    }
}

// /play：去除 %XX 編碼 -> 內置解析 / 直鏈判定 / 交客戶端解析
async function play(inReq) {
    let videoId = toStr(inReq.body?.id);
    // 保留 jx 字段 (XPTV/TVBox 用) + parse 字段 (MiraPlayer 用),与原版 4K.js 一致
    // 不剥离 %XX 编码,保持 URL 完整

    const isPlainUrl = /^https?:\/\//.test(videoId);
    if (!isPlainUrl || (isPlainUrl && videoId.includes('lyyytv.cn'))) {
        const parsed = await ldmaxParse(videoId);
        if (parsed) return { jx: 0, parse: 0, url: parsed.url, header: HEADERS };
    }
    // 直接可播的直链: jx 0 / parse 0 直接播放
    if (checkPlayUrl(videoId)) return { jx: 0, parse: 0, url: videoId, header: HEADERS };
    // 需要解析的网页 URL: jx 1 / parse 1 交给客户端解析
    return { jx: 1, parse: 1, url: videoId, header: HEADERS };
}

// /search：CMS 原生搜索介面
async function search(inReq) {
    let pg = inReq.body?.page || 1;
    if (pg == 0) pg = 1;
    const key = toStr(inReq.body?.wd ?? inReq.body?.key);
    try {
        const data = (await req.get(`${HOST}/api.php/app/search?text=${encodeURIComponent(key)}&pg=${pg}`, { headers: HEADERS })).data || {};
        const list = (Array.isArray(data.list) ? data.list : []).map((item) => {
            const copy = { ...item };
            delete copy.type;
            return copy;
        });
        return { page: Number(data.page) || pg, pagecount: Number(data.pagecount) || pg, list };
    } catch (e) {
        console.error('[影探4K] search error:', e.message);
        return { page: pg, pagecount: pg, list: [] };
    }
}

export default {
    meta: { key: 'yingtan4k', name: '影探4K', type: 3 },
    api: async (fastify) => {
        fastify.post('/init', async () => ({}));
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
