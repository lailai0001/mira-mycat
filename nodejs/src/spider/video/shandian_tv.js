import req from '../../util/req.js';

/**
 * 闪电（shandian_tv）· hmtv 全自主移植专项批
 * ---------------------------------------------------------------------------
 * 站点：玩偶哥哥共享站（与 E 批玩偶网盘同一 MacCMS 站，见 bundle 原注），
 * 直连站方自有域名（EdgeOne 主域 + 备用域），无作者中转依赖。
 * bundle 原体为 drpy 规则重写版，依赖 hmtv 引擎的 DB（cookie 回退）与
 * pan.js 网盘解析层；猫源运行时两者皆无，本文件按猫源契约改写：
 *   · DB cookie 回退删除（无 DB 可读），UA 恒用站方要求的 WebKlt 拼写；
 *   · 网盘层改用猫源兜底：每条分享各占一集（线路名「网盘分享」，与 E 批
 *     网盘源一致），集名取网盘种类；/play 原样透传分享地址；
 *   · meta.type 由 bundle 的 3 改为 40：本站只有网盘分享、无在线播放，
 *     归入 pan.sites，与玩偶网盘同口径；
 *   · HTTP 走框架 req 主栈，fetch 仅 typeof 保护的兜底；禁 fs/path/vm。
 * 注意：本站与 E 批玩偶网盘（py_wanou_pan）为同一站、分类表不同
 * （本站多了臻彩/纪录片等 drpy 规则分类），属重复覆盖，用户可用中枢
 * DISABLED 关掉其中一个。
 */


const HOSTS = ['http://edgeong.wogg.333232.xyz', 'https://woggpan.888484.xyz'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKlt/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const CLASSES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '剧集' },
  { type_id: '3', type_name: '动漫' },
  { type_id: '44', type_name: '臻彩' },
  { type_id: '6', type_name: '短剧' },
  { type_id: '4', type_name: '综艺' },
  { type_id: '46', type_name: '纪录片' },
  { type_id: '5', type_name: '音乐' },
];

// 网盘分享链接（详情页里可能是 data-clipboard-text / a.fzlj / <p> 纯文本 / 裸域名）
const PAN_HOST_SRC =
  '(?:www\\.)?(?:' +
  'pan\\.quark\\.cn|' + // 夸克
  'drive\\.uc\\.cn|' + // UC
  '(?:alipan|aliyundrive)\\.com|' + // 阿里云盘
  '115\\.com|115cdn\\.com|anxia\\.com|' + // 115 / 115cdn / anxia
  'pan\\.baidu\\.com|eyun\\.baidu\\.com|' + // 百度
  '(?:[a-z0-9-]+\\.)*cloud\\.189\\.cn|' + // 天翼
  '(?:caiyun|yun)\\.139\\.com|' + // 移动
  'pan\\.xunlei\\.com|' + // 迅雷
  '(?:123pan|123684|123865)\\.(?:com|cn)|' + // 123
  '(?:[a-z0-9-]+\\.)*(?:lanzou[a-z]?|lanzn)\\.(?:com|cn)' + // 蓝奏
  ')';
const PAN_RE = new RegExp(
  '(?:https?:\\/\\/)?' + PAN_HOST_SRC + "\\/[^\\s\"'<>\\\\，。；、）】：！？（【《\\u4e00-\\u9fff]+",
  'gi'
);
const CF_RE = /Just a moment|__cf_chl|<title>\s*(?:请稍候|Just a moment)|Attention Required|Enable JavaScript and cookies/i;

let activeHost = '';
let hostAt = 0;

// ---------------------------------------------------------------- 基础工具

function headers(extra) {
  const h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  return Object.assign(h, extra || {});
}

