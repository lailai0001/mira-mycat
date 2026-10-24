import req from '../../util/req.js';

/**
 * 原盘网盘（pomo_pan）· hmtv 全自主移植 E 批
 * ---------------------------------------------------------------------------
 * 站点：https://pomo.mom（WordPress + 影视主题，4K 原盘），站方自有域名，
 * 无作者中转依赖。bundle 原体为 Node 式 module.exports + fastify.pan 依赖，
 * 本文件按 mira-mycat 蜘蛛契约改写：ESM createSpider、框架 req 主栈、
 * fetch 仅 typeof 保护的兜底（App 内无 fetch 时绝不触碰）、禁 fs/path/vm。
 *
 * 异形说明：卡片为 <div class="bg-cardbg"> 块 + 海报打分（轮播/站标/剧照
 * 扣分），通用蜘蛛 pan_hub.js 不覆盖本站，故单独立蜘蛛（中枢报告既定方案）。
 *
 * 播放诚实边界：猫源运行时没有 hmtv 的 pan.js 解析层，故详情出线与
 * pan_hub.js 的兜底一致：网盘分享每条各占一集（分享1$<地址>#…，线路名
 * 「网盘分享」），磁力另起「磁力」线路；/play 原样透传。App 内直播仍需
 * 网盘解析层，那是本文件之外的缺口，待真机再定。
 */

const HOSTS = ['https://pomo.mom'];

const UA =
    'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

// type_id 就是路径 slug
const CLASSES = [
    { type_id: 'huayurm', type_name: '华语热映' },
    { type_id: 'dianshiju', type_name: '剧集' },
    { type_id: 'donghuadadiany', type_name: '动画大电影' },
    { type_id: 'jiating', type_name: '家庭' },
    { type_id: 'lengmenjiapian', type_name: '冷门佳片' },
    { type_id: 'paihangbang', type_name: '排行榜' },
];

const MAX_MAGNETS = 30;

const PAN_RE =
    /https?:\/\/(?:pan\.quark\.cn|drive\.uc\.cn|pan\.baidu\.com|115cdn\.com|115\.com|anxia\.com|aliyundrive\.com|alipan\.com|cloud\.189\.cn|caiyun\.139\.com|pan\.xunlei\.com)\/[^\s"'<>\\]+/gi;
const MAG_RE = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^\s"'<>\\]*/gi;

let activeHost = '';
let hostAt = 0;

async function fetchText(url, timeout) {
    if (!url) return '';
    try {
        const resp = await req.get(url, {
            headers: { 'User-Agent': UA, Accept: 'text/html' },
            timeout: timeout || 20000,
            responseType: 'text',
        });
        const d = resp && resp.data;
        if (typeof d === 'string' && d) return d;
    } catch (e) {
        // 落入兜底
    }
    try {
        if (typeof fetch === 'undefined') return '';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        try {
            const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctrl.signal });
            return await r.text();
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        return '';
    }
}

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
    // 站点偶尔会在文件名里留空格（例：p2934500802 (1).webp），补成 %20，壳子那边才稳
    const s = String(u || '').replace(/\\\//g, '/').replace(/\s+/g, '%20').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    return String(host || '').replace(/\/+$/, '') + (s.charAt(0) === '/' ? '' : '/') + s;
}

// ---------------------------------------------------------------- 封面（vod_pic）
// 2026-10 站点改版后的图片结构（实测 home/category/search/detail 一致）：
//   · 列表卡片  <div class="bg-cardbg ..."> → <a href="/<id>"> → <img src="/content/uploadfile/db/poster_xxx.jpg" alt="片名">
//   · 顶部轮播  <img class="carousel-media ..." src="https://cdnjson.com/..."> → <h1><a href="/<id>">片名 (年份)</a></h1>
//   · 详情页    没有 og:image，海报是正文里 alt=片名 的那张 /content/uploadfile/db/ 图
// 旧写法只在锚点后 600 字符里取第一个 src：带 TOP 徽标的卡片图片位置更靠后 → vod_pic 为空；
// 轮播里的同名条目又会先被记下并占位。下面改成「卡片块优先 + 海报打分」，两种结构都能取到海报。

