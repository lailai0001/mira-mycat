import req from '../../util/req.js';

/**
 * 通用网盘蜘蛛（pan_hub.js）—— hub.js 里 PAN_SOURCES 的承接蜘蛛。
 *
 * 覆盖形态（提炼自 hmtv-port 的 6 个 bundle 网盘蜘蛛）：
 *   6 站共通的其实只有两层：① 详情页用同一条 PAN_RE 抠夸克/UC/百度/115/
 *   阿里/123/天翼/迅雷分享链接；② home 只返回分类、分类/搜索/详情都是
 *   「抓站内 HTML 列表页 → 抠卡片 → 详情页抠分享链接」。
 *   其中 5 站（多多/木偶/花卷/玩偶/片库）连卡片写法都一致（<a href=详情链接>
 *   + title/alt/锚文本 + data-original/data-src/src），只差 URL 模板，
 *   所以这 5 站可以由 pattern 一表驱动，见 PATTERNS。
 *
 * 不覆盖的异形站（仍需单独立蜘蛛，不要硬塞进本文件）：
 *   pomo（WordPress 主题）：卡片是 <div class="bg-cardbg"> 块 + 海报打分
 *   （轮播/站标/剧照都要扣分）、详情还有磁力线路；它的卡片解析约 200 行，
 *   塞进通用蜘蛛就等于把通用蜘蛛写成 pomo 专属蜘蛛，违背「通用」本意。
 *
 * 播放说明（诚实边界，2026-10-25 修订）：分享页地址本身不是可播流，
 *   以前 /play 原样透传 { parse: 0, url: 分享地址 } 会让播放器把分享页
 *   HTML 当视频探流，必然报“视频信息获取失败”。现改为：分享地址不再
 *   声明 parse: 0（不带 parse 交给播放器自己的网盘解析层，用用户在
 *   App 网盘设置里登好的凭证去解）；夸克文件能拿到直链时才返回
 *   { parse: 0, url: 直链 }。详情侧：百度分享会尝试展开文件夹（见
 *   expandBaiduShare，verify + sekey 列目录 API，VM 与真机均实测通
 *   过嫁金钗一案），把文件夹里的视频文件列成选集；夸克分享同样尝试
 *   展开（token/detail/download 三段，文档化接口，真机网络为准，
 *   任一步失败都回落到原分享链接，不破坏原有出线）。百度文件级精
 *   准播放（点第 5 集就播第 5 集）仍缺直链：百度直链要 sign，匿名
 *   分享在新版分享页里不暴露 sign，蜘蛛侧拿不到，只能靠播放器自
 *   带百度模块去解分享地址；夸克文件是直链，点哪集播哪集。
 *   无参调用只用于 scripts/check-spiders.mjs 的形态校验，返回一个
 *   不对应任何真实站点的空实例，router 永远不注册它；真实网盘站一律
 *   由 hub.js 的 PAN_SOURCES 传参实例化。
 */

const UA_DEFAULT =
    'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