async function reqText(url, opt) {
  const o = opt || {};
  const headers = o.headers || {};
  const method = (o.method || 'GET').toUpperCase();
  try {
    const resp =
      method === 'POST'
        ? await req.post(url, o.body != null ? o.body : '', { headers, timeout: o.timeout || 15000, responseType: 'text', validateStatus: () => true })
        : await req.get(url, { headers, timeout: o.timeout || 15000, responseType: 'text', validateStatus: () => true });
    const d = resp && resp.data;
    return {
      status: (resp && resp.status) || 200,
      text: typeof d === 'string' ? d : String(d || ''),
      headers: (resp && resp.headers) || {},
    };
  } catch (e) {
    // 落入 fetch 兜底
  }
  try {
    if (typeof fetch === 'undefined') return { status: 0, text: '', headers: {} };
    let timer = null;
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (ctrl && typeof setTimeout === 'function') timer = setTimeout(() => ctrl.abort(), o.timeout || 15000);
      const r = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? o.body : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
      const text = await r.text();
      const rh = {};
      r.headers.forEach((v, k) => { rh[k] = v; });
      return { status: r.status, text, headers: rh };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (e) {
    return { status: 0, text: '', headers: {} };
  }
}

function sleep(ms) {
  if (typeof setTimeout === 'function') return new Promise((r) => setTimeout(r, ms));
  return Promise.resolve();
}

// 站点 GET（跟随最多 3 次 3xx）
async function siteGet(url, extra, timeout) {
  let target = url;
  for (let i = 0; i < 4; i++) {
    const r = await reqText(target, { headers: headers(extra), timeout: timeout || 15000 });
    const loc = r.headers && (r.headers.location || r.headers.Location);
    if (r.status >= 300 && r.status < 400 && loc) {
      try {
        target = new URL(String(loc), target).toString();
        continue;
      } catch (e) {
        return r;
      }
    }
    return r;
  }
  return { status: 0, text: '', headers: {} };
}

function abs(host, u) {
  const s = String(u || '')
    .replace(/\\\//g, '/')
    .trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  return String(host || '').replace(/\/+$/, '') + (s.charAt(0) === '/' ? '' : '/') + s;
}

function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => {
      try {
        return String.fromCharCode(parseInt(h, 16));
      } catch (e) {
        return m;
      }
    })
    .replace(/&#(\d+);/g, (m, d) => {
      try {
        return String.fromCharCode(Number(d));
      } catch (e) {
        return m;
      }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(s) {
  return decodeEntities(
    String(s || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

// ---------------------------------------------------------------- 站点解析

async function resolveHost(force) {
  if (!force && activeHost && Date.now() - hostAt < 10 * 60 * 1000) return activeHost;
  for (const host of HOSTS) {
    const r = await siteGet(host + '/vodshow/1-----------.html', null, 12000);
    if (r.status === 200 && /\/voddetail\/\d+\.html/i.test(r.text)) {
      activeHost = host;
      hostAt = Date.now();
      return host;
    }
  }
  activeHost = activeHost || HOSTS[0];
  hostAt = Date.now();
  return activeHost;
}

function pickPic(seg, host) {
  const m = /\bdata-src="([^"]+)"/i.exec(seg) || /\bsrc="([^"]+)"/i.exec(seg);
  let pic = m ? decodeEntities(m[1]) : '';
  if (!pic) return '';
  if (pic.indexOf('/db.php?') >= 0) {
    const q = /[?&]url=([^&]+)/i.exec(pic);
    if (q) {
      try {
        pic = decodeURIComponent(q[1]);
      } catch (e) {
        /* 忽略 */
      }
    }
  }
  return abs(host, pic);
}

// 列表卡片：<div class="module-item"> 里一定有 /voddetail/<id>.html
function parseCards(html, host) {
  const out = [];
  const seen = new Set();
  const chunks = String(html || '').split('<div class="module-item"');
  for (let i = 1; i < chunks.length; i++) {
    const seg = chunks[i].slice(0, 2000);
    const m = /\/voddetail\/(\d+)\.html/i.exec(seg);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    let name = '';
    const t = /\btitle="([^"]*)"/i.exec(seg);
    if (t) name = decodeEntities(t[1]);
    if (!name) {
      const n = /<div class="module-item-style video-name">\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(seg);
      if (n) name = stripTags(n[1]);
    }
    if (!name) continue;
    const remarkM = /<div class="module-item-text">([\s\S]*?)<\/div>/i.exec(seg);
    seen.add(id);
    out.push({
      vod_id: id,
      vod_name: name,
      vod_pic: pickPic(seg, host),
      vod_remarks: remarkM ? stripTags(remarkM[1]) : '',
    });
  }
  return out;
}

// 搜索结果卡片：<div class="module-search-item">（结构跟首页/分类不同）
function parseSearchCards(html, host) {
  const out = [];
  const seen = new Set();
  const chunks = String(html || '').split('<div class="module-search-item"');
  for (let i = 1; i < chunks.length; i++) {
    const seg = chunks[i].slice(0, 3000);
    const m = /\/voddetail\/(\d+)\.html/i.exec(seg);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    let name = '';
    const h3 = /<h3[^>]*>[\s\S]{0,200}?<a[^>]*title="([^"]*)"/i.exec(seg);
    if (h3) name = decodeEntities(h3[1]);
    if (!name) {
      const t = /\btitle="([^"]*)"/i.exec(seg);
      if (t) name = decodeEntities(t[1]);
    }
    if (!name) {
      const n = /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(seg);
      if (n) name = stripTags(n[1]);
    }
    if (!name) continue;
    const ser = /<a[^>]*class="[^"]*video-serial[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(seg);
    seen.add(id);
    out.push({
      vod_id: id,
      vod_name: name,
      vod_pic: pickPic(seg, host),
      vod_remarks: ser ? stripTags(ser[1]) : '',
    });
  }
  return out;
}