const IMG_TAG_SRC = '<img\\b[^>]*>';
const CARD_MARKERS = ['<div class="bg-cardbg', 'class="module-item', 'class="public-list-box', 'class="stui-vodlist__box'];

function htmlText(s) {
    return decodeEntities(String(s == null ? '' : s).replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function imgSrc(tag) {
    const m =
        /\bdata-original="([^"]+)"/i.exec(tag) ||
        /\bdata-lazy-src="([^"]+)"/i.exec(tag) ||
        /\bdata-src="([^"]+)"/i.exec(tag) ||
        /\bsrc="([^"]+)"/i.exec(tag);
    const s = m ? decodeEntities(m[1]).trim() : '';
    return /^(?:data:|javascript:|about:)/i.test(s) ? '' : s;
}

function imgAlt(tag) {
    return decodeEntities((/\balt="([^"]*)"/i.exec(tag) || [])[1] || '').trim();
}

function imgClass(tag) {
    return (/class="([^"]*)"/i.exec(tag) || [])[1] || '';
}

// 去掉年份和空白后再比片名，片子对得上才加分
function normName(s) {
    return decodeEntities(String(s == null ? '' : s))
        .replace(/[（(]\s*\d{4}\s*[)）]/g, '')
        .replace(/[\s·・:：]+/g, '')
        .trim();
}

function picScore(tag, name) {
    const src = imgSrc(tag);
    if (!src) return -1e9;
    if (/logo/i.test(src)) return -1000; // 站标
    let s = 1;
    if (/\/content\/uploadfile\/db\//i.test(src)) s += 10; // 海报库
    if (/carousel|hero|banner/i.test(imgClass(tag))) s -= 6; // 轮播横图
    if (/\/still_/i.test(src)) s -= 3; // 剧照
    if (/\/content\/uploadfile\/20\d{4}\//i.test(src)) s -= 2; // 站内 banner 图
    const a = normName(imgAlt(tag));
    const b = normName(name);
    if (a && b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0)) s += 6;
    return s;
}

// 一段 HTML 里挑最像海报的一张，返回 { url, score }
function pickPic(text, name) {
    let url = '';
    let score = -1e9;
    const re = new RegExp(IMG_TAG_SRC, 'gi');
    let m;
    while ((m = re.exec(text))) {
        const sc = picScore(m[0], name);
        if (sc > score) {
            score = sc;
            url = imgSrc(m[0]);
        }
    }
    if (!url || score <= -50) return { url: '', score: -1e9 }; // 只剩站标就当没图
    return { url, score };
}

// 卡片的片名：h1-h4 → 锚点 title → 锚点文字 → 海报 alt
function cardName(block) {
    const h = (/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(block) || [])[1];
    if (h) {
        const t = htmlText(h);
        if (t) return t;
    }
    const at = (/\btitle="([^"]+)"/i.exec(block) || [])[1];
    if (at) {
        const t = decodeEntities(at).trim();
        if (t) return t;
    }
    const im = (/<img[^>]*\balt="([^"]+)"/i.exec(block) || [])[1];
    return im ? decodeEntities(im).trim() : '';
}

// 同名条目合并取名：只认同前缀且只差年份/后缀那种，避免拼出怪名字
function betterName(a, b) {
    if (!a) return b || '';
    if (!b) return a;
    if (b.length > a.length && b.indexOf(a) === 0 && b.length - a.length <= 12) return b;
    if (a.length > b.length && a.indexOf(b) === 0) return a;
    return a;
}

// 详情页封面：有 og:image 就用它；当前主题没有，退回「alt=片名」的那张海报
function pickDetailPic(html, host, name) {
    const meta =
        (/<meta[^>]+(?:property|name)="(?:og:image|og:image:secure_url|twitter:image)"[^>]+content="([^"]+)"/i.exec(html) || [])[1] ||
        (/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="(?:og:image|twitter:image)"/i.exec(html) || [])[1] ||
        '';
    if (meta) return abs(host, meta);
    return abs(host, pickPic(html, name).url);
}