// 详情页里能认出来的分享链接（6 站 bundle 共用同一条，见上）。
const PAN_RE =
    /https?:\/\/(?:pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|115cdn\.com|115\.com|anxia\.com|aliyundrive\.com|alipan\.com|cloud\.189\.cn|caiyun\.139\.com|pan\.xunlei\.com)\/[^\s"'<>\\]+/gi;

// pattern 一表：URL 模板 + 探活 + 卡片正则。PAN_SOURCES 的一项只需给
// pattern 名，不用重复写这些模板。
const PATTERNS = {
    // MacCMS /index.php/vod/ 系：多多 / 木偶 / 花卷
    maccms: {
        category: (host, tid, page) =>
            `${host}/index.php/vod/show/id/${encodeURIComponent(tid)}/page/${page}.html`,
        // 木偶：show 页为空时退回 type 页
        categoryFallback: (host, tid) => `${host}/index.php/vod/type/id/${encodeURIComponent(tid)}.html`,
        detail: (host, id) => `${host}/index.php/vod/detail/id/${id}.html`,
        search: (host, wd) => `${host}/index.php/vod/search/wd/${encodeURIComponent(wd)}.html`,
        probe: (host) => `${host}/index.php/vod/type/id/1.html`,
        probeRe: /\/index\.php\/vod\/detail\/id\/\d+\.html/,
        cardRe: /<a[^>]+href="([^"]*\/index\.php\/vod\/detail\/id\/(\d+)\.html)"([^>]*)>/gi,
    },
    // MacCMS /vodshow/ 系：玩偶
    vodshow: {
        category: (host, tid, page) => `${host}/vodshow/${encodeURIComponent(tid)}--------${page}---.html`,
        detail: (host, id) => `${host}/voddetail/${id}.html`,
        search: (host, wd, page) =>
            `${host}/vodsearch/-------------.html?wd=${encodeURIComponent(wd)}${page > 1 ? '&page=' + page : ''}`,
        probe: (host) => `${host}/vodshow/1--------1---.html`,
        probeRe: /\/voddetail\/\d+\.html/,
        cardRe: /<a[^>]+href="([^"]*\/voddetail\/(\d+)\.html)"([^>]*)>/gi,
    },
    // 片库 /vt/ /mv/ 系：片库
    pianku: {
        category: (host, tid, page) =>
            page <= 1 ? `${host}/vt/${encodeURIComponent(tid)}.html` : `${host}/vt/${encodeURIComponent(tid)}-${page}.html`,
        detail: (host, id) => `${host}/mv/${id}.html`,
        search: (host, wd) => `${host}/vs/-------------.html?wd=${encodeURIComponent(wd)}`,
        probe: (host) => `${host}/vt/1.html`,
        probeRe: /\/mv\/\d+\.html/,
        cardRe: /<a[^>]+href="([^"]*\/mv\/(\d+)\.html)"([^>]*)>/gi,
    },
};

function decodeEntities(s) {
    return String(s == null ? '' : s)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function abs(host, u) {
    const s = String(u || '').replace(/\\\//g, '/').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    return String(host || '').replace(/\/+$/, '') + (s.charAt(0) === '/' ? '' : '/') + s;
}

// 主栈 req（框架 axios）；App 运行时无全局 fetch，所以 fetch 只做
// typeof 保护的兜底——本机 VM 的 axios 走出口代理时对部分站会抛错，
// 兜底让这类环境也能跑通，App 内 typeof fetch 为 undefined 时绝不触碰它。
async function fetchText(url, headers) {
    if (!url) return '';
    try {
        const resp = await req.get(url, { headers, timeout: 15000, responseType: 'text' });
        const d = resp && resp.data;
        if (typeof d === 'string' && d) return d;
    } catch (e) {
        // 落入兜底
    }
    try {
        if (typeof fetch === 'undefined') return '';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const r = await fetch(url, { headers, signal: ctrl.signal });
            return await r.text();
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        return '';
    }
}

// 5 站通用的列表卡片解析：锚点 href 定 id，title → alt → 锚文本定片名，
// 锚点后 900 字符内 data-original → data-src → src 定封面，占位图丢弃。
function parseCards(html, host, cardRe) {
    const out = [];
    const seen = new Set();
    const re = new RegExp(cardRe.source, 'gi');
    let m;
    while ((m = re.exec(html))) {
        const id = m[2];
        if (seen.has(id)) continue;
        const attrs = m[3] || '';
        let title = (/\btitle="([^"]*)"/i.exec(attrs) || [])[1] || '';
        const after = html.slice(m.index, m.index + 900);
        if (!title) title = decodeEntities((/\balt="([^"]*)"/i.exec(after) || [])[1] || '');
        if (!title) title = decodeEntities((/>([^<>]{2,40})<\/a>/i.exec(after) || [])[1] || '');
        if (!title) continue;
        let pic = (
            /\bdata-original="([^"]+)"/i.exec(after) ||
            /\bdata-src="([^"]+)"/i.exec(after) ||
            /\bsrc="([^"]+)"/i.exec(after) ||
            []
        )[1] || '';
        pic = decodeEntities(pic).replace(/\\\//g, '/');
        if (/^data:/i.test(pic) || /(?:^|\/)(?:nopic|placeholder|loading)\b/i.test(pic)) pic = '';
        if (pic) pic = abs(host, pic);
        seen.add(id);
        out.push({ vod_id: id, vod_name: decodeEntities(title), vod_pic: pic, vod_remarks: '' });
    }
    return out;
}