function pageCount(html, page) {
  const t = String(html || '');
  let max = 0;
  let m;
  const re = /\/vodshow\/\d+-+(\d+)---\.html/gi;
  while ((m = re.exec(t))) {
    const n = parseInt(m[1], 10) || 0;
    if (n > max) max = n;
  }
  return max > 0 ? max : page;
}

// ---------------------------------------------------------------- 网盘链接

function panKind(host) {
  const h = String(host || '')
    .toLowerCase()
    .replace(/^www\./, '');
  if (h === 'pan.quark.cn') return 'quark';
  if (h === 'drive.uc.cn') return 'uc';
  if (h === 'alipan.com' || h === 'aliyundrive.com') return 'ali';
  if (h === '115.com' || h === '115cdn.com' || h === 'anxia.com') return '115';
  if (h === 'pan.baidu.com' || h === 'eyun.baidu.com') return 'baidu';
  if (/(?:^|\.)cloud\.189\.cn$/.test(h)) return '189';
  if (h === 'caiyun.139.com' || h === 'yun.139.com') return '139';
  if (h === 'pan.xunlei.com') return 'xunlei';
  if (h === '123pan.com' || h === '123684.com' || h === '123865.com' || h === '123pan.cn') return '123';
  if (/(?:^|\.)(?:lanzou[a-z]?|lanzn)\.(?:com|cn)$/.test(h)) return 'lanzou';
  return '';
}

function panLabel(host) {
  const map = {
    quark: '夸克网盘',
    uc: 'UC网盘',
    ali: '阿里云盘',
    115: '115网盘',
    baidu: '百度网盘',
    189: '天翼云盘',
    139: '移动云盘',
    xunlei: '迅雷云盘',
    123: '123云盘',
    lanzou: '蓝奏云',
  };
  return map[panKind(host)] || '网盘';
}