async function resolveHost(force) {
    if (!force && activeHost && Date.now() - hostAt < 10 * 60 * 1000) return activeHost;
    for (const host of HOSTS) {
        const html = await fetchText(host + '/', 8000);
        if (/\/\d{2,6}["']/.test(html)) {
            activeHost = host;
            hostAt = Date.now();
            return host;
        }
    }
    activeHost = activeHost || HOSTS[0];
    hostAt = Date.now();
    return activeHost;
}

// 列表卡片：href="/3962" title="片名"
function parseCards(html, host) {
    const src = String(html || '');
    const out = [];
    const byId = new Map();
    const scoreById = new Map();

    const add = (id, name, pick) => {
        if (!id) return;
        let it = byId.get(id);
        if (!it) {
            it = { vod_id: id, vod_name: '', vod_pic: '', vod_remarks: '' };
            byId.set(id, it);
            out.push(it);
        }
        it.vod_name = betterName(it.vod_name, name || '');
        if (pick && pick.url && pick.score > (scoreById.has(id) ? scoreById.get(id) : -1e9)) {
            it.vod_pic = abs(host, pick.url);
            scoreById.set(id, pick.score);
        }
    };

    // 1) 卡片块：当前主题一块一卡，块内 href 和海报一一对应，最可靠
    const anchorOf = /<a[^>]+href="(?:https?:\/\/[^"\/]+)?\/(\d{2,6})"[^>]*>/i;
    let cardsFound = false;
    for (const marker of CARD_MARKERS) {
        const parts = src.split(marker);
        if (parts.length < 4) continue; // 少于 3 张卡就不认这个标记
        cardsFound = true;
        for (let i = 1; i < parts.length; i++) {
            const block = parts[i];
            const am = anchorOf.exec(block);
            if (!am) continue;
            const name = cardName(block);
            add(am[1], name, pickPic(block, name));
        }
        break;
    }

    // 2) 兜底/补漏：没有卡片容器的主题全靠这一步；有卡片时用它捡回「只在轮播里出现」的条目
    const re = new RegExp(anchorOf.source, 'gi');
    let m;
    while ((m = re.exec(src))) {
        const id = m[1];
        const tail = src.slice(m.index, Math.min(src.length, m.index + 1200));
        const inner = tail.slice(m[0].length);
        const close = inner.search(/<\/a>/i);
        const textIn = close === -1 ? '' : htmlText(inner.slice(0, close));
        const name = textIn && textIn.length <= 60 ? textIn : '';
        // 轮播的图在锚点前面，卡片的图在锚点后面，两边都看，取得分高的
        const back = pickPic(src.slice(Math.max(0, m.index - 1200), m.index), name);
        const fwd = pickPic(tail, name);
        const pick = back.score > fwd.score ? back : fwd;
        if (byId.has(id)) add(id, name, pick);
        else if (!cardsFound) add(id, name, pick);
        else if (name && pick.url) add(id, name, pick); // 有卡片时只收「有名字 + 真有图」的，别捡到年份/标签链接
    }

    return out;
}

function parseDetail(html, host, id) {
    const name = decodeEntities(
        (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || (/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || ''
    )
        .replace(/<[^>]+>/g, '')
        .replace(/\s*-\s*4K原盘免费下载\s*$/i, '')
        .trim();

    const pic = pickDetailPic(html, host, name);
    const content = decodeEntities(
        (/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html) || [])[1] || ''
    );

    const text = String(html || '').replace(/&amp;/g, '&').replace(/\\\//g, '/');
    const links = [];
    const seen = new Set();
    let m;
    const rePan = new RegExp(PAN_RE.source, 'gi');
    while ((m = rePan.exec(text))) {
        const url = String(m[0]).replace(/[)）,，。;；]+$/, '');
        if (seen.has(url)) continue;
        seen.add(url);
        links.push(url);
    }
    const magnets = [];
    const seenMag = new Set();
    const reMag = new RegExp(MAG_RE.source, 'gi');
    while ((m = reMag.exec(text))) {
        const url = String(m[0]).replace(/[)）,，。;；]+$/, '');
        if (seenMag.has(url)) continue;
        seenMag.add(url);
        magnets.push(url);
    }

    return {
        vod: { vod_id: id, vod_name: name || '原盘资源 ' + id, vod_pic: pic, vod_content: content },
        links,
        magnets: magnets.slice(0, MAX_MAGNETS),
    };
}

