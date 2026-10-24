import req from '../../util/req.js';

/**
 * YouTube（youtube_video）· hmtv 全自主移植专项批
 * ---------------------------------------------------------------------------
 * 由 hipy(py) 源移植的客户端本地 JS 源：YouTube 直连只走官方域
 * （www.youtube.com / youtubei/v1 / googlevideo 直链），无任何服务器中转，
 * 原 py 的本地代理（127.0.0.1:9978 DASH 合成）分支在本移植里已按 bundle
 * 原注删去，只保留直链分支（parse:0 + header）。
 * bundle 原体用 Node 标准库 http/https/zlib 做请求；猫源运行时无 require，
 * 本文件把 HTTP 层换成框架 req 主栈（axios 式，自动解 gzip/跟随跳转），
 * cookie  jar 逻辑原样保留在 req 层之上；fetch 仅 typeof 保护的兜底。
 * 其余 innertube / 签名（sig）/ n-param 还原逻辑全部原样保留。
 * 可达性说明：YouTube 直连在 VM 出口被挡属 bundle 原注已知现象，
 * 本批 harness 以 VM 表现 + 代码链路为准，播放以用户手机网络真机定性。
 */


// ---------- 常量 ----------
var TIMEOUT_PAGE = 25000;      // 网页（watch / results）—— 原 py 60s，手机壳子上缩短避免卡死
var TIMEOUT_PLAYER_JS = 30000; // base.js（签名还原用）—— 原 py 90s
var TIMEOUT_API = 25000;       // innertube API —— 原 py 60s
var TIMEOUT_OTHER = 15000;

var UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var UA_ANDROID_YT = 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip';

var BASE_HEADER = {
  'User-Agent': UA_WEB,
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.youtube.com/'
};

var QUALITY_SUPER = 'super';
var QUALITY_NORMAL = 'normal';
var QUALITY_LIVE = 'live';
var QUALITY_4K = '4k';

var CAT_MOVIE = '电影';
var CAT_LIVE = '直播';
var CAT_MUSIC = '音乐';
var CAT_HDR = 'HDR';
var CAT_FREE = '免费';
var CAT_SHORT = '短剧';
var CAT_CARTOON = '动画片'; // 原 py 写的是「动画片」，注释里叫动画

var EXTRACT_CACHE_TTL = 300 * 1000;
var LIVE_CACHE_TTL = 90 * 1000;
var SEARCH_CACHE_TTL = 600 * 1000;
var GENERIC_CACHE_TTL = 600 * 1000;

var CLIENT_NAME_MAP = {
  'WEB': 1, 'MWEB': 2, 'ANDROID': 3, 'IOS': 5,
  'TVHTML5': 7, 'ANDROID_VR': 28, 'WEB_EMBEDDED_PLAYER': 56,
  'WEB_REMIX': 67, 'VISIONOS': 101
};

var INNERTUBE_CLIENTS = [
  {
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice17,1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    osName: 'visionOS',
    osVersion: '26.5.23O471',
    hl: 'en',
    gl: 'US'
  },
  {
    clientName: 'WEB_EMBEDDED_PLAYER',
    clientVersion: '2.20260708.00.00',
    hl: 'en',
    gl: 'US'
  }
];

var YOUTUBE_CLASSES = [
  { type_id: CAT_MOVIE, type_name: '电影' },
  { type_id: CAT_LIVE, type_name: '直播' },
  { type_id: CAT_MUSIC, type_name: '音乐' },
  { type_id: CAT_HDR, type_name: 'HDR' },
  { type_id: CAT_FREE, type_name: '免费' },
  { type_id: CAT_SHORT, type_name: '短剧' },
  { type_id: CAT_CARTOON, type_name: '动画片' }
];

var DATE_FILTER = { key: 'date', name: '排序/时间', value: [{ n: '默认', v: '' }, { n: '最新', v: 'latest' }, { n: '最热', v: 'hottest' }, { n: '评分最高', v: 'favorite' }, { n: '当天', v: 'day' }, { n: '本周', v: 'week' }, { n: '本月', v: 'month' }] };

var CATEGORY_FILTERS = {};
CATEGORY_FILTERS[CAT_MOVIE] = [
  { key: 'topic', name: '官方分类', value: [{ n: '电影', v: '电影' }, { n: '电影与动画', v: '电影与动画' }, { n: '电视节目', v: '电视节目' }] },
  { key: 'tid', name: '地区', value: [{ n: '大陆', v: '大陆' }, { n: '香港', v: '香港' }, { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '韩国', v: '韩国' }, { n: '日本', v: '日本' }] },
  DATE_FILTER
];
CATEGORY_FILTERS[CAT_LIVE] = [
  { key: 'topic', name: '官方分类', value: [{ n: '新闻直播', v: '新闻直播' }, { n: '游戏直播', v: '游戏直播' }, { n: '体育直播', v: '体育直播' }, { n: '音乐直播', v: '音乐直播' }] },
  { key: 'tid', name: '直播类型', value: [{ n: '全部直播', v: '全部直播' }, { n: '游戏', v: '游戏' }, { n: '新闻', v: '新闻' }, { n: '体育', v: '体育' }, { n: '音乐现场', v: '音乐现场' }, { n: '生活', v: '生活' }] },
  DATE_FILTER
];
CATEGORY_FILTERS[CAT_MUSIC] = [
  { key: 'topic', name: '官方分类', value: [{ n: '音乐', v: '音乐' }, { n: '流行音乐', v: '流行音乐' }, { n: '摇滚乐', v: '摇滚乐' }, { n: '嘻哈音乐', v: '嘻哈音乐' }, { n: '电子音乐', v: '电子音乐' }, { n: '重金属', v: '重金属' }, { n: '重金属根源雷鬼', v: '重金属根源雷鬼' }, { n: 'Dub', v: 'Dub' }, { n: 'Bass', v: 'Bass' }] },
  { key: 'tid', name: '形式/场景', value: [{ n: 'MV', v: 'MV' }, { n: '现场', v: '现场' }, { n: '翻唱', v: '翻唱' }, { n: '精选', v: '精选' }, { n: '车载', v: '车载' }] },
  DATE_FILTER
];
CATEGORY_FILTERS[CAT_HDR] = [
  { key: 'tid', name: '画质类型', value: [{ n: 'HDR', v: 'HDR' }, { n: '杜比', v: '杜比' }, { n: '4K', v: '4K' }, { n: '8K', v: '8K' }, { n: '12K', v: '12K' }, { n: '16K', v: '16K' }] },
  { key: 'topic', name: '关联主题（加画质）', value: [{ n: '自然+8K', v: '自然+8K' }, { n: '电影+4K', v: '电影+4K' }, { n: '风景+HDR', v: '风景+HDR' }] },
  DATE_FILTER
];
CATEGORY_FILTERS[CAT_FREE] = [
  { key: 'tid', name: '免费内容', value: [{ n: '免费电影', v: '免费电影' }, { n: '免费电视剧', v: '免费电视剧' }, { n: '免费纪录片', v: '免费纪录片' }, { n: '免费音乐', v: '免费音乐' }, { n: '免费课程', v: '免费课程' }, { n: '免费直播', v: '免费直播' }] },
  { key: 'topic', name: '关联主题（加免费）', value: [{ n: '电影+免费', v: '电影+免费' }, { n: '教育+免费', v: '教育+免费' }, { n: '音乐+免费', v: '音乐+免费' }] },
  DATE_FILTER
];
CATEGORY_FILTERS[CAT_SHORT] = [
  DATE_FILTER,
  { key: 'tid', name: '地区/平台', value: [{ n: '全部', v: '' }, { n: '抖音', v: '抖音 短剧' }, { n: '快手', v: '快手 短剧' }, { n: '大陆', v: '大陆 短剧' }, { n: '香港', v: '香港 短剧' }, { n: '澳門', v: '澳門 短剧' }, { n: '台湾', v: '台湾 短剧' }, { n: '新加坡', v: '新加坡 短剧' }, { n: '馬來西亞', v: '馬來西亞 短剧' }, { n: '泰國', v: '泰國 短剧' }, { n: '越南', v: '越南 短剧' }, { n: '印度', v: '印度 短剧' }, { n: '韩国', v: '韩国 短剧' }, { n: '日本', v: '日本 短剧' }, { n: '欧美', v: '欧美 短剧' }, { n: '腾讯', v: '腾讯 短剧' }, { n: '爱奇艺', v: '爱奇艺 短剧' }, { n: '优酷', v: '优酷 短剧' }, { n: '芒果', v: '芒果TV 短剧' }, { n: '搜狐', v: '搜狐 短剧' }] },
  { key: 'topic', name: '类型/频道', value: [{ n: '全部', v: '' }, { n: '都市', v: '@Urbanshort-TV 都市 短劇' }, { n: '爱情', v: '爱情 短劇' }, { n: '复仇', v: '复仇 短劇' }, { n: '霸总', v: '霸总 短劇' }, { n: '萌宝', v: '萌宝 短劇' }, { n: '古装', v: '古装 短劇' }, { n: '穿越', v: '穿越 短劇' }, { n: '喜剧', v: '喜剧 短劇' }, { n: '奇幻', v: '奇幻 短劇' }, { n: '九酱爱追剧', v: '@NineSauceDramaTV' }, { n: '百万好剧场', v: '@1-pw5ox' }, { n: '咖啡追剧', v: '@@coffeedrama605' }, { n: '斗罗短剧', v: '@DouluoDrama123 斗羅短劇' }, { n: '嘟嘟剧场', v: '@DUDUJUCHANG' }, { n: '牛牛短剧', v: '@niuniuduanju' }] }
];
CATEGORY_FILTERS[CAT_CARTOON] = [
  DATE_FILTER,
  { key: 'tid', name: '平台/频道', value: [{ n: '全部', v: '' }, { n: '小猪佩奇', v: '@PeppaPigChineseOfficial 小猪佩奇 中文官方 - Peppa Pig' }, { n: 'CoComelon', v: '@CoComelon' }, { n: '国漫社', v: '@Animation  次元 苍穹动漫 PP看动漫 公馆' }, { n: '国漫工厂', v: '@3DGuoman  SUB' }, { n: '阅文动漫', v: '@yuewenanimation  SUB' }, { n: '哔哩', v: '@madebybilibili  哔哩动漫' }, { n: '腾讯', v: '@TencentVideoAnimation SUB' }, { n: '优酷', v: '@youkuanimation 优酷动漫' }, { n: '爱奇艺', v: '@iQIYIAnime 爱奇艺动漫' }] },
  { key: 'topic', name: '主题/类别', value: [{ n: '全部', v: '' }, { n: '默认中文国漫', v: '國漫 劇集 3D' }, { n: '默认动画', v: 'animation' }, { n: '儿童早教', v: '儿童早教' }, { n: '儿童歌曲', v: '儿童歌曲' }, { n: '儿童音乐', v: '儿童音乐' }, { n: '儿童绘画', v: '儿童绘画' }, { n: '宝宝巴士', v: '宝宝巴士' }, { n: '儿歌多多', v: '儿歌多多' }, { n: '儿童英语启蒙', v: '儿童英语启蒙' }, { n: '儿童启蒙故事', v: '儿童启蒙故事' }, { n: '儿童安全教育', v: '儿童安全教育' }, { n: '默认英文国漫', v: '3D Chinese cartoon' }, { n: '合集', v: 'Anime ENG SUB 合集' }] }
];

