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
 *   { parse: 0, url: 直链 }。详情侧：百度/夸克分享优先走中枢 Worker
 *   服务端展开（GET 中枢 /api/pan/expand，见 v12；App 内直接调百度
 *   verify/locals-data 与夸克 token/detail 在用户手机上全部失败，
 *   只剩“分享1”，故挪到 Worker 做；Worker 侧百度 36 集、夸克 19 集
 *   均已实测通）。Worker 失败时回落本地展开（百度 verify + sekey
 *   列目录、夸克 token/detail/download），再失败回落原分享链接，
 *   不破坏原有出线。百度文件级精准播放（点第 5 集就播第 5 集）
 *   仍缺直链：百度直链要 sign，新版分享页里不暴露 sign，蜘蛛侧
 *   拿不到，只能靠播放器自带百度模块去解分享地址；夸克文件经
 *   Worker 单文件直链（/api/pan/resolve-file）能拿到直链时点哪集
 *   播哪集，游客直链有文件大小限制（大文件会失败回落分享地址，
 *   需夸克登录态才能播大文件）。
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

// 合并多组响应头的全部 Set-Cookie（后者覆盖同名），丢弃空值，输出 Cookie 头。
// App 内 axios 的 set-cookie 可能是数组或单串，单串里多个 cookie 按“逗号 +
// 名=”切分；fetch 兜底无头信息时返回空串（此时本地展开注定失败，走 Worker）。
function collectAllCookies() {
    const m = new Map();
    for (const headers of arguments) {
        try {
            const hs = headers || {};
            for (const k of Object.keys(hs)) {
                if (k.toLowerCase() !== 'set-cookie') continue;
                const v = hs[k];
                const arr = Array.isArray(v) ? v : [String(v)];
                for (const sc of arr) {
                    for (const part of String(sc).split(/,(?=[A-Za-z0-9_\-!#$%&'*+.^`|~]+=)/)) {
                        const s = part.split(';')[0].trim();
                        if (!s) continue;
                        const i = s.indexOf('=');
                        if (i > 0 && s.slice(i + 1).trim() !== '') m.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
                    }
                }
            }
        } catch (e) {}
    }
    const out = [];
    for (const [k, v] of m) out.push(k + '=' + v);
    return out.join('; ');
}

async function fetchJson(method, url, data, headers, timeoutMs) {
    const h = headers || {};
    const to = timeoutMs || 15000;
    try {
        const resp = method === 'POST'
            ? await req.post(url, data, { headers: h, timeout: to })
            : await req.get(url, { headers: h, timeout: to });
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
// 流程（嫁金钗一案实测修正）：分享页 302 到 /share/init（init 页含
// shareid/share_uk）→ POST /share/verify（pwd）得 randsk（= sekey，
// 同时是 BDCLND）→ 带首次响应 + verify 响应的全部 Set-Cookie 合并
// 再 GET 分享页（只发 BDCLND 会被重定向回 init 页，拿不到 file_list）
// → 根目录 file_list（旧格式在 <script id="locals-data">，新格式在
// 页面 JSON 的 file_list 数组，需双格式解析；先出现的同名数组是静态
// 资源清单，元素为字符串，要跳过）→ 子文件夹用 GET /share/list
// （sekey + 完整 dir 路径）列目录。注意：dir 必须是完整路径
// （/sharelink<uk>-<fsid>/文件夹），只传文件夹名会 errno 2；新旧
// 格式页给的路径 uk 段不同（真实 uk 与 0），列目录失败时换一种再试；
// sign 在新版页里不存在，列目录不用 sign，用 sekey。
// 从 text[start]（应为 [ 或 {）起按字符串感知的配对扫描抽 JSON，失败返回 null。
function extractBalanced(text, start, open, close) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = start; j < text.length; j++) {
        const c = text[j];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(text.slice(start, j + 1)); } catch (e) { return null; }
            }
        }
    }
    return null;
}
// 百度分享页根目录解析（双格式，见上；只返回 file_list，shareid/share_uk
// 调用方已从 init 页正则拿到，不依赖此处）。
function parseBaiduLocals(text) {
    const src = String(text || '');
    try {
        const m = /<script id="locals-data"[^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/i.exec(src);
        if (m) {
            const d = JSON.parse(m[1]);
            if (d && Array.isArray(d.file_list)) return d;
        }
    } catch (e) {}
    try {
        let pos = 0;
        for (;;) {
            const k = src.indexOf('"file_list"', pos);
            if (k < 0) break;
            const b = src.indexOf('[', k);
            if (b < 0) break;
            const arr = extractBalanced(src, b, '[', ']');
            if (Array.isArray(arr) && arr.length && arr.every((x) => x && typeof x === 'object' && x.server_filename)) {
                return { file_list: arr };
            }
            pos = b + 1;
        }
    } catch (e) {}
    return null;
}

async function baiduListDirOnce(shareid, shareUk, sekey, cookie, dirPath) {
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
// 列目录：先用页面给的完整路径；失败时再试 /sharelink0- 形式。
async function baiduListDir(shareid, shareUk, sekey, cookie, dirPath) {
    const r1 = await baiduListDirOnce(shareid, shareUk, sekey, cookie, dirPath);
    if (r1) return r1;
    const alt = String(dirPath || '').replace(/^\/sharelink\d+-/, '/sharelink0-');
    if (alt && alt !== dirPath) return await baiduListDirOnce(shareid, shareUk, sekey, cookie, alt);
    return null;
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
            // 关键：只发 BDCLND 会被重定向回 init 页拿不到 file_list，必须发
            // 首次响应 + verify 响应的全部 Set-Cookie 合并（后者覆盖同名）。
            cookie = collectAllCookies(first.headers, vres.headers);
            if (!cookie) cookie = 'BDCLND=' + encodeURIComponent(randsk);
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
    // 注意：detail 接口只接受 GET，POST 回 405（2026-10-25 实测）；
    // 旧代码用 POST，本地夸克展开因此恒失败。GET 形式与中枢 Worker 一致。
    const q = 'pr=ucpro&fr=pc&pwd_id=' + encodeURIComponent(pwd_id) + '&stoken=' + encodeURIComponent(stoken)
        + '&pdir_fid=' + encodeURIComponent(pdir_fid) + '&force=0&_page=1&_size=100&_sort=file_type%3Aasc%2Cupdated_at%3Adesc';
    const r = await fetchJson('GET', 'https://drive-pc.quark.cn/1/clouddrive/share/sharepage/detail?' + q,
        null, { Referer: 'https://pan.quark.cn/s/' + pwd_id, 'User-Agent': QUARK_UA });
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
    // 中枢 Worker 地址（router 注入 hub.js 的 HUB_WORKER_BASE；无参调用时为空，
    // 此时不走 Worker，只走本地展开）。Worker 展开是 GET，与 /api/config 同
    // 域名，App 内已验证可达；任一步失败都回落本地展开/原分享。
    const workerBase = String(cfg.workerBase || '').replace(/\/+$/, '');

    // 中枢服务端展开：GET /api/pan/expand?url=，返回 { ok, provider, files: [{ name, play }] }。
    // 百度 play 为 baiduplay: 令牌（/play 经中枢换直链，失败回落分享地址走模块），
    // 夸克 play 为 qfile: 令牌（/play 经中枢换直链）。百度展开约 12 秒，超时放宽到 30 秒。
    async function expandViaWorker(shareUrl) {
        if (!workerBase) return null;
        try {
            const r = await fetchJson('GET', workerBase + '/api/pan/expand?url=' + encodeURIComponent(shareUrl), null, {}, 30000);
            if (r && r.ok && Array.isArray(r.files) && r.files.length) return r.files;
        } catch (e) {}
        return null;
    }

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
                // 去重 + 限流（参考猫源模式）：同一厂商的重复分享只展开一次，
                // 每厂商最多展开 3 条分享，避免几十条分享把详情拖垮。
                for (const pv of providers) {
                    const seen = new Set();
                    const uniq = [];
                    for (const u of byProvider.get(pv)) {
                        if (seen.has(u)) continue;
                        seen.add(u);
                        uniq.push(u);
                        if (uniq.length >= 3) break;
                    }
                    byProvider.set(pv, uniq);
                }
                vod.vod_play_from = providers.join('$$$');
                // 文件夹展开：百度/夸克分享若能列出文件，就把文件列成选集
                // （优先中枢 Worker 展开：Worker 版百度选集的播放 id 是 baiduplay:
                // 令牌、夸克选集是 qfile: 令牌，/play 经中枢换直链；本地版夸克
                // 选集是 quark: 令牌，/play 本地换直链；本地版百度选集的播放 id
                // 仍是分享地址，靠播放器自带百度模块去解）。展开失败时
                // 回落到原来的“分享N”。
                // Worker 展开并行化：百度约 12 秒、夸克约 4 秒，串行会拖慢详情；
                // 先把所有百度/夸克分享的 Worker 展开并行发出，循环里只查表。
                const workerResults = new Map();
                if (workerBase) {
                    const jobs = [];
                    for (const pv of providers) {
                        if (pv !== '百度' && pv !== '夸克') continue;
                        for (const u of byProvider.get(pv)) jobs.push([pv, u]);
                    }
                    const outs = await Promise.all(jobs.map(async ([pv, u]) => {
                        try { return [pv, u, await expandViaWorker(u)]; } catch (e) { return [pv, u, null]; }
                    }));
                    for (const [pv, u, files] of outs) if (files && files.length) workerResults.set(pv + '\n' + u, files);
                }
                const epGroups = [];
                for (const pv of providers) {
                    const eps = [];
                    let shareIdx = 0;
                    for (const u of byProvider.get(pv)) {
                        shareIdx++;
                        let expanded = workerResults.get(pv + '\n' + u) || null;
                        let fromWorker = !!expanded;
                        if (!expanded) {
                            if (pv === '百度') expanded = await expandBaiduShare(u);
                            else if (pv === '夸克') expanded = await expandQuarkShare(u);
                        }
                        if (expanded && expanded.length) {
                            for (const f of expanded) {
                                const nm = sanitizeEpName(f.name);
                                if (fromWorker) eps.push(`${nm}$${f.play}`);
                                else if (pv === '夸克') eps.push(`${nm}$quark:${f.pwd_id}:${f.passcode}:${f.fid}`);
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
                // 百度文件（Worker 展开版）：baiduplay: 令牌经中枢 /api/pan/baidu-play
                // 换直链（直链才配 parse: 0）；失败回落分享地址，不带 parse，走模块。
                if (id.startsWith('baiduplay:')) {
                    const rest = id.slice('baiduplay:'.length);
                    const bar = rest.indexOf('|');
                    const shareUrl = bar >= 0 ? rest.slice(0, bar) : rest;
                    const epName = bar >= 0 ? rest.slice(bar + 1) : '';
                    if (shareUrl && workerBase) {
                        try {
                            const r = await fetchJson('GET', workerBase + '/api/pan/baidu-play?url=' + encodeURIComponent(shareUrl) + '&name=' + encodeURIComponent(epName), null, {}, 30000);
                            if (r && r.ok && r.url) return { parse: 0, url: r.url };
                        } catch (e) {}
                    }
                    return { url: shareUrl };
                }
                // 夸克文件（Worker 展开版）：qfile: 令牌经中枢 /api/pan/resolve-file
                // 换直链（直链才配 parse: 0）；失败回落分享页，不带 parse。
                if (id.startsWith('qfile:')) {
                    const parts = id.split(':');
                    const pwd_id = parts[1] || '';
                    const passcode = parts[2] || '';
                    const fid = parts[3] || '';
                    if (pwd_id && fid && workerBase) {
                        try {
                            const r = await fetchJson('GET', workerBase + '/api/pan/resolve-file?pwd_id=' + encodeURIComponent(pwd_id) + '&passcode=' + encodeURIComponent(passcode) + '&fid=' + encodeURIComponent(fid), null, {});
                            if (r && r.ok && r.url) return { parse: 0, url: r.url };
                        } catch (e) {}
                    }
                    return { url: 'https://pan.quark.cn/s/' + pwd_id };
                }
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