function parseDetail(html, host, id, fallbackName, maxLinks) {
    const name = decodeEntities((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '')
        .replace(/<[^>]+>/g, '')
        .trim();
    const content = decodeEntities(
        (/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html) || [])[1] ||
            (/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i.exec(html) || [])[1] ||
            ''
    );
    const pic = abs(
        host,
        (/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html) || [])[1] ||
            (/<img[^>]+data-original="([^"]+)"/i.exec(html) || [])[1] ||
            (/<img[^>]+data-src="([^"]+)"/i.exec(html) || [])[1] ||
            ''
    );
    // 分享链接：按去参数后的地址去重，同一分享带 pwd 的优先；超 maxLinks 截断。
    const text = String(html || '').replace(/&amp;/g, '&').replace(/\\\//g, '/');
    const map = new Map();
    const re = new RegExp(PAN_RE.source, 'gi');
    let m;
    while ((m = re.exec(text))) {
        let url = String(m[0]).replace(/[)）,，。;；]+$/, '');
        // 提取码常写在链接附近的文字里（不在 URL 参数里），尤其夸克：
        // 附近 400 字内找“提取码/密码/pwd + 4 位码”，拼到 URL 上供后续
        // verify（百度）与 token（夸克）使用；找不到则保持原样。
        if (!/[?&](?:pwd|password)=/i.test(url)) {
            const near = text.slice(Math.max(0, m.index - 150), m.index + 400);
            const pm = /(?:提取码|密码|pwd|passcode)[：:\s]*([A-Za-z0-9]{4})/i.exec(near);
            if (pm) url += (url.includes('?') ? '&' : '?') + 'pwd=' + pm[1];
        }
        const bare = url.split('?')[0];
        const pwd = (/[?&](?:pwd|password)=([^&#\s]+)/i.exec(url) || [])[1] || '';
        const prev = map.get(bare);
        if (!prev || (!/[?&](?:pwd|password)=/i.test(prev) && pwd)) map.set(bare, url);
    }
    let links = [...map.values()];
    if (maxLinks > 0) links = links.slice(0, maxLinks);
    return {
        vod: { vod_id: id, vod_name: name || fallbackName, vod_pic: pic, vod_content: content },
        links,
    };
}


// 分享链接按域名归属网盘商：详情按网盘商分线路（vod_play_from），
// App 播放页就会出现夸克/百度/迅雷/UC 这样的线路选择（与多网盘源同款），
// 而不是所有分享挤在一条“网盘分享”线路下。
function panProvider(url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch (e) { host = ''; }
    if (host.includes('quark')) return '夸克';
    if (host.includes('uc.cn')) return 'UC';
    if (host.includes('baidu')) return '百度';
    if (host.includes('115')) return '115';
    if (host.includes('aliyundrive') || host.includes('alipan')) return '阿里云盘';
    if (host.includes('189.cn')) return '天翼云盘';
    if (host.includes('139.com')) return '移动云盘';
    if (host.includes('xunlei')) return '迅雷';
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    return '网盘';
}

// ---- 网盘文件夹展开与直链（2026-10-25） ----
// 选集名里绝不能出现 $ 或 #（vod_play_url 用这两个字符切分），统一清洗。
function sanitizeEpName(s) {
    return String(s == null ? '' : s).replace(/[$#\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || '未命名';
}

const VIDEO_EXT = /\.(mp4|mkv|avi|mov|rmvb|flv|wmv|ts|m2ts|webm|m4v)$/i;
function isVideoFile(name) {
    return VIDEO_EXT.test(String(name || '').trim());
}
function stripVideoExt(name) {
    return String(name || '').replace(VIDEO_EXT, '').trim();
}

// 带响应头返回的 GET/POST（百度 verify 要读 Set-Cookie 里的 BDCLND；
// App 内 req 是框架 axios，resp.headers 可读；fetch 兜底无头信息）。
async function fetchRaw(url, headers, method, body) {
    const h = headers || {};
    try {
        const resp = method === 'POST'
            ? await req.post(url, body == null ? '' : body, { headers: h, timeout: 15000, responseType: 'text' })
            : await req.get(url, { headers: h, timeout: 15000, responseType: 'text' });
        const d = resp && resp.data;
        return { text: typeof d === 'string' ? d : '', headers: (resp && resp.headers) || {} };
    } catch (e) {
        // 落入 fetch 兜底（仅 VM 环境，App 内 typeof fetch 为 undefined）
    }
    try {
        if (typeof fetch === 'undefined') return { text: '', headers: {} };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try {
            const opt = { headers: h, signal: ctrl.signal };
            if (method === 'POST') { opt.method = 'POST'; opt.body = body == null ? '' : body; }
            const r = await fetch(url, opt);
            return { text: await r.text(), headers: {} };
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        return { text: '', headers: {} };
    }
}

function getCookie(headers, name) {
    try {
        const hs = headers || {};
        let raw = '';
        for (const k of Object.keys(hs)) {
            if (k.toLowerCase() === 'set-cookie') {
                const v = hs[k];
                raw += (Array.isArray(v) ? v.join('; ') : String(v)) + '; ';
            }
        }
        const m = new RegExp(name + '=([^;]+)').exec(raw);
        return m ? decodeURIComponent(m[1]) : '';
    } catch (e) {
        return '';
    }
}

async function fetchJson(method, url, data, headers) {
    const h = headers || {};
    try {
        const resp = method === 'POST'
            ? await req.post(url, data, { headers: h, timeout: 15000 })
            : await req.get(url, { headers: h, timeout: 15000 });
        const d = resp && resp.data;
        if (d && typeof d === 'object') return d;
        if (typeof d === 'string' && d) {
            try { return JSON.parse(d); } catch (e) { return null; }
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ---- 百度分享文件夹展开 ----
// 流程（嫁金钗一案 VM 实测）：分享页 302 到 /share/init（yunData 含
// shareid/share_uk）→ POST /share/verify（pwd）得 randsk（= sekey，
// 同时是 BDCLND）→ 带 BDCLND 再 GET 分享页，locals-data 的 file_list
// 是根目录 → 子文件夹用 GET /share/list（sekey + 完整 dir 路径）列目录。
// 注意：dir 必须是完整路径（/sharelink<uk>-<fsid>/文件夹），只传文件夹
// 名会 errno 2；sign 在新版页里不存在，列目录不用 sign，用 sekey。
function parseBaiduLocals(text) {
    try {
        const m = /<script id="locals-data"[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(String(text || ''));
        if (!m) return null;
        const d = JSON.parse(m[1]);
        if (!d || !Array.isArray(d.file_list)) return null;
        return d;
    } catch (e) {
        return null;
    }
}

async function baiduListDir(shareid, shareUk, sekey, cookie, dirPath) {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    const q = 'uk=' + encodeURIComponent(shareUk) + '&shareid=' + encodeURIComponent(shareid)
        + '&sekey=' + encodeURIComponent(sekey || '')
        + '&dir=' + encodeURIComponent(dirPath)
        + '&page=1&num=1000&order=name&desc=0&showempty=0&view_mode=1&web=1';
    const headers = { 'User-Agent': UA, Referer: 'https://pan.baidu.com/s/1' };
    if (cookie) headers.Cookie = cookie;
    const r = await fetchJson('GET', 'https://pan.baidu.com/share/list?' + q, null, headers);
    if (!r || Number(r.errno) !== 0 || !Array.isArray(r.list)) return null;
    return r.list;
}

// 返回 [{ name, fs_id, path }]（name 已去扩展名、已拼子文件夹前缀），
// 任一步失败返回 null（调用方回落到原分享链接）。
async function expandBaiduShare(shareUrl) {
    try {
        const m = /pan\.baidu\.com\/s\/([A-Za-z0-9_\-]+)/i.exec(String(shareUrl || ''));
        if (!m) return null;
        const surl = m[1];
        const pwd = (/[?&](?:pwd|password)=([^&#\s]+)/i.exec(shareUrl) || [])[1] || '';
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
        const first = await fetchRaw('https://pan.baidu.com/s/' + surl + (pwd ? '?pwd=' + encodeURIComponent(pwd) : ''), { 'User-Agent': UA });
        if (!first.text) return null;
        let locals = parseBaiduLocals(first.text);
        let shareid = (locals && locals.shareid) ? String(locals.shareid) : '';
        let shareUk = (locals && locals.share_uk) ? String(locals.share_uk) : '';
        let sekey = '';
        let cookie = '';
        if (!locals) {
            // 带提取码的分享：先 verify 拿 randsk 再取分享页。
            if (!pwd) return null;
            shareid = shareid || ((/shareid\s*[:=]\s*"?(\d+)/i.exec(first.text) || [])[1] || '');
            shareUk = shareUk || ((/share_uk\s*[:=]\s*"?(\d+)/i.exec(first.text) || [])[1] || '');
            if (!shareid || !shareUk) return null;
            const vres = await fetchRaw('https://pan.baidu.com/share/verify?shareid=' + shareid + '&uk=' + shareUk,
                { 'User-Agent': UA, Referer: 'https://pan.baidu.com/share/init?surl=' + surl, 'Content-Type': 'application/x-www-form-urlencoded' },
                'POST', 'pwd=' + encodeURIComponent(pwd) + '&vcode=&vcode_str=');
            let randsk = '';
            try {
                const vj = JSON.parse(vres.text || '{}');
                if (vj && Number(vj.errno) === 0 && vj.randsk) randsk = decodeURIComponent(String(vj.randsk));
            } catch (e) { /* ignore */ }
            if (!randsk) randsk = getCookie(vres.headers, 'BDCLND');
            if (!randsk) return null;
            sekey = randsk;
            cookie = 'BDCLND=' + encodeURIComponent(randsk);
            const sp = await fetchRaw('https://pan.baidu.com/s/' + surl, { 'User-Agent': UA, Cookie: cookie });
            locals = parseBaiduLocals(sp.text || '');
            if (!locals) return null;
            shareid = String(locals.shareid || shareid);
            shareUk = String(locals.share_uk || shareUk);
        }
        // 根目录只有一个文件夹时它是分享本身的包装（嫁金钗的“叫金钗2026
        // 臻彩”），先拆开它，免得每集都重复带这个前缀。
        let rootEntries = locals.file_list || [];
        if (rootEntries.length === 1 && Number(rootEntries[0].isdir) === 1 && rootEntries[0].path) {
            const inner = await baiduListDir(shareid, shareUk, sekey, cookie, rootEntries[0].path);
            if (inner) rootEntries = inner;
        }
        const files = [];
        async function walk(entries, prefix, depth) {
            for (const e of entries) {
                if (files.length >= 200) return;
                const nm = e.server_filename || '';
                if (!nm) continue;
                if (Number(e.isdir) === 1) {
                    if (depth >= 3 || !e.path) continue;
                    const sub = await baiduListDir(shareid, shareUk, sekey, cookie, e.path);
                    if (sub) await walk(sub, prefix ? prefix + ' ' + nm : nm, depth + 1);
                } else if (Number(e.category) === 1 || isVideoFile(nm)) {
                    files.push({ name: (prefix ? prefix + ' ' : '') + stripVideoExt(nm), fs_id: e.fs_id, path: e.path });
                }
            }
        }
        await walk(rootEntries, '', 0);
        return files.length ? files : null;
    } catch (e) {
        return null;
    }
}

// ---- 夸克分享文件夹展开与直链（文档化接口，真机网络为准） ----
const QUARK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function quarkToken(pwd_id, passcode) {
    const r = await fetchJson('POST', 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/token',
        { pwd_id, passcode: passcode || '' },
        { 'Content-Type': 'application/json', Referer: 'https://pan.quark.cn/s/' + pwd_id, 'User-Agent': QUARK_UA });
    const st = r && r.data && r.data.stoken;
    return st || null;
}

async function quarkList(pwd_id, stoken, pdir_fid) {
    const r = await fetchJson('POST', 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail',
        { pwd_id, stoken, pdir_fid, _page: 1, _size: 100, _sort: 'file_type:asc,updated_at:desc' },
        { 'Content-Type': 'application/json', Referer: 'https://pan.quark.cn/s/' + pwd_id, 'User-Agent': QUARK_UA });
    const list = r && r.data && r.data.list;
    return Array.isArray(list) ? list : null;
}

async function quarkDownload(pwd_id, stoken, fid) {
    const r = await fetchJson('POST', 'https://drive-pc.quark.cn/1/clouddrive/file/download',
        { fids: [fid], pwd_id, stoken },
        { 'Content-Type': 'application/json', Referer: 'https://pan.quark.cn/s/' + pwd_id, 'User-Agent': QUARK_UA });
    const d = r && r.data;
    if (Array.isArray(d) && d[0] && d[0].download_url) return d[0].download_url;
    if (d && d.download_url) return d.download_url;
    return null;
}

// 返回 [{ name, pwd_id, passcode, fid }]，任一步失败返回 null。
async function expandQuarkShare(shareUrl) {
    try {
        const m = /pan\.quark\.cn\/s\/([A-Za-z0-9]+)/i.exec(String(shareUrl || ''));
        if (!m) return null;
        const pwd_id = m[1];
        const passcode = (/[?&](?:pwd|password)=([^&#\s]+)/i.exec(shareUrl) || [])[1] || '';
        const stoken = await quarkToken(pwd_id, passcode);
        if (!stoken) return null;
        const files = [];
        async function walk(pdir_fid, prefix, depth) {
            const list = await quarkList(pwd_id, stoken, pdir_fid);
            if (!list) return;
            for (const e of list) {
                if (files.length >= 200) return;
                const nm = e.file_name || '';
                if (!nm) continue;
                const isDir = e.dir === true || e.dir === 1;
                if (isDir) {
                    if (depth >= 3) continue;
                    await walk(e.fid, prefix ? prefix + ' ' + nm : nm, depth + 1);
                } else if (isVideoFile(nm)) {
                    files.push({ name: (prefix ? prefix + ' ' : '') + stripVideoExt(nm), pwd_id, passcode, fid: e.fid });
                }
            }
        }
        await walk(0, '', 0);
        return files.length ? files : null;
    } catch (e) {
        return null;
    }
}

export function createPanSpider(entry) {
    const cfg = entry || {};
    const key = cfg.key || 'py_pan_hub';
    const name = cfg.name || '网盘通用';
    const hosts = Array.isArray(cfg.hosts) ? cfg.hosts.filter(Boolean) : [];
    const pattern = PATTERNS[cfg.pattern] || PATTERNS.maccms;
    const classes = Array.isArray(cfg.classes) ? cfg.classes : [];
    const headers = { 'User-Agent': cfg.ua || UA_DEFAULT, Accept: 'text/html' };
    const maxLinks = Number(cfg.maxLinks) > 0 ? Number(cfg.maxLinks) : 0;

    // 探活状态只属于本实例：多个网盘条目各有自己的 hosts，绝不能共用全局。
    let activeHost = '';
    let hostAt = 0;

    async function resolveHost() {
        if (activeHost && Date.now() - hostAt < 10 * 60 * 1000) return activeHost;
        for (const host of hosts) {
            const html = await fetchText(pattern.probe(host), headers);
            if (html && pattern.probeRe.test(html)) {
                activeHost = host;
                hostAt = Date.now();
                return host;
            }
        }
        activeHost = activeHost || hosts[0] || '';
        hostAt = Date.now();
        return activeHost;
    }

    return {
        meta: { key, name, type: 3 },
        api: async (fastify) => {
            fastify.post('/init', async () => ({}));
            fastify.post('/home', async () => ({ class: classes, filters: {}, list: [] }));
            fastify.post('/category', async (request) => {
                const body = (request && request.body) || {};
                const tid = String(body.id || body.type_id || (classes[0] && classes[0].type_id) || '1').trim() || '1';
                const page = Math.max(1, parseInt(body.page, 10) || 1);
                const host = await resolveHost();
                if (!host) return { page, pagecount: page, limit: 20, total: 0, list: [] };
                let list = parseCards(await fetchText(pattern.category(host, tid, page), headers), host, pattern.cardRe);
                if (!list.length && pattern.categoryFallback) {
                    list = parseCards(await fetchText(pattern.categoryFallback(host, tid), headers), host, pattern.cardRe);
                }
                return { page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: list.length ? 9999 : 0, list };
            });
            fastify.post('/search', async (request) => {
                const body = (request && request.body) || {};
                const wd = String(body.wd || body.keyword || '').trim();
                const page = Math.max(1, parseInt(body.page, 10) || 1);
                if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
                const host = await resolveHost();
                if (!host) return { page, pagecount: page, limit: 20, total: 0, list: [] };
                const list = parseCards(await fetchText(pattern.search(host, wd, page), headers), host, pattern.cardRe);
                return { page, pagecount: page, limit: 20, total: list.length, list };
            });
            fastify.post('/detail', async (request) => {
                const body = (request && request.body) || {};
                const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids;
                const id = String(raw || '').split('@')[0].replace(/[^0-9A-Za-z]/g, '');
                if (!id) return { list: [] };
                const host = await resolveHost();
                if (!host) return { list: [] };
                const html = await fetchText(pattern.detail(host, id), headers);
                if (!html) return { list: [] };
                const parsed = parseDetail(html, host, id, name + ' ' + id, maxLinks);
                const vod = parsed.vod;
                if (!parsed.links.length) {
                    vod.vod_remarks = '详情页没抓到网盘链接';
                    return { list: [vod] };
                }
                const byProvider = new Map();
                for (const u of parsed.links) {
                    const pv = panProvider(u);
                    if (!byProvider.has(pv)) byProvider.set(pv, []);
                    byProvider.get(pv).push(u);
                }
                const providers = [...byProvider.keys()];
                vod.vod_play_from = providers.join('$$$');
                // 文件夹展开：百度/夸克分享若能列出文件，就把文件列成选集
                // （夸克选集的播放 id 是 quark: 令牌，/play 再换直链；百度
                // 选集的播放 id 仍是分享地址——百度文件直链拿不到，靠播放
                // 器自带百度模块去解）。展开失败时回落到原来的“分享N”。
                const epGroups = [];
                for (const pv of providers) {
                    const eps = [];
                    let shareIdx = 0;
                    for (const u of byProvider.get(pv)) {
                        shareIdx++;
                        let expanded = null;
                        if (pv === '百度') expanded = await expandBaiduShare(u);
                        else if (pv === '夸克') expanded = await expandQuarkShare(u);
                        if (expanded && expanded.length) {
                            for (const f of expanded) {
                                const nm = sanitizeEpName(f.name);
                                if (pv === '夸克') eps.push(`${nm}$quark:${f.pwd_id}:${f.passcode}:${f.fid}`);
                                else eps.push(`${nm}$${u}`);
                            }
                        } else {
                            eps.push(`分享${shareIdx}$${u}`);
                        }
                    }
                    epGroups.push(eps.join('#'));
                }
                vod.vod_play_url = epGroups.join('$$$');
                vod.vod_remarks = parsed.links.length + ' 个网盘';
                return { list: [vod] };
            });
            fastify.post('/play', async (request) => {
                const id = String((request && request.body && request.body.id) || '');
                if (!id) return { parse: 0, url: '' };
                // 夸克文件：现取 token 再换直链（直链才配 parse: 0）。
                if (id.startsWith('quark:')) {
                    const parts = id.split(':');
                    const pwd_id = parts[1] || '';
                    const passcode = parts[2] || '';
                    const fid = parts[3] || '';
                    if (pwd_id && fid) {
                        const stoken = await quarkToken(pwd_id, passcode);
                        if (stoken) {
                            const durl = await quarkDownload(pwd_id, stoken, fid);
                            if (durl) return { parse: 0, url: durl };
                        }
                        // 直链失败时回落到分享页，不带 parse，交给播放器
                        // 自带网盘模块去解（不要 parse: 0 直播 HTML）。
                        return { url: 'https://pan.quark.cn/s/' + pwd_id };
                    }
                    return { url: id };
                }
                // 分享页地址不是可播流：不声明 parse: 0，交给播放器自己
                // 的网盘解析层（用户在 App 网盘设置里登好的凭证）去解。
                return { url: id };
            });
        },
    };
}

export default createPanSpider;