function cleanPanUrl(u) {
  return String(u || '')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&#x2[fF];/gi, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/^[\s"'<>()[\]{}（）【】《》，。；;、：:！？!?）】]+/, '')
    .replace(/[\s"'<>()[\]{}（）【】《》，。；;、：:！？!?）】]+$/, '')
    .trim();
}

function normalizePanUrl(raw) {
  let s = cleanPanUrl(raw);
  if (!s) return '';
  if (/%3[aA]%2[fF]%2[fF]/i.test(s)) {
    try {
      s = cleanPanUrl(decodeURIComponent(s));
    } catch (e) {
      /* 忽略 */
    }
  }
  if (s.indexOf('//') === 0) s = 'https:' + s;
  else if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  if (!panKind(u.hostname)) return '';
  return u.toString();
}

// 去重键：同一分享的不同写法只留一条；139/189 的分享 ID 在 query 里，不能丢
function panKey(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return String(url || '');
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const kind = panKind(host);
  let key = host + u.pathname.replace(/\/+$/, '');
  if (kind === '139' || (kind === '189' && /\/web\/share$/i.test(u.pathname))) {
    key +=
      '?' +
      [...u.searchParams.entries()]
        .map((x) => x[0] + '=' + x[1])
        .sort()
        .join('&');
  }
  return key;
}

function hasPwdInUrl(url) {
  return /[?&](?:pwd|passcode|password|code)=/i.test(String(url || ''));
}

// 从任意文本（属性/剪贴板/纯文本）里抽网盘链接；同链接去重、优先留带提取码的写法
function collectPans(text) {
  const out = [];
  const index = new Map();
  const push = (raw) => {
    const url = normalizePanUrl(raw);
    if (!url) return;
    const key = panKey(url);
    const old = index.get(key);
    if (old) {
      if (!hasPwdInUrl(old.url) && hasPwdInUrl(url)) old.url = url;
      return;
    }
    let h = '';
    try {
      h = new URL(url).hostname;
    } catch (e) {
      return;
    }
    const item = { name: panLabel(h), url };
    index.set(key, item);
    out.push(item);
  };
  const scan = (s) => {
    if (!s) return;
    const t = decodeEntities(String(s))
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\\//g, '/');
    let m;
    const re = new RegExp(PAN_RE.source, 'gi');
    while ((m = re.exec(t))) push(m[0]);
    // href="/go?url=https%3A%2F%2Fpan.quark.cn%2Fs%2Fx" 这类跳转
    if (/%3[aA]%2[fF]%2[fF]/i.test(t)) {
      try {
        const d = decodeURIComponent(t);
        const re2 = new RegExp(PAN_RE.source, 'gi');
        while ((m = re2.exec(d))) push(m[0]);
      } catch (e) {
        /* 忽略 */
      }
    }
  };

  const t = String(text || '');
  // 1) 属性：data-clipboard-text / href / value / content ...
  const reAttr =
    /\b(?:data-clipboard-text|data-clipboard|data-url|data-href|data-link|data-share(?:-url)?|href|value|content)="([^"]*)"/gi;
  let m;
  while ((m = reAttr.exec(t))) scan(m[1]);
  // 2) 整页兜底：<p> 纯文本、textarea、JS 变量里的链接都能覆盖
  scan(t);
  return out;
}

// 站内播放页（部分 MacCMS 详情页会直接挂 /vodplay/ 列表）
function parsePlayPages(html, host) {
  const t = String(html || '');
  const out = [];
  const seen = new Set();
  let m;
  const re = /<a[^>]+href="([^"]*\/vodplay\/[^"]*)"/gi;
  while ((m = re.exec(t))) {
    const u = abs(host, decodeEntities(m[1]));
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function parseDetail(html, host, id) {
  const t = String(html || '');

  const name = stripTags(
    (/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i.exec(t) || [])[1] ||
      (/<title>([\s\S]*?)<\/title>/i.exec(t) || [])[1] ||
      ''
  )
    .replace(/剧情介绍.*$/, '')
    .replace(/\s*-\s*玩偶哥哥.*$/, '')
    .trim();

  let pic = (/\bproperty="og:image"[^>]+content="([^"]+)"/i.exec(t) || [])[1] || '';
  if (!pic) {
    const head = t.slice(0, Math.max(0, t.indexOf('<div class="video-info"')));
    const m = /\bdata-src="([^"]+)"/i.exec(head);
    if (m) pic = m[1];
  }
  pic = pickPic('data-src="' + pic + '"', host);

  let content = '';
  const full = /<p[^>]*class="[^"]*sqjj_a[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(t);
  const short = /<p[^>]*class="[^"]*zkjj_a[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(t);
  content = stripTags((full && full[1]) || (short && short[1]) || '').replace(/\[展开全部\]|\[收起部分\]/g, '');

  const remark = stripTags((/备注：<\/span>\s*<div[^>]*>([\s\S]*?)<\/div>/i.exec(t) || [])[1] || '');

  // 网盘分享链接：data-clipboard-text / a.fzlj / <p> 纯文本 / 裸域名 / 短链 全量提取
  const pans = collectPans(t);

  return {
    vod: {
      vod_id: id,
      vod_name: name || '网盘资源 ' + id,
      vod_pic: pic,
      vod_content: content,
      vod_remarks: remark,
    },
    pans,
    playPages: parsePlayPages(t, host),
  };
}