// ---------- 缓存（模块级，壳进程内长期有效） ----------
var _extractCache = {};   // videoId -> {data, expires}
var _liveCache = {};      // videoId -> {data, expires}
var _playerCache = {};    // playerUrl -> code
var _sigPlanCache = {};   // playerUrl -> plan
var _nFuncCache = {};     // playerUrl -> boolean(可用)
var _searchCache = {};    // key -> {data, expires}
var _liveSearchCache = {};
var _homeCache = null;    // [ts, list]
var _visitorData = '';

// ---------- HTTP（框架 req 主栈；App 内无 fetch 时兜底不触发） ----------
var _cookies = {}; // hostname -> {name: value}
function cookieHeader(host) {
  var jar = _cookies[host];
  if (!jar) return '';
  var out = [];
  for (var k in jar) { if (Object.prototype.hasOwnProperty.call(jar, k)) out.push(k + '=' + jar[k]); }
  return out.join('; ');
}
function storeCookies(host, setCookie) {
  if (!setCookie) return;
  var list = Array.isArray(setCookie) ? setCookie : [setCookie];
  var jar = _cookies[host] || (_cookies[host] = {});
  for (var i = 0; i < list.length; i++) {
    var kv = String(list[i]).split(';')[0];
    var eq = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
}
async function httpRaw(url, method, body, headers, timeoutMs) {
  // 与原版 httpRaw 同契约：成功返回 { status, headers, buf }（buf 为字符串），失败返回 null。
  // axios 自动解 gzip/跟随跳转；validateStatus 全收是为了让调用方看到真实状态码。
  var h = {};
  var k;
  for (k in (headers || {})) { if (Object.prototype.hasOwnProperty.call(headers, k)) h[k] = headers[k]; }
  try {
    var jar = cookieHeader(new URL(url).hostname);
    if (jar && !h['Cookie']) h['Cookie'] = jar;
  } catch (e) {}
  try {
    var resp = await req({
      method: method || 'GET',
      url: url,
      headers: h,
      data: (body !== null && body !== undefined) ? body : undefined,
      timeout: timeoutMs || TIMEOUT_OTHER,
      responseType: 'text',
      validateStatus: function () { return true; },
    });
    var data = resp && resp.data;
    var text = typeof data === 'string' ? data : String(data || '');
    try { storeCookies(new URL(url).hostname, resp.headers && (resp.headers['set-cookie'] || resp.headers['Set-Cookie'])); } catch (e) {}
    return { status: (resp && resp.status) || 0, headers: (resp && resp.headers) || {}, buf: text };
  } catch (e) {}
  try {
    if (typeof fetch === 'undefined') return null;
    var timer = null;
    try {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (ctrl && typeof setTimeout === 'function') timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || TIMEOUT_OTHER);
      var r = await fetch(url, { method: method || 'GET', headers: h, body: (method === 'POST' && body != null) ? body : undefined, signal: ctrl ? ctrl.signal : undefined });
      var t = await r.text();
      var rh = {};
      r.headers.forEach(function (v, kk) { rh[kk] = v; });
      try { storeCookies(new URL(url).hostname, rh['set-cookie']); } catch (e2) {}
      return { status: r.status, headers: rh, buf: t };
    } finally { if (timer) clearTimeout(timer); }
  } catch (e2) { return null; }
}
async function httpText(url, method, body, headers, timeoutMs) {
  var r = await httpRaw(url, method, body, headers, timeoutMs);
  if (!r || !r.buf) return '';
  return typeof r.buf === 'string' ? r.buf : String(r.buf);
}
async function httpJson(url, method, body, headers, timeoutMs) {
  var t = await httpText(url, method, body, headers, timeoutMs);
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

// ---------- 小工具 ----------
function reSearch(pattern, text, def) {
  var m = String(text || '').match(pattern);
  return m ? m[1] : (def === undefined ? null : def);
}
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function unquote(s) { try { return decodeURIComponent(String(s)); } catch (e) { return String(s); } }
function parseQs(qs) {
  var out = {};
  var parts = String(qs || '').split('&');
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    var eq = parts[i].indexOf('=');
    var k = eq < 0 ? parts[i] : parts[i].slice(0, eq);
    var v = eq < 0 ? '' : parts[i].slice(eq + 1);
    if (!out[k]) out[k] = [];
    out[k].push(unquote(v));
  }
  return out;
}
function encodeQs(map) {
  var out = [];
  for (var k in map) {
    if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
    var vals = map[k];
    for (var i = 0; i < vals.length; i++) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(vals[i]));
  }
  return out.join('&');
}
function unesc(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, function (m, d) { try { return String.fromCharCode(parseInt(d, 10)); } catch (e) { return m; } });
}
function safeTitle(title) {
  if (!title) return 'video';
  return String(title).replace(/[#$@%&!?*|\\/:<>]/g, ' ').slice(0, 60);
}
function nowMs() { return Date.now(); }
function cacheGet(store, key) {
  var it = store[key];
  if (it && it.expires > nowMs()) return it.data;
  if (it) delete store[key];
  return null;
}
function cacheSet(store, key, data, ttl) {
  store[key] = { data: data, expires: nowMs() + (ttl || GENERIC_CACHE_TTL) };
}
function clientNameId(name) {
  return CLIENT_NAME_MAP[name] || 1;
}
function sleep(ms) { if (typeof setTimeout === 'function') return new Promise(function (r) { setTimeout(r, ms); }); return Promise.resolve(); }

// ---------- YouTube 页面/JS 解析 ----------
function extractJsonAfter(text, marker) {
  text = String(text || '');
  var pos = text.indexOf(marker);
  if (pos < 0) return null;
  var start = text.indexOf('{', pos);
  if (start < 0) return null;
  var depth = 0, inStr = null, escape = false;
  for (var i = start; i < text.length; i++) {
    var ch = text.charAt(i);
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === '"') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

function extractYtcfg(text) {
  var m = String(text || '').match(/ytcfg\.set\s*\(\s*({[\s\S]+?})\s*\)\s*;/);
  if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
  return null;
}

function extractPlayerUrl(text) {
  var patterns = [/"jsUrl":"([^"]+)"/, /"PLAYER_JS_URL":"([^"]+)"/, /(\/s\/player\/[^"\\]+\/base\.js)/];
  for (var i = 0; i < patterns.length; i++) {
    var m = String(text || '').match(patterns[i]);
    if (m) return m[1].replace(/\\\//g, '/');
  }
  return '';
}

function extractInitialPlayerResponse(text) {
  return extractJsonAfter(text, 'ytInitialPlayerResponse');
}

// 取出 JS 函数体（花括号配平，兼顾字符串/转义）—— 对应 py 的 _extract_js_function_body
function jsFunctionBody(code, name) {
  code = String(code || '');
  if (!name) return '';
  var esc = escRe(name);
  var patterns = [
    'function\\s+' + esc + '\\s*\\([^)]*\\)\\s*\\{',
    esc + '\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{',
    'var\\s+' + esc + '\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{',
    esc + '\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{'
  ];
  var start = -1;
  for (var p = 0; p < patterns.length; p++) {
    var m = code.match(new RegExp(patterns[p]));
    if (m) { start = (m.index || 0) + m[0].length - 1; break; }
  }
  if (start < 0) return '';
  var depth = 0, inStr = null, escape = false;
  for (var i = start; i < code.length; i++) {
    var ch = code.charAt(i);
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(start + 1, i);
    }
  }
  return '';
}

// 签名还原表（对应 py 的 _extract_sig_plan / _extract_helper_object）
function extractHelperObject(code, name) {
  if (!name) return {};
  var esc = escRe(name);
  var m = String(code || '').match(new RegExp('var\\s+' + esc + '=\\{([\\s\\S]+?)\\};')) ||
          String(code || '').match(new RegExp(esc + '=\\{([\\s\\S]+?)\\};'));
  if (!m) return {};
  var result = {};
  var re = /([a-zA-Z0-9_$]+):function\([a-z,]+\)\{(.*?)\}/g;
  var mm;
  while ((mm = re.exec(m[1])) !== null) {
    var method = mm[1], body = mm[2];
    if (body.indexOf('.reverse(') >= 0) result[method] = 'reverse';
    else if (body.indexOf('.splice(') >= 0) result[method] = 'splice';
    else if (body.indexOf('.slice(') >= 0) result[method] = 'slice';
    else if (body.indexOf('a[0]') >= 0 && body.indexOf('length') >= 0) result[method] = 'swap';
  }
  return result;
}

function extractSigPlan(code) {
  code = String(code || '');
  if (!code) return null;
  var name = null;
  var patterns = [
    /\.sig\|\|([a-zA-Z0-9_$]+)\(/,
    /"signature",\s*([a-zA-Z0-9_$]+)\(/,
    /([a-zA-Z0-9_$]+)=function\(a\)\{a=a\.split\(""\);/,
    /([a-zA-Z0-9_$]+)\s*=\s*function\(a\)\{a=a\.split\(""\)/,
    /([a-zA-Z0-9_$]+)\(a\)\{a=a\.split\(""\)/,
    /([a-zA-Z0-9_$]+)\s*:\s*function\(a\)\{a=a\.split\(""\)/,
    /(?:^|;)\s*([a-zA-Z0-9_$]+)\s*=\s*function\(a\)\{[^}]*split\(""\)/,
    /\.get\("n"\)\)&&\(b=([a-zA-Z0-9_$]+)\(b\)/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = code.match(patterns[i]);
    if (m) { name = m[1]; break; }
  }
  if (!name) return null;
  var body = jsFunctionBody(code, name);
  if (!body) return null;
  var helper = reSearch(/([a-zA-Z0-9_$]+)\.[a-zA-Z0-9_$]+\(a,\d+\)/, body);
  var helperMap = helper ? extractHelperObject(code, helper) : {};
  var plan = [];
  var parts = body.split(';');
  for (var j = 0; j < parts.length; j++) {
    var part = parts[j];
    if (part.indexOf('reverse()') >= 0) { plan.push(['reverse', 0]); continue; }
    var m1 = part.match(/\.slice\((\d+)\)/);
    if (m1) { plan.push(['slice', parseInt(m1[1], 10)]); continue; }
    var m2 = part.match(/\.splice\(0,(\d+)\)/);
    if (m2) { plan.push(['splice', parseInt(m2[1], 10)]); continue; }
    var m3 = part.match(/([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$]+)\(a,(\d+)\)/);
    if (m3 && m3[1] === helper) {
      var op = helperMap[m3[2]];
      if (op) plan.push([op, parseInt(m3[3], 10)]);
    }
  }
  return plan.length ? plan : null;
}

function decryptSig(sig, playerUrl) {
  var key = playerUrl || '';
  var plan = _sigPlanCache[key];
  if (plan === undefined) {
    var code = _playerCache[key] || '';
    plan = extractSigPlan(code);
    _sigPlanCache[key] = plan;
  }
  if (!plan) return sig;
  var arr = String(sig).split('');
  for (var i = 0; i < plan.length; i++) {
    var op = plan[i][0], arg = plan[i][1];
    if (op === 'reverse') arr.reverse();
    else if (op === 'slice' || op === 'splice') arr = arr.slice(arg);
    else if (op === 'swap' && arr.length) {
      var j = arg % arr.length;
      var t = arr[0]; arr[0] = arr[j]; arr[j] = t;
    }
  }
  return arr.join('');
}

// n-param 还原（对应 py 的 _extract_n_function / transform）
function extractNTransform(code) {
  code = String(code || '');
  if (!code) return null;
  var name = null;
  var patterns = [
    /\.get\("n"\)\)&&\(b=([a-zA-Z0-9_$]+)(?:\[(\d+)\])?\(b\)/,
    /\.get\("n"\)\)&&\(b=([a-zA-Z0-9_$]+)\(b\)/,
    /([a-zA-Z0-9_$]+)=function\(a\)\{var b=a\.split\(""\)/,
    /function\s+([a-zA-Z0-9_$]+)\(a\)\{var b=a\.split\(""\)/,
    /([a-zA-Z0-9_$]+)=function\(a\)\{a=a\.split\(""\)/,
    /([a-zA-Z0-9_$]+)\(a\)\{var b=a\.split\(""\)/,
    /([a-zA-Z0-9_$]+)\s*:\s*function\(a\)\{[^}]*\.get\("n"\)/,
    /\.get\("n"\)[^;]*;\s*if\s*\(\s*typeof\s+([a-zA-Z0-9_$]+)\s*===/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = code.match(patterns[i]);
    if (m) { name = m[1]; break; }
  }
  if (!name) return null;
  var body = jsFunctionBody(code, name);
  if (!body) return null;
  return function (value) {
    var arr = String(value).split('');
    var parts = body.split(';');
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].indexOf('reverse()') >= 0) arr.reverse();
      var m1 = parts[j].match(/\.slice\((\d+)\)/);
      if (m1) arr = arr.slice(parseInt(m1[1], 10));
      var m2 = parts[j].match(/\.splice\(0,(\d+)\)/);
      if (m2) arr = arr.slice(parseInt(m2[1], 10));
    }
    return arr.join('') || value;
  };
}

function decryptNsig(mediaUrl, playerUrl) {
  try {
    var hashPos = mediaUrl.indexOf('#');
    var core = hashPos >= 0 ? mediaUrl.slice(0, hashPos) : mediaUrl;
    var qIdx = core.indexOf('?');
    var base = qIdx >= 0 ? core.slice(0, qIdx) : core;
    var qs = qIdx >= 0 ? core.slice(qIdx + 1) : '';
    var query = parseQs(qs);
    var nValue = (query['n'] && query['n'][0]) || '';
    if (!nValue) return mediaUrl;

    // 1) 路径里带 /n/xxx 的：直接用 query 里的 n 覆盖（对应 py 的 path_match 分支）
    var pm = base.match(/\/n\/([^/]+)/);
    if (pm && pm[1] !== nValue) {
      return base.replace('/n/' + pm[1], '/n/' + nValue) + (qs ? '?' + qs : '') + (hashPos >= 0 ? mediaUrl.slice(hashPos) : '');
    }

    // 2) 有 base.js 就用里面的 n 函数
    if (playerUrl) {
      var fn = getNFunction(playerUrl);
      if (fn) {
        var newN = fn(nValue);
        if (newN !== nValue) {
          query['n'] = [newN];
          return base + '?' + encodeQs(query) + (hashPos >= 0 ? mediaUrl.slice(hashPos) : '');
        }
      }
    }
    return mediaUrl;
  } catch (e) {
    return mediaUrl;
  }
}

function getNFunction(playerUrl) {
  var key = playerUrl || '';
  if (_nFuncCache[key] !== undefined && _nFuncCache[key] !== null) return _nFuncCache[key];
  var fn = extractNTransform(_playerCache[key] || '');
  _nFuncCache[key] = fn || false;
  return fn || null;
}

async function getPlayerCode(playerUrl) {
  if (!playerUrl) return '';
  if (_playerCache[playerUrl] !== undefined && _playerCache[playerUrl] !== null) return _playerCache[playerUrl];
  var url = playerUrl;
  if (url.indexOf('//') === 0) url = 'https:' + url;
  else if (url.charAt(0) === '/') url = 'https://www.youtube.com' + url;
  var code = '';
  try { code = await httpText(url, 'GET', null, BASE_HEADER, TIMEOUT_PLAYER_JS); } catch (e) { code = ''; }
  _playerCache[playerUrl] = code;
  return code;
}

async function extractSignatureTimestamp(playerUrl) {
  try {
    var code = await getPlayerCode(playerUrl);
    var sts = reSearch(/(?:signatureTimestamp|sts)\s*:\s*(\d{5})/, code);
    return sts ? parseInt(sts, 10) : null;
  } catch (e) {
    return null;
  }
}

// ---------- 播放地址还原 ----------
function decryptSignatureCipher(cipher, playerUrl) {
  var data = parseQs(cipher);
  var mediaUrl = unquote((data['url'] || [''])[0]);
  var sig = unquote((data['s'] || [''])[0]);
  var sp = (data['sp'] || ['sig'])[0];
  if (!mediaUrl) return '';
  if (sig) {
    var decoded = decryptSig(sig, playerUrl);
    var sep = mediaUrl.indexOf('?') >= 0 ? '&' : '?';
    mediaUrl = mediaUrl + sep + sp + '=' + encodeURIComponent(decoded);
  }
  return mediaUrl;
}

// po_token：原 py 从 extend 配置取，客户端本地包没有配置来源 ⇒ 恒为空（原 py 默认同样是空）
function getPoToken() { return ''; }

function normalizeFormat(fmt, playerUrl) {
  var mediaUrl = fmt['url'];
  if (!mediaUrl) {
    var cipher = fmt['signatureCipher'] || fmt['cipher'];
    if (cipher) mediaUrl = decryptSignatureCipher(cipher, playerUrl);
  }
  if (!mediaUrl) return null;
  mediaUrl = decryptNsig(mediaUrl, playerUrl);

  var poToken = fmt['_client_name'] ? getPoToken(fmt['_client_name'], 'gvs') : '';
  if (poToken) {
    var sep = mediaUrl.indexOf('?') >= 0 ? '&' : '?';
    mediaUrl = mediaUrl + sep + 'pot=' + encodeURIComponent(poToken);
  }

  var mime = fmt['mimeType'] || '';
  var ext = mime.indexOf('mp4') >= 0 ? 'mp4' : (mime.indexOf('webm') >= 0 ? 'webm' : 'unknown');
  var codecs = reSearch(/codecs="([^"]+)"/, mime, '') || '';
  var hasAudio = mime.indexOf('audio/') === 0 || codecs.indexOf('mp4a') >= 0 || codecs.indexOf('opus') >= 0 || codecs.indexOf('vorbis') >= 0;
  var hasVideo = mime.indexOf('video/') === 0 || codecs.indexOf('avc') >= 0 || codecs.indexOf('vp9') >= 0 || codecs.indexOf('av01') >= 0 || codecs.indexOf('h264') >= 0;
  var headers = {};
  var src = fmt['http_headers'] || {};
  for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) headers[k] = src[k]; }
  if (fmt['_client_ua']) headers['User-Agent'] = fmt['_client_ua'];

  return {
    itag: fmt['itag'],
    url: mediaUrl,
    mimeType: mime,
    client: fmt['_client_name'],
    ext: ext,
    width: fmt['width'] || 0,
    height: fmt['height'] || 0,
    fps: fmt['fps'] || 0,
    bitrate: fmt['bitrate'] || fmt['averageBitrate'] || 0,
    contentLength: fmt['contentLength'],
    initRange: fmt['initializationRange'] || fmt['initRange'] || {},
    indexRange: fmt['indexRange'] || {},
    codecs: codecs,
    quality: fmt['qualityLabel'] || fmt['quality'],
    vcodec: hasVideo ? codecs : 'none',
    acodec: hasAudio ? codecs : 'none',
    headers: headers
  };
}

async function callPlayerApi(videoId, apiKey, visitorData, sts) {
  var results = [];
  var fallback = null;
  for (var i = 0; i < INNERTUBE_CLIENTS.length; i++) {
    var ci = INNERTUBE_CLIENTS[i];
    var clientName = ci.clientName;
    try {
      var url = 'https://www.youtube.com/youtubei/v1/player?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false';
      var clientCtx = {};
      for (var ck in ci) { if (Object.prototype.hasOwnProperty.call(ci, ck)) clientCtx[ck] = ci[ck]; }
      var playbackContext = { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } };
      if (sts) playbackContext['contentPlaybackContext']['signatureTimestamp'] = sts;
      var payload = {
        context: { client: clientCtx },
        videoId: videoId,
        playbackContext: playbackContext,
        contentCheckOk: true,
        racyCheckOk: true
      };
      var poToken = getPoToken(clientName, 'gvs');
      if (poToken) payload['serviceIntegrityDimensions'] = { poToken: poToken };

      var headers = {};
      for (var bk in BASE_HEADER) { if (Object.prototype.hasOwnProperty.call(BASE_HEADER, bk)) headers[bk] = BASE_HEADER[bk]; }
      headers['Content-Type'] = 'application/json';
      headers['Origin'] = 'https://www.youtube.com';
      headers['Referer'] = 'https://www.youtube.com/watch?v=' + videoId;
      headers['X-YouTube-Client-Name'] = String(clientNameId(clientName));
      headers['X-YouTube-Client-Version'] = ci.clientVersion || '';
      if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;
      if (ci.userAgent) headers['User-Agent'] = ci.userAgent;

      var data = await httpJson(url, 'POST', JSON.stringify(payload), headers, TIMEOUT_API);
      if (!data) continue;
      var streaming = data['streamingData'] || {};
      var hasStreaming = false;
      for (var sk in streaming) { if (Object.prototype.hasOwnProperty.call(streaming, sk)) { hasStreaming = true; break; } }
      if (hasStreaming) {
        data['_client_name'] = clientName;
        data['_client_ua'] = ci.userAgent || '';
        results.push(data);
      }
      if (fallback === null) fallback = data;
    } catch (e) {
      continue;
    }
  }
  if (results.length) return results;
  return fallback ? [fallback] : [];
}

function respHeight(resp) {
  var sd = (resp || {})['streamingData'] || {};
  var raw = (sd['formats'] || []).concat(sd['adaptiveFormats'] || []);
  var hs = [];
  for (var i = 0; i < raw.length; i++) {
    var h = parseInt(raw[i]['height'] || 0, 10);
    hs.push(isNaN(h) ? 0 : h);
  }
  return [hs.length ? Math.max.apply(null, hs) : 0, raw.length];
}

async function extractVideo(videoId, wantHeight, retry) {
  wantHeight = wantHeight || 0;
  var cached = _extractCache[videoId];
  if (cached && cached.expires > nowMs()) {
    var ch = 0;
    var cf = (cached.data || {}).formats || [];
    for (var ci = 0; ci < cf.length; ci++) ch = Math.max(ch, parseInt(cf[ci].height || 0, 10) || 0);
    if (!wantHeight || ch >= parseInt(wantHeight, 10)) return cached.data;
  }

  var watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
  var page = await httpText(watchUrl, 'GET', null, BASE_HEADER, TIMEOUT_PAGE);
  if (!page) throw new Error('watch 页面拉取失败（网络不通或被拦）');

  var ytcfg = extractYtcfg(page) || {};
  var playerResponse = extractInitialPlayerResponse(page) || {};
  var playerUrl = extractPlayerUrl(page);
  var apiKey = ytcfg['INNERTUBE_API_KEY'] || reSearch(/"INNERTUBE_API_KEY":"([^"]+)"/, page);
  var visitorData = _visitorData ||
    ytcfg['VISITOR_DATA'] ||
    (((ytcfg['INNERTUBE_CONTEXT'] || {}).client || {}).visitorData) ||
    ((playerResponse['responseContext'] || {}).visitorData);
  if (visitorData && !_visitorData) _visitorData = visitorData;

  // 还原签名/n-param 必须先拿到 base.js（本地执行，无中转）
  if (playerUrl) await getPlayerCode(playerUrl);
  var sts = playerUrl ? await extractSignatureTimestamp(playerUrl) : null;

  var responses = [];
  if (playerResponse && Object.keys(playerResponse).length) responses.push(playerResponse);
  if (apiKey) {
    var apiResponses = await callPlayerApi(videoId, apiKey, visitorData, sts);
    for (var i = 0; i < apiResponses.length; i++) { if (apiResponses[i]) responses.push(apiResponses[i]); }
  }

  var ok = [];
  for (var j = 0; j < responses.length; j++) {
    if (((responses[j]['playabilityStatus'] || {}).status) === 'OK') ok.push(responses[j]);
  }
  var chosen;
  if (ok.length) {
    // 各客户端画质上限不同：挑「分辨率最高、格式最多」的那份
    chosen = ok[0];
    var bestScore = respHeight(ok[0]);
    for (var jj = 1; jj < ok.length; jj++) {
      var sc = respHeight(ok[jj]);
      if (sc[0] > bestScore[0] || (sc[0] === bestScore[0] && sc[1] > bestScore[1])) { chosen = ok[jj]; bestScore = sc; }
    }
  } else {
    chosen = playerResponse || {};
    for (var j3 = 0; j3 < responses.length; j3++) { if (responses[j3]) { chosen = responses[j3]; break; } }
  }
  playerResponse = chosen;

  var status = ((playerResponse['playabilityStatus'] || {}).status) || '';
  var streaming0 = playerResponse['streamingData'] || {};
  var hasStreaming0 = false;
  for (var sk in streaming0) { if (Object.prototype.hasOwnProperty.call(streaming0, sk)) { hasStreaming0 = true; break; } }
  if (status && status !== 'OK' && status !== 'LIVE_STREAM_OFFLINE' && !hasStreaming0) {
    var reason = (playerResponse['playabilityStatus'] || {}).reason || status;
    throw new Error('YouTube 不可播放: ' + reason);
  }

  var details = playerResponse['videoDetails'] || {};
  var rawFormats = [];
  var seenRaw = {};
  for (var r = 0; r < responses.length; r++) {
    var rs = (responses[r] || {})['streamingData'] || {};
    var sourceRaw = (rs['formats'] || []).concat(rs['adaptiveFormats'] || []);
    for (var f = 0; f < sourceRaw.length; f++) {
      var raw = sourceRaw[f];
      var key = String(raw['itag']) + '|' + String(raw['url'] || raw['signatureCipher'] || raw['cipher'] || raw['mimeType'] || '');
      if (seenRaw[key]) continue;
      seenRaw[key] = true;
      var copy = {};
      for (var rk in raw) { if (Object.prototype.hasOwnProperty.call(raw, rk)) copy[rk] = raw[rk]; }
      copy['_client_name'] = (responses[r] || {})['_client_name'];
      copy['_client_ua'] = (responses[r] || {})['_client_ua'];
      rawFormats.push(copy);
    }
  }

  var formats = [];
  for (var rf = 0; rf < rawFormats.length; rf++) {
    var item = normalizeFormat(rawFormats[rf], playerUrl);
    if (item && item.url) formats.push(item);
  }
  if (!formats.length) throw new Error('未获取到可用播放地址');

  // 想要 4K 但这一轮最高只到 1080P/720P：换一轮再取（各客户端画质上限不同）
  var bestH = 0;
  for (var b = 0; b < formats.length; b++) bestH = Math.max(bestH, parseInt(formats[b].height || 0, 10) || 0);
  if (wantHeight && bestH < parseInt(wantHeight, 10) && !retry) {
    delete _extractCache[videoId];
    await sleep(300);
    return extractVideo(videoId, wantHeight, true);
  }

  var data = {
    id: videoId,
    title: details['title'] || videoId,
    duration: parseInt(details['lengthSeconds'] || 0, 10) || 0,
    formats: formats,
    is_live: !!details['isLive']
  };
  _extractCache[videoId] = { data: data, expires: nowMs() + EXTRACT_CACHE_TTL };
  return data;
}

// ---------- 直播取流 ----------
async function callLivePlayerApi(videoId, apiKey, visitorData) {
  for (var i = 0; i < INNERTUBE_CLIENTS.length; i++) {
    var ci = INNERTUBE_CLIENTS[i];
    var clientName = ci.clientName || 'ANDROID_VR';
    try {
      var url = 'https://www.youtube.com/youtubei/v1/player?key=' + encodeURIComponent(apiKey) + '&prettyPrint=false';
      var headers = {};
      for (var bk in BASE_HEADER) { if (Object.prototype.hasOwnProperty.call(BASE_HEADER, bk)) headers[bk] = BASE_HEADER[bk]; }
      headers['Content-Type'] = 'application/json';
      headers['Origin'] = 'https://www.youtube.com';
      headers['Referer'] = 'https://www.youtube.com/watch?v=' + videoId;
      headers['X-YouTube-Client-Name'] = String(clientNameId(clientName));
      headers['X-YouTube-Client-Version'] = ci.clientVersion || '';
      if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;
      if (ci.userAgent) headers['User-Agent'] = ci.userAgent;

      var clientCtx = {};
      for (var ck in ci) { if (Object.prototype.hasOwnProperty.call(ci, ck)) clientCtx[ck] = ci[ck]; }
      var payload = { context: { client: clientCtx }, videoId: videoId, contentCheckOk: true, racyCheckOk: true };
      var poToken = getPoToken(clientName, 'gvs');
      if (poToken) payload['serviceIntegrityDimensions'] = { poToken: poToken };

      var data = await httpJson(url, 'POST', JSON.stringify(payload), headers, TIMEOUT_API);
      if (!data) continue;
      var streaming = data['streamingData'] || {};
      if (streaming['hlsManifestUrl']) { data['_client_name'] = clientName; return data; }
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function extractLive(videoId) {
  var cached = _liveCache[videoId];
  if (cached && cached.expires > nowMs()) return cached.data;

  var watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
  var page = await httpText(watchUrl, 'GET', null, BASE_HEADER, TIMEOUT_PAGE);
  if (!page) throw new Error('watch 页面拉取失败（网络不通或被拦）');

  var playerResponse = extractInitialPlayerResponse(page) || {};
  var ytcfg = extractYtcfg(page) || {};
  var apiKey = ytcfg['INNERTUBE_API_KEY'] || reSearch(/"INNERTUBE_API_KEY":"([^"]+)"/, page);
  var visitorData = _visitorData ||
    ytcfg['VISITOR_DATA'] ||
    (((ytcfg['INNERTUBE_CONTEXT'] || {}).client || {}).visitorData) ||
    ((playerResponse['responseContext'] || {}).visitorData);
  if (visitorData && !_visitorData) _visitorData = visitorData;

  var statusObj = playerResponse['playabilityStatus'] || {};
  var streaming = playerResponse['streamingData'] || {};
  var details = playerResponse['videoDetails'] || {};

  var pageHlsUrl = streaming['hlsManifestUrl'] || '';
  if (apiKey) {
    var apiData = await callLivePlayerApi(videoId, apiKey, visitorData);
    if (apiData) {
      var apiStreaming = apiData['streamingData'] || {};
      var apiDetails = apiData['videoDetails'] || {};
      var apiHlsUrl = apiStreaming['hlsManifestUrl'] || '';
      var apiHasStreaming = false;
      for (var sk in apiStreaming) { if (Object.prototype.hasOwnProperty.call(apiStreaming, sk)) { apiHasStreaming = true; break; } }
      if (apiHlsUrl) streaming = apiStreaming;
      else if (!pageHlsUrl && apiHasStreaming) streaming = apiStreaming;
      if (apiDetails && Object.keys(apiDetails).length) details = apiDetails;
      statusObj = apiData['playabilityStatus'] || statusObj;
    }
  }

  if (!(streaming['hlsManifestUrl'] || '') && pageHlsUrl) streaming['hlsManifestUrl'] = pageHlsUrl;

  var hlsUrl = streaming['hlsManifestUrl'] || '';
  var data = {
    id: videoId,
    title: details['title'] || videoId,
    is_live: !!(details['isLive'] || hlsUrl),
    status: statusObj['status'] || '',
    reason: statusObj['reason'] || '',
    hls_url: hlsUrl,
    duration: parseInt(details['lengthSeconds'] || 0, 10) || 0
  };
  _liveCache[videoId] = { data: data, expires: nowMs() + LIVE_CACHE_TTL };
  return data;
}

// ---------- 列表/搜索结果解析 ----------
function parseRenderer(renderer, isLive) {
  try {
    var vid = renderer['videoId'];
    if (!vid) {
      var nav = renderer['navigationEndpoint'] || {};
      vid = (nav['watchEndpoint'] || {}).videoId;
    }
    if (!vid) return null;

    var actuallyLive = false;
    var badges = renderer['badges'] || [];
    for (var i = 0; i < badges.length; i++) {
      var badge = badges[i];
      if (badge && typeof badge === 'object') {
        var text = badge['text'] || badge['label'] || '';
        if (String(text).indexOf('直播') >= 0 || String(text).toUpperCase().indexOf('LIVE') >= 0) { actuallyLive = true; break; }
      }
    }
    if (!isLive && actuallyLive) return null;

    var titleObj = renderer['title'] || renderer['headline'] || {};
    var title = titleObj['simpleText'] || '';
    if (!title && titleObj['runs']) {
      for (var r = 0; r < titleObj['runs'].length; r++) title += titleObj['runs'][r]['text'] || '';
    }
    if (!title) title = 'YouTube Video';

    var dur = '';
    if (!actuallyLive) {
      var durObj = renderer['lengthText'] || {};
      dur = durObj['simpleText'] || '';
    }
    var remarks = actuallyLive ? '直播' : (dur || '视频');

    return {
      vod_id: String(vid),
      vod_name: unesc(title),
      vod_pic: 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg',
      vod_remarks: remarks
    };
  } catch (e) {
    return null;
  }
}

function extractVideosFromApi(data, limit) {
  limit = limit || 30;
  var videos = [];
  var seen = {};
  function scan(obj) {
    if (videos.length >= limit) return;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) scan(obj[i]);
    } else if (obj && typeof obj === 'object') {
      var keys = ['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer'];
      for (var k = 0; k < keys.length; k++) {
        if (obj[keys[k]]) {
          var item = parseRenderer(obj[keys[k]], false);
          if (item && !seen[item.vod_id]) { seen[item.vod_id] = true; videos.push(item); }
        }
      }
      for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) scan(obj[key]); }
    }
  }
  scan(data);
  return videos.slice(0, limit);
}

function extractLiveVideosFromApi(data, limit) {
  limit = limit || 30;
  var videos = [];
  var seen = {};
  function scan(obj) {
    if (videos.length >= limit) return;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) scan(obj[i]);
    } else if (obj && typeof obj === 'object') {
      var keys = ['videoRenderer', 'compactVideoRenderer', 'gridVideoRenderer'];
      for (var k = 0; k < keys.length; k++) {
        if (obj[keys[k]]) {
          var item = parseRenderer(obj[keys[k]], true);
          if (item && !seen[item.vod_id]) { seen[item.vod_id] = true; videos.push(item); }
        }
      }
      for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) scan(obj[key]); }
    }
  }
  scan(data);
  return videos.slice(0, limit);
}

function extractContinuationToken(data) {
  var tokens = [];
  function scan(obj) {
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) scan(obj[i]);
    } else if (obj && typeof obj === 'object') {
      var endpoint = obj['continuationEndpoint'] || {};
      var t1 = ((endpoint['continuationCommand'] || {}).token);
      if (t1) tokens.push(t1);
      var renderer = obj['continuationItemRenderer'] || {};
      var t2 = (((renderer['continuationEndpoint'] || {})['continuationCommand'] || {}).token);
      if (t2) tokens.push(t2);
      for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) scan(obj[key]); }
    }
  }
  scan(data);
  return tokens.length ? tokens[0] : '';
}

