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
 * 播放说明（诚实边界）：猫源运行时没有 hmtv 的 pan.js 解析层（那个是
 *   Node fs/db/cookie 引擎，猫源蜘蛛禁 fs，装不上），所以详情出线方式与
 *   bundle 在「无 pan 层」时的兜底完全一致：每条分享各占一集
 *   （分享1$<分享地址>#分享2$…），/play 原样透传（{ parse: 0, url: id }）。
 *   也就是说：home/分类/详情/播放接口全通、分享链接真实出线，但 App 内
 *   直播还需网盘解析层，那是本文件之外的缺口，待真机/后续再定。
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
        const url = String(m[0]).replace(/[)）,，。;；]+$/, '');
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
        meta: { key, name, type: 40 },
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
                vod.vod_play_from = '网盘分享';
                vod.vod_play_url = parsed.links.map((u, i) => `分享${i + 1}$${u}`).join('#');
                vod.vod_remarks = parsed.links.length + ' 个网盘';
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

export default createPanSpider;