function epUrl(u) {
  return String(u || '')
    .replace(/#/g, '%23')
    .replace(/\$/g, '%24');
}

// ---------------------------------------------------------------- 模块

export default function createSpider() {
  return {
    meta: {
      key: 'py_shandian_tv',
      name: '⚡闪电·4K',
      type: 40,
      searchable: 1,
      quickSearch: 0,
      filterable: 0,
    },

    api: async (fastify) => {

    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      const host = await resolveHost();
      const r = await siteGet(host + '/');
      const list = parseCards(r.text, host).slice(0, 60);
      return { class: CLASSES, filters: {}, list };
    });

    fastify.post('/category', async (request) => {
      const body = request.body || {};
      const tid = String(body.id || body.type_id || '1').trim() || '1';
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      const host = await resolveHost();
      const url =
        page <= 1
          ? host + '/vodshow/' + encodeURIComponent(tid) + '-----------.html'
          : host + '/vodshow/' + encodeURIComponent(tid) + '--------' + page + '---.html';
      let r = await siteGet(url);
      let list = parseCards(r.text, host);
      if (!list.length && page > 1) {
        r = await siteGet(host + '/vodshow/' + encodeURIComponent(tid) + '--------1---.html');
        list = parseCards(r.text, host);
      }
      return {
        page,
        pagecount: list.length ? pageCount(r.text, page) : page,
        limit: 70,
        total: list.length ? 99999 : 0,
        list,
      };
    });

    fastify.post('/search', async (request) => {
      const body = request.body || {};
      const wd = String(body.wd || body.keyword || '').trim();
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      if (!wd) return { page, pagecount: page, limit: 70, total: 0, list: [] };
      const host = await resolveHost();
      const form = 'wd=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : '');
      let r = await reqText(host + '/vodsearch/-------------.html', {
        method: 'POST',
        headers: headers({
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: host + '/vodsearch/-------------.html',
          Origin: host,
        }),
        body: form,
        timeout: 15000,
      });
      let list = parseCards(r.text, host);
      if (!list.length) list = parseSearchCards(r.text, host);
      // 站点搜索没有分页参数时，第 2 页会拿到同样的结果
      if (page > 1 && list.length) {
        const nowIds = list.map((x) => x.vod_id).join(',');
        const first = await reqText(host + '/vodsearch/-------------.html', {
          method: 'POST',
          headers: headers({
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: host + '/vodsearch/-------------.html',
            Origin: host,
          }),
          body: 'wd=' + encodeURIComponent(wd),
          timeout: 15000,
        });
        const fl = parseCards(first.text, host).length ? parseCards(first.text, host) : parseSearchCards(first.text, host);
        if (fl.map((x) => x.vod_id).join(',') === nowIds) list = [];
      }
      return { page, pagecount: list.length >= 20 ? page + 1 : page, limit: 70, total: list.length, list };
    });

    fastify.post('/detail', async (request) => {
      const body = request.body || {};
      const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids;
      const id = String(raw || '').split('@')[0].replace(/[^0-9A-Za-z]/g, '');
      if (!id) return { list: [] };
      let host = await resolveHost();
      const isDetailPage = (x) =>
        !!(x && x.status === 200 && x.text && x.text.length > 10000 && /voddetail|page-title|<h1/i.test(x.text));
      const tryDetail = async (h, attempts) => {
        const url = h + '/voddetail/' + id + '.html';
        let rr = await siteGet(url);
        for (let i = 1; i < attempts; i++) {
          if (rr.status !== 0 && rr.status !== 403 && rr.status !== 429 && rr.status < 500) break;
          await sleep(700 + i * 1100);
          rr = await siteGet(url);
        }
        return { r: rr, host: h };
      };
      let got = await tryDetail(host, 3);
      let lastStatus = got.r.status;
      if (!isDetailPage(got.r)) {
        for (const h of HOSTS) {
          if (h === host) continue;
          const g = await tryDetail(h, 1);
          lastStatus = g.r.status || lastStatus;
          if (isDetailPage(g.r)) {
            got = g;
            break;
          }
        }
      }
      let r = got.r;
      host = got.host;
      if (isDetailPage(r)) {
        activeHost = host;
        hostAt = Date.now();
      }
      if (!isDetailPage(r)) {
        // 抓不到详情页（CF 403/429 或超时）时给一条明确的「详情页#01」，并在备注里写原因，
        // 不伪造集数、也不冒充分享线。
        const cfFail =
          r.status === 403 || r.status === 429 || r.status === 0 || r.status >= 500 || lastStatus === 403 || lastStatus === 429;
        if (!cfFail && !/voddetail/.test(String(r.text || ''))) return { list: [] };
        const cfHit = CF_RE.test(String(r.text || ''));
        return {
          list: [
            {
              vod_id: id,
              vod_name: '闪电资源 ' + id,
              vod_pic: '',
              vod_content: '',
              vod_remarks: cfHit
                ? '详情页被站方拦截(' + (r.status || lastStatus || '超时') + ')'
                : '详情抓取失败(' + (r.status || lastStatus || '超时') + ')，已重试并换域名',
              vod_play_from: '详情页#01',
              vod_play_url: '打开站点详情页$' + abs(host, '/voddetail/' + id + '.html'),
            },
          ],
        };
      }

      const parsed = parseDetail(r.text, host, id);
      const vod = parsed.vod;

      // 没有网盘链接时：有站内 /vodplay/ 就出「站内播放#01」，否则「详情页#01」
      const applyDetailFallback = () => {
        const froms = [];
        const urls = [];
        if (parsed.playPages.length) {
          froms.push('站内播放#01');
          urls.push(parsed.playPages.slice(0, 30).map((u, i) => '第' + (i + 1) + '集$' + epUrl(u)).join('#'));
        } else {
          froms.push('详情页#01');
          urls.push('打开站点详情页$' + epUrl(abs(host, '/voddetail/' + id + '.html')));
        }
        vod.vod_play_from = froms.join('$$$');
        vod.vod_play_url = urls.join('$$$');
        vod.vod_remarks = (vod.vod_remarks ? vod.vod_remarks + ' · ' : '') + '详情页没有网盘链接';
      };

      if (!parsed.pans.length) {
        applyDetailFallback();
        return { list: [vod] };
      }

      // 猫源无网盘解析层：每条分享各占一集（与 E 批网盘源同口径），集名取网盘种类。
      const usedNames = new Set();
      const eps = parsed.pans.map((p) => {
        let nm = p.name || '网盘';
        if (usedNames.has(nm)) {
          let i = 2;
          while (usedNames.has(nm + i)) i++;
          nm = nm + i;
        }
        usedNames.add(nm);
        return nm + '$' + epUrl(p.url);
      });
      vod.vod_play_from = '网盘分享';
      vod.vod_play_url = eps.join('#');
      vod.vod_remarks =
        (vod.vod_remarks ? vod.vod_remarks + ' · ' : '') +
        parsed.pans.length + ' 个网盘';
      return { list: [vod] };
    });

    fastify.post('/play', async (request) => {
      const id = String((request.body && request.body.id) || '');
      if (!id) return { parse: 0, url: '' };
      // detail 侧对 $/# 做了 %24/%23 转义，播放时还原
      return { parse: 0, url: id.replace(/%23/g, '#').replace(/%24/g, '$') };
    });
    },
  };
}