function extractVideosFixed(htmlStr, limit) {
  limit = limit || 30;
  var data = null;
  var match = String(htmlStr || '').match(/var ytInitialData = (\{.*?\});/);
  if (match) { try { data = JSON.parse(match[1]); } catch (e) { data = null; } }
  // 原 py 这里只用严格单行正则；补一层同样的 json 配平解析（与搜索结果页走同一路径）
  if (!data) data = extractJsonAfter(htmlStr, 'ytInitialData');
  if (!data) return [];
  return extractVideosFromApi(data, limit);
}

async function getVideoTitle(vid) {
  try {
    var txt = await httpText('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + vid + '&format=json', 'GET', null, BASE_HEADER, TIMEOUT_OTHER);
    var j = JSON.parse(txt);
    return j['title'] || vid;
  } catch (e) {
    return vid;
  }
}

// ---------- 搜索分页（带 continuation） ----------
function searchCacheKey(key) { return String(key || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

async function fetchSearchFirstPage(key, live) {
  var searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(String(key || '')) + (live ? '&sp=EgJAAQ%253D%253D' : '');
  var htmlStr = await httpText(searchUrl, 'GET', null, BASE_HEADER, TIMEOUT_PAGE);
  var data = extractJsonAfter(htmlStr, 'ytInitialData') || {};
  var ytcfg = extractYtcfg(htmlStr) || {};
  autoSaveVisitorData(ytcfg, data);
  var apiKey = ytcfg['INNERTUBE_API_KEY'] || reSearch(/"INNERTUBE_API_KEY":"([^"]+)"/, htmlStr);
  var context = ytcfg['INNERTUBE_CONTEXT'] || { client: { clientName: 'WEB', clientVersion: '2.20240310.01.00', hl: 'zh-CN', gl: 'US' } };
  var client = context['client'] || {};
  return {
    key: key,
    api_key: apiKey,
    context: context,
    client_name: client['clientName'] || 'WEB',
    client_version: client['clientVersion'] || '2.20240310.01.00',
    referer: searchUrl,
    pages: [live ? extractLiveVideosFromApi(data, 30) : extractVideosFromApi(data, 30)],
    next: extractContinuationToken(data)
  };
}

async function fetchSearchContinuation(session) {
  var token = session['next'];
  var apiKey = session['api_key'];
  if (!token || !apiKey) return {};
  var url = 'https://www.youtube.com/youtubei/v1/search?key=' + encodeURIComponent(apiKey);
  var headers = {};
  for (var bk in BASE_HEADER) { if (Object.prototype.hasOwnProperty.call(BASE_HEADER, bk)) headers[bk] = BASE_HEADER[bk]; }
  headers['Content-Type'] = 'application/json';
  headers['Origin'] = 'https://www.youtube.com';
  headers['Referer'] = session['referer'] || 'https://www.youtube.com/';
  headers['X-YouTube-Client-Name'] = String(clientNameId(session['client_name']));
  headers['X-YouTube-Client-Version'] = session['client_version'] || '2.20240310.01.00';
  var payload = { context: session['context'] || {}, continuation: token };
  var data = await httpJson(url, 'POST', JSON.stringify(payload), headers, TIMEOUT_API);
  if (!data) return {};
  autoSaveVisitorData(null, data);
  return data;
}

function autoSaveVisitorData(ytcfg, data) {
  var vd = '';
  if (ytcfg) {
    vd = ytcfg['VISITOR_DATA'] || (((ytcfg['INNERTUBE_CONTEXT'] || {}).client || {}).visitorData) || '';
  }
  if (!vd && data && typeof data === 'object') {
    vd = ((data['responseContext'] || {}).visitorData) || ((data['client'] || {}).visitorData) || '';
  }
  if (vd && !_visitorData) _visitorData = vd;
}

async function searchPage(key, page, live) {
  page = Math.max(1, parseInt(page || 1, 10) || 1);
  var store = live ? _liveSearchCache : _searchCache;
  var cacheKey = (live ? 'live_' : '') + searchCacheKey(key);
  var session = cacheGet(store, cacheKey);
  if (page === 1 || !session) {
    session = await fetchSearchFirstPage(key, live);
    cacheSet(store, cacheKey, session, SEARCH_CACHE_TTL);
  }
  var guard = 0;
  while ((session['pages'] || []).length < page && session['next'] && guard < 6) {
    guard++;
    var data = await fetchSearchContinuation(session);
    var videos = live ? extractLiveVideosFromApi(data, 30) : extractVideosFromApi(data, 30);
    if (!session['pages']) session['pages'] = [];
    session['pages'].push(videos);
    session['next'] = extractContinuationToken(data);
  }
  var pages = session['pages'] || [];
  var out = pages.length >= page ? pages[page - 1] : [];
  var hasMore = !!session['next'] || pages.length > page;
  return [out, hasMore];
}

// ---------- 关键词构造 ----------
function isLiveCategory(cid) {
  var c = String(cid || '').toLowerCase();
  return c.indexOf('live') >= 0 || c.indexOf('直播') >= 0;
}

function normalizeFilterTerm(value) {
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) { if (value[i]) arr.push(normalizeFilterTerm(value[i])); }
    return arr.join(' ');
  }
  if (value && typeof value === 'object') {
    var obj = [];
    for (var k in value) { if (Object.prototype.hasOwnProperty.call(value, k) && value[k]) obj.push(normalizeFilterTerm(value[k])); }
    return obj.join(' ');
  }
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function buildLiveKeyword(cid, filters) {
  var terms = [cid];
  if (filters && typeof filters === 'object') {
    for (var k in filters) {
      if (!Object.prototype.hasOwnProperty.call(filters, k)) continue;
      var term = normalizeFilterTerm(filters[k]);
      if (term) terms.push(term);
    }
  }
  var keyword = terms.join(' ').trim();
  if (keyword.toLowerCase().indexOf('live') < 0 && keyword.indexOf('直播') < 0) keyword = keyword + ' live';
  return keyword;
}

function buildVideoKeyword(cid, filters) {
  var keyword;
  if (String(cid || '').indexOf('LIST:') === 0) {
    var raw = String(cid).slice(5).trim();
    var channels = raw.split(',');
    var terms = [];
    for (var i = 0; i < channels.length; i++) {
      var ch = channels[i].trim();
      if (!ch) continue;
      terms.push(ch.charAt(0) === '@' ? 'channel:' + ch : '"' + ch + '"');
    }
    keyword = terms.length ? terms.join(' OR ') : '';
  } else {
    keyword = String(cid || '');
  }
  if (filters && typeof filters === 'object') {
    for (var k in filters) {
      if (!Object.prototype.hasOwnProperty.call(filters, k)) continue;
      var term = normalizeFilterTerm(filters[k]);
      if (term) keyword += ' ' + term;
    }
  }
  return keyword.trim();
}

// ---------- 首页 ----------
async function homeList() {
  var now = nowMs();
  if (_homeCache && now - _homeCache[0] < 300000) return _homeCache[1];
  var items;
  try {
    var pair = await categoryPage(CAT_MOVIE, '1', {});
    items = (pair && pair[0]) || [];
    if (!items.length) {
      items = [{ vod_id: 'diag0', vod_name: '⚠️ 首页取到 0 条：YouTube 返回空，试试“搜索”或上方分类', vod_pic: '', vod_remarks: '诊断' }];
    }
  } catch (e) {
    var msg = (String(e && e.message).slice(0, 70) || 'Error');
    items = [{ vod_id: 'diag1', vod_name: '⚠️ 首页取数失败：' + msg + '（本机需能访问 YouTube）', vod_pic: '', vod_remarks: '诊断' }];
  }
  _homeCache = [now, items];
  return items;
}

async function categoryPage(cid, page, filters) {
  page = parseInt(page || 1, 10) || 1;
  if (isLiveCategory(cid)) {
    var liveKey = buildLiveKeyword(cid, filters);
    return await searchPage(liveKey, page, true);
  }
  var keyword = buildVideoKeyword(cid, filters);
  return await searchPage(keyword, page, false);
}

// ---------- 详情 ----------
async function detailOne(videoId) {
  videoId = String(videoId || '').trim();
  if (!videoId) return null;

  var title = videoId;
  var isLive = false;
  var status = '视频';
  var hasSuper = false;
  var has4k = false;

  try {
    var data = await extractVideo(videoId);
    title = data.title || videoId;
    isLive = !!data.is_live;
    status = isLive ? '直播中' : '视频';
    if (!isLive) {
      var formats = data.formats || [];
      var allVideos = [];
      for (var i = 0; i < formats.length; i++) {
        if (formats[i].vcodec !== 'none' && formats[i].acodec === 'none') allVideos.push(formats[i]);
      }
      var highRes = [];
      var has4kFlag = false;
      for (var j = 0; j < allVideos.length; j++) {
        var h = parseInt(allVideos[j].height || 0, 10) || 0;
        if (h >= 720) highRes.push(allVideos[j]);
        if (h >= 2160) has4kFlag = true;
      }
      hasSuper = highRes.length > 0;
      has4k = has4kFlag;
    }
  } catch (e) {
    isLive = false;
    title = (await getVideoTitle(videoId)) || videoId;
    status = '视频';
  }

  var related = [];
  try {
    var html = await httpText('https://www.youtube.com/watch?v=' + videoId, 'GET', null, BASE_HEADER, TIMEOUT_PAGE);
    related = extractVideosFixed(html, 20);
    autoSaveVisitorData(extractYtcfg(html));
  } catch (e) {}

  var safe = safeTitle(title);
  var playSources = [];
  var playUrls = [];

  if (isLive) {
    playSources.push('直播');
    playUrls.push(safe + '$' + videoId + '@' + QUALITY_LIVE);
  } else {
    if (has4k) {
      playSources.push('4K·2160P');
      playUrls.push(safe + '$' + videoId + '@' + QUALITY_4K);
    }
    if (hasSuper) {
      playSources.push('高清·省流');
      playUrls.push(safe + '$' + videoId + '@' + QUALITY_SUPER);
    }
    playSources.push('通用·稳定');
    playUrls.push(safe + '$' + videoId + '@' + QUALITY_NORMAL);
  }

  if (related.length) {
    var segs = [];
    for (var r = 0; r < related.length; r++) {
      if (related[r].vod_id === videoId) continue;
      segs.push(safeTitle(related[r].vod_name) + '$' + related[r].vod_id + '@' + QUALITY_NORMAL);
    }
    if (segs.length) {
      playSources.push('相关推荐');
      playUrls.push(segs.join('#'));
    }
  }

  return {
    vod_id: videoId,
    vod_name: title,
    vod_pic: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
    vod_remarks: status,
    vod_content: status,
    vod_play_from: playSources.join('$$$'),
    vod_play_url: playUrls.join('$$$')
  };
}

// ---------- 播放 ----------
function pickSingleFile(formats) {
  var singles = [];
  for (var i = 0; i < (formats || []).length; i++) {
    var f = formats[i];
    if (f.vcodec !== 'none' && f.acodec !== 'none') singles.push(f);
  }
  if (!singles.length) return null;
  singles.sort(function (a, b) {
    var ha = parseInt(a.height || 0, 10) || 0, hb = parseInt(b.height || 0, 10) || 0;
    if (hb !== ha) return hb - ha;
    return (parseInt(b.bitrate || 0, 10) || 0) - (parseInt(a.bitrate || 0, 10) || 0);
  });
  return singles[0];
}

function isAv1OrVp9(codecs) { return String(codecs || '').indexOf('av01') >= 0 || String(codecs || '').indexOf('vp9') >= 0; }
function isH264(codecs) { return String(codecs || '').indexOf('avc') >= 0 || String(codecs || '').indexOf('h264') >= 0; }

function filterAndSort(videos) {
  var high = [];
  for (var i = 0; i < videos.length; i++) { if ((parseInt(videos[i].height || 0, 10) || 0) >= 720) high.push(videos[i]); }
  var candidates = high.length ? high : videos.slice(0);
  candidates.sort(function (a, b) {
    var ha = parseInt(a.height || 0, 10) || 0, hb = parseInt(b.height || 0, 10) || 0;
    if (hb !== ha) return hb - ha;
    return (parseInt(b.bitrate || 0, 10) || 0) - (parseInt(a.bitrate || 0, 10) || 0);
  });
  var seenRes = {}, result = [];
  for (var j = 0; j < candidates.length; j++) {
    var h = parseInt(candidates[j].height || 0, 10) || 0;
    if (!seenRes[h]) { seenRes[h] = true; result.push(candidates[j]); }
  }
  return result;
}

// 对应 py 的 _play_video 里 target_videos 的挑选（保持画质/编码偏好不变）
function selectTracks(formats, quality) {
  var allVideos = [];
  for (var i = 0; i < formats.length; i++) {
    if (formats[i].vcodec !== 'none' && formats[i].acodec === 'none') allVideos.push(formats[i]);
  }
  if (!allVideos.length) {
    for (var i2 = 0; i2 < formats.length; i2++) { if (formats[i2].vcodec !== 'none') allVideos.push(formats[i2]); }
  }

  var targetVideos = [];

  if (quality === QUALITY_4K) {
    var fourK = [];
    for (var i3 = 0; i3 < allVideos.length; i3++) { if ((parseInt(allVideos[i3].height || 0, 10) || 0) >= 2160) fourK.push(allVideos[i3]); }
    var av1_4k = [];
    for (var i4 = 0; i4 < fourK.length; i4++) { if (isAv1OrVp9(fourK[i4].codecs)) av1_4k.push(fourK[i4]); }
    targetVideos = filterAndSort(av1_4k.length ? av1_4k : fourK);
    if (!targetVideos.length) quality = QUALITY_SUPER; // 没 4K 轨就按高清逻辑走
  }

  if (quality === QUALITY_SUPER) {
    var av1Vp9 = [];
    for (var i5 = 0; i5 < allVideos.length; i5++) { if (isAv1OrVp9(allVideos[i5].codecs)) av1Vp9.push(allVideos[i5]); }
    if (av1Vp9.length) {
      targetVideos = filterAndSort(av1Vp9);
    } else {
      var webm = [];
      for (var i6 = 0; i6 < allVideos.length; i6++) { if (allVideos[i6].ext === 'webm') webm.push(allVideos[i6]); }
      targetVideos = webm.length ? filterAndSort(webm) : filterAndSort(allVideos);
    }
  } else if (quality === QUALITY_NORMAL) {
    var h264 = [];
    for (var i7 = 0; i7 < allVideos.length; i7++) { if (isH264(allVideos[i7].codecs)) h264.push(allVideos[i7]); }
    if (h264.length) {
      targetVideos = filterAndSort(h264);
    } else {
      var mp4 = [];
      for (var i8 = 0; i8 < allVideos.length; i8++) { if (allVideos[i8].ext === 'mp4') mp4.push(allVideos[i8]); }
      targetVideos = mp4.length ? filterAndSort(mp4) : filterAndSort(allVideos);
    }
  }

  var allRange = true;
  for (var i9 = 0; i9 < targetVideos.length; i9++) {
    if (!(targetVideos[i9].initRange && targetVideos[i9].indexRange && targetVideos[i9].initRange.start !== undefined && targetVideos[i9].indexRange.start !== undefined)) { allRange = false; break; }
  }
  if (targetVideos.length && !allRange) {
    var rangeVideos = [];
    for (var i10 = 0; i10 < allVideos.length; i10++) {
      var v = allVideos[i10];
      var hasInit = v.initRange && (v.initRange.start !== undefined && v.initRange.end !== undefined);
      var hasIndex = v.indexRange && (v.indexRange.start !== undefined && v.indexRange.end !== undefined);
      if (hasInit && hasIndex) rangeVideos.push(v);
    }
    if (rangeVideos.length) {
      rangeVideos.sort(function (a, b) {
        var ha = parseInt(a.height || 0, 10) || 0, hb = parseInt(b.height || 0, 10) || 0;
        if (hb !== ha) return hb - ha;
        return (parseInt(b.bitrate || 0, 10) || 0) - (parseInt(a.bitrate || 0, 10) || 0);
      });
      var seenRes = {}, final = [];
      for (var i11 = 0; i11 < rangeVideos.length; i11++) {
        var h = parseInt(rangeVideos[i11].height || 0, 10) || 0;
        if (!seenRes[h]) { seenRes[h] = true; final.push(rangeVideos[i11]); }
      }
      targetVideos = final;
    }
  }

  if (!targetVideos.length) {
    allVideos.sort(function (a, b) {
      var ha = parseInt(a.height || 0, 10) || 0, hb = parseInt(b.height || 0, 10) || 0;
      if (hb !== ha) return hb - ha;
      return (parseInt(b.bitrate || 0, 10) || 0) - (parseInt(a.bitrate || 0, 10) || 0);
    });
    var seen = {}, out = [];
    for (var i12 = 0; i12 < allVideos.length; i12++) {
      var h2 = parseInt(allVideos[i12].height || 0, 10) || 0;
      if (!seen[h2]) { seen[h2] = true; out.push(allVideos[i12]); if (out.length >= 3) break; }
    }
    targetVideos = out;
  }

  var audioCandidates = [];
  for (var i13 = 0; i13 < formats.length; i13++) {
    if (formats[i13].acodec !== 'none' && formats[i13].vcodec === 'none') audioCandidates.push(formats[i13]);
  }
  if (!audioCandidates.length) {
    for (var i14 = 0; i14 < formats.length; i14++) { if (formats[i14].acodec !== 'none') audioCandidates.push(formats[i14]); }
  }
  audioCandidates.sort(function (a, b) {
    var ma = a.ext === 'mp4' ? 1 : 0, mb = b.ext === 'mp4' ? 1 : 0;
    if (mb !== ma) return mb - ma;
    return (parseInt(b.bitrate || 0, 10) || 0) - (parseInt(a.bitrate || 0, 10) || 0);
  });

  return { target_videos: targetVideos, audio_item: audioCandidates.length ? audioCandidates[0] : null };
}

function mediaHeader(fmt) {
  var h = {};
  for (var k in BASE_HEADER) { if (Object.prototype.hasOwnProperty.call(BASE_HEADER, k)) h[k] = BASE_HEADER[k]; }
  var src = (fmt && fmt.headers) || {};
  for (var k2 in src) { if (Object.prototype.hasOwnProperty.call(src, k2)) h[k2] = src[k2]; }
  h['Referer'] = 'https://www.youtube.com/';
  return h;
}

function hlsMasterHeader() {
  return {
    'User-Agent': UA_WEB,
    'Accept': '*/*',
    'Origin': 'https://www.youtube.com',
    'Referer': 'https://www.youtube.com/'
  };
}

async function playVideo(videoId, quality) {
  try {
    var data = await extractVideo(videoId, quality === QUALITY_4K ? 2160 : 0);
    var formats = data.formats || [];
    var tracks = selectTracks(formats, quality);

    // 客户端本地包不能起本地端口做 DASH 合成（原 py 的 MPD 代理走 127.0.0.1:9978），
    // 所以等价于原 py「本地代理不可用」的分支：优先给带音轨的单文件，其次给挑出的视频轨直链。
    var single = pickSingleFile(formats);
    var chosen = single || (tracks.target_videos.length ? tracks.target_videos[0] : null);
    if (!chosen || !chosen.url) {
      return { parse: 1, url: 'https://www.youtube.com/embed/' + videoId + '?autoplay=1', header: BASE_HEADER };
    }
    return { parse: 0, url: chosen.url, header: mediaHeader(chosen) };
  } catch (e) {
    return { parse: 1, url: 'https://www.youtube.com/embed/' + videoId + '?autoplay=1', header: BASE_HEADER };
  }
}

async function playLive(videoId) {
  try {
    var data = await extractLive(videoId);
    var hlsUrl = data.hls_url || '';
    if (!hlsUrl) throw new Error(data.reason || '未获取到直播 HLS 地址');
    // 原 py 会把 m3u8 交给本地代理重写；本地包不做中转，直接给直链 + 播放头
    return { parse: 0, url: hlsUrl, header: hlsMasterHeader(), format: 'application/x-mpegURL' };
  } catch (e) {
    return { parse: 1, url: 'https://www.youtube.com/embed/' + videoId + '?autoplay=1', header: BASE_HEADER };
  }
}

// ---------- 入参兼容 ----------
function bodyOf(b) {
  if (b && typeof b === 'object' && b.body && typeof b.body === 'object') return b.body;
  return (b && typeof b === 'object') ? b : {};
}
function firstOf(v) { return Array.isArray(v) ? v[0] : v; }
function filtersOf(body) {
  var out = {};
  var src = (body.filters && typeof body.filters === 'object') ? body.filters
    : ((body.ext && typeof body.ext === 'object') ? body.ext : null);
  if (src) {
    for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]; }
  }
  // 壳子也可能把筛选键平铺在 body 上
  var flat = ['topic', 'tid', 'date'];
  for (var i = 0; i < flat.length; i++) {
    var key = flat[i];
    if (out[key] === undefined && body[key] !== undefined && typeof body[key] !== 'object') out[key] = body[key];
  }
  return out;
}