export default function createSpider() {
    return {
        meta: { key: 'py_pomo_pan', name: '💿原盘·4K', type: 40 },
        api: async (fastify) => {
            fastify.post('/init', async () => ({}));

            fastify.post('/home', async () => ({ class: CLASSES, filters: {}, list: [] }));

            fastify.post('/category', async (request) => {
                const body = (request && request.body) || {};
                const tid = String(body.id || body.type_id || 'huayurm').trim();
                const page = Math.max(1, parseInt(body.page, 10) || 1);
                const host = await resolveHost();
                const url = page <= 1 ? `${host}/${encodeURIComponent(tid)}` : `${host}/${encodeURIComponent(tid)}/page/${page}`;
                const list = parseCards(await fetchText(url), host);
                return { page, pagecount: list.length >= 15 ? page + 1 : page, limit: 20, total: list.length ? 9999 : 0, list };
            });

            fastify.post('/search', async (request) => {
                const body = (request && request.body) || {};
                const wd = String(body.wd || body.keyword || '').trim();
                const page = Math.max(1, parseInt(body.page, 10) || 1);
                if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
                const host = await resolveHost();
                // 2026-10 改版：站点搜索参数从 ?s= 改成 ?keyword=（?s= 会被忽略、恒返回首页默认列表）
                const url = `${host}/?keyword=${encodeURIComponent(wd)}${page > 1 ? '&paged=' + page : ''}`;
                const list = parseCards(await fetchText(url), host);
                return { page, pagecount: page, limit: 20, total: list.length, list };
            });

            fastify.post('/detail', async (request) => {
                const body = (request && request.body) || {};
                const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids;
                const id = String(raw || '').split('@')[0].replace(/[^0-9A-Za-z]/g, '');
                if (!id) return { list: [] };

                const host = await resolveHost();
                const html = await fetchText(`${host}/${id}`);
                if (!html) return { list: [] };

                const parsed = parseDetail(html, host, id);
                const vod = parsed.vod;

                const lines = [];
                const urls = [];
                // 网盘线路：无 pan.js 解析层时与 pan_hub.js 兜底一致，每条分享各占一集
                if (parsed.links.length) {
                    lines.push('网盘分享');
                    urls.push(parsed.links.map((u, i) => `分享${i + 1}$${u}`).join('#'));
                }
                // 磁力线路：播放直接返回 magnet
                if (parsed.magnets.length) {
                    lines.push('磁力');
                    urls.push(parsed.magnets.map((m, i) => `磁力${i + 1}$${m}`).join('#'));
                }

                if (!lines.length) {
                    vod.vod_remarks = (vod.vod_remarks ? vod.vod_remarks + ' · ' : '') + '没抓到网盘/磁力链接';
                    return { list: [vod] };
                }

                vod.vod_play_from = lines.join('$$$');
                vod.vod_play_url = urls.join('$$$');
                vod.vod_remarks =
                    parsed.links.length + ' 个网盘' +
                    (parsed.magnets.length ? ' · ' + parsed.magnets.length + ' 个磁力' : '');
                return { list: [vod] };
            });

            fastify.post('/play', async (request) => {
                const id = String((request && request.body && request.body.id) || '');
                if (!id) return { parse: 0, url: '' };
                return { parse: 0, url: id };
            });
        },
    };
}