// ---------- 客户端包站点对象 ----------
var YT_SRC = {
  meta: {
  key: 'py_youtube_video',
  name: '▶️YouTube', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },

  init: async function () {
    return {};
  },

  home: async function () {
    var filters = {};
    for (var i = 0; i < YOUTUBE_CLASSES.length; i++) {
      var cid = YOUTUBE_CLASSES[i].type_id;
      if (CATEGORY_FILTERS[cid]) filters[cid] = CATEGORY_FILTERS[cid];
    }
    var list = [];
    try { list = await homeList(); } catch (e) { list = []; }
    return { class: YOUTUBE_CLASSES, filters: filters, list: list };
  },

  category: async function (b) {
    var body = bodyOf(b);
    var cid = body.id || body.tid || body.type_id || CAT_MOVIE;
    var page = parseInt(body.page || body.pg || 1, 10) || 1;
    var filters = filtersOf(body);
    var pair = [ [], false ];
    try { pair = await categoryPage(cid, page, filters); } catch (e) { pair = [[], false]; }
    var list = pair[0] || [], hasMore = !!pair[1];
    return {
      page: page,
      pagecount: hasMore ? page + 1 : page,
      limit: list.length,
      total: list.length,
      list: list
    };
  },

  detail: async function (b) {
    var body = bodyOf(b);
    var id = firstOf(body.ids || body.id || body.vod_id);
    if (!id) return { list: [] };
    var vod = null;
    try { vod = await detailOne(id); } catch (e) { vod = null; }
    return vod && vod.vod_id ? { list: [vod] } : { list: [] };
  },

  search: async function (b) {
    var body = bodyOf(b);
    var wd = String(body.wd || body.word || body.keyword || '').trim();
    var page = parseInt(body.page || body.pg || 1, 10) || 1;
    if (!wd) return { list: [] };

    var videosV = [], videosL = [];
    try { videosV = (await searchPage(wd, page, false))[0] || []; } catch (e) { videosV = []; }
    var liveKeyword = (wd.toLowerCase().indexOf('live') >= 0 || wd.indexOf('直播') >= 0) ? wd : (wd + ' live');
    try { videosL = (await searchPage(liveKeyword, page, true))[0] || []; } catch (e) { videosL = []; }

    var seen = {}, merged = [];
    var all = videosV.concat(videosL);
    for (var i = 0; i < all.length; i++) {
      if (!seen[all[i].vod_id]) { seen[all[i].vod_id] = true; merged.push(all[i]); }
    }
    merged = merged.slice(0, 30);
    return { page: page, list: merged };
  },

  play: async function (b) {
    var body = bodyOf(b);
    var id = String(firstOf(body.id || body.play || body.vod_id || body.url) || '');
    var rawPid = id.split('$').pop();
    var videoId = rawPid, qualityOrType = QUALITY_SUPER;
    if (rawPid.indexOf('@') >= 0) {
      var at = rawPid.lastIndexOf('@');
      videoId = rawPid.slice(0, at);
      qualityOrType = rawPid.slice(at + 1);
    }
    videoId = String(videoId || '').trim();
    if (!videoId) return { parse: 1, url: id };

    if (qualityOrType === QUALITY_LIVE) return playLive(videoId);
    return playVideo(videoId, qualityOrType);
  }
};

export default function createSpider() {
  return {
    meta: YT_SRC.meta,
    api: async function(fastify) {
      fastify.post('/init', async function(request) { return YT_SRC.init(request.body || {}); });
      fastify.post('/home', async function(request) { return YT_SRC.home(request.body || {}); });
      fastify.post('/category', async function(request) { return YT_SRC.category(request.body || {}); });
      fastify.post('/detail', async function(request) { return YT_SRC.detail(request.body || {}); });
      fastify.post('/search', async function(request) { return YT_SRC.search(request.body || {}); });
      fastify.post('/play', async function(request) { return YT_SRC.play(request.body || {}); });
    }
  };
}
