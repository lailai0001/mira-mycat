import req from '../../util/req.js';

'use strict';
/*
 * 新6V（www.xb6v.com）· CatPaw 迷你引擎模块
 * ---------------------------------------------------------------------------
 * 站点现状（2026-10-21 实测，整站 200，无需登录）：
 *   · 首页 / 与分类 /{xijupian,dongzuopian,...}/index.html；
 *     翻页 /{分类}/index_2.html、index_3.html ...（第 1 页是 index.html）
 *   · 列表 #post_container > li.post，a.zoom 带 title，img 是封面，
 *     .info_date 是更新日期。
 *   · 详情 /{分类}/{id}.html：#post_content 里是 ◎字段 文本 + 磁力/网盘，
 *     在线线路是 h3「播放地址…」下面的 a.lBtn，指向 /e/DownSys/play/?...
 *   · 播放：/e/DownSys/play/ 页面里是 iframe（play.phimgood.com/share/...），
 *     iframe 页面里有 const url = "/日期/.../index.m3u8?sign=..."，
 *     拼成绝对地址后实测 200 application/vnd.apple.mpegurl，真实可播。
 *   · 搜索：站点已从 /e/search/1index.php 换成 /e/search/so.php，
 *     POST 后 302 到 /e/search/result/?searchid=...，结果页仍是 #post_container。
 *
 * 2026-10-21 修复：原文件 推荐 是字符串 '*'、一级用 fetch 后把 Response 交给
 * cheerio、搜索打的是已 404 的 1index.php —— 首页/分类/搜索全空。
 * 现改为只用全局 req + 正则解析。
 */

const HOST = 'https://www.xb6v.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
const HEADERS = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9' };

const CLASSES = [
  { type_id: 'xijupian', type_name: '喜剧片' },
  { type_id: 'dongzuopian', type_name: '动作片' },
  { type_id: 'aiqingpian', type_name: '爱情片' },
  { type_id: 'kehuanpian', type_name: '科幻片' },
  { type_id: 'kongbupian', type_name: '恐怖片' },
  { type_id: 'juqingpian', type_name: '剧情片' },
  { type_id: 'zhanzhengpian', type_name: '战争片' },
  { type_id: 'jilupian', type_name: '纪录片' },
  { type_id: 'donghuapian', type_name: '动画片' },
  { type_id: 'dianshiju', type_name: '电视剧' },
  { type_id: 'dianshiju/guoju', type_name: '国剧' },
  { type_id: 'dianshiju/rihanju', type_name: '日韩剧' },
  { type_id: 'dianshiju/oumeiju', type_name: '欧美剧' },
  { type_id: 'dianshiju/duanju', type_name: '短剧' },
  { type_id: 'ZongYi', type_name: '综艺' },
];

function str(v) {
  return v == null ? '' : String(v);
}

function bodyOf(request) {
  return (request && request.body) || {};
}

function decodeEntities(s) {
  return str(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(Number(n)); } catch (e) { return ''; }
    });
}

function htmlToText(s) {
  return decodeEntities(
    str(s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function clean(s) {
  return htmlToText(s).replace(/\s+/g, ' ').trim();
}

function safeName(s) {
  return clean(s).replace(/[#$]/g, ' ').trim();
}

function reqText(url, opt) {
  const o = opt || {};
  const headers = Object.assign({}, HEADERS, o.headers || {});
  return (async () => {
    try {
      const r = await req({ method: o.method || 'GET', url, headers, data: o.body, timeout: o.timeout || 20000, responseType: 'text', validateStatus: () => true, maxRedirects: 5 });
      return { status: Number(r.status) || 0, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''), headers: r.headers || {} };
    } catch (e) {
      if (typeof fetch !== 'undefined') {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), o.timeout || 20000);
          try {
            const r = await fetch(url, { method: o.method || 'GET', headers, body: o.body, signal: ctl.signal });
            const hdrs = {};
            r.headers.forEach((v, k) => { hdrs[k] = v; });
            return { status: Number(r.status) || 0, text: await r.text(), headers: hdrs };
          } finally { clearTimeout(timer); }
        } catch (e2) { /* fall through */ }
      }
      return { status: 0, text: '', headers: {}, error: str((e && e.message) || e) };
    }
  })();
}

function absUrl(u, base) {
  const s = str(u).trim();
  if (!s) return '';
  try {
    return new URL(s, base || HOST + '/').href;
  } catch (e) {
    return s;
  }
}

// ---------------------------------------------------------------- 列表
function parseList(html) {
  const out = [];
  const seen = new Set();
  const re = /<li class="post[^"]*">([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(str(html))) !== null) {
    const block = m[1];
    const href = (block.match(/<a[^>]+href="([^"]+\.html)"[^>]*class="zoom"/i) ||
      block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+\.html)"/i) ||
      block.match(/<a[^>]+href="([^"]+\.html)"/i) || [])[1];
    if (!href) continue;
    const id = absUrl(href);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let name = (block.match(/<a[^>]+class="zoom"[^>]*title="([^"]*)"/i) || block.match(/title="([^"]*)"/i) || [])[1] || '';
    if (!name) name = (block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '';
    const pic = (block.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    const remark = (block.match(/class="info_date[^"]*"[^>]*>([^<]{0,40})</i) || [])[1] || '';
    out.push({
      vod_id: id,
      vod_name: safeName(name),
      vod_pic: absUrl(decodeEntities(pic)),
      vod_remarks: clean(remark),
    });
  }
  return out.filter((x) => x.vod_id && x.vod_name);
}

// ---------------------------------------------------------------- 详情
function cleanTitle(raw) {
  let t = clean(raw).replace(/【[^】]*】/g, '').trim();
  t = t.replace(/\s*[-–—]\s*(?:新版\s*6v|旧版\s*66|6v电影|66影视|免费电影).*$/i, '').trim();
  if (t.includes(' - ')) t = t.split(' - ')[0].trim();
  return t;
}

function metaOf(text, keys) {
  for (const key of keys) {
    const pattern = key.split('').join('[\\s\\u3000]*');
    const m = text.match(new RegExp('◎\\s*' + pattern + '\\s*[:：]?\\s*([^\\n◎]{1,200})'));
    if (m) return clean(m[1]).replace(/^[\/／]+|[\/／]+$/g, '').trim();
  }
  return '';
}

function detailOf(html, id) {
  const s = str(html);
  const vod = {
    vod_id: str(id),
    vod_name: '',
    vod_pic: '',
    vod_content: '',
    vod_remarks: '',
    vod_year: '',
    vod_area: '',
    vod_actor: '',
    vod_director: '',
    type_name: '',
    vod_play_from: '',
    vod_play_url: '',
  };

  const tm = s.match(/<title>([^<]{1,200})</i);
  if (tm) vod.vod_name = cleanTitle(tm[1]);
  if (!vod.vod_name) {
    const h = s.match(/<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i);
    if (h) vod.vod_name = cleanTitle(h[1]);
  }

  let content = '';
  const ci = s.indexOf('id="post_content"');
  if (ci >= 0) {
    content = s.slice(ci);
    const start = content.indexOf('>');
    if (start >= 0) content = content.slice(start + 1);
    const end = content.search(/<div class="widget|<div class="clear"|<div class="navigation/i);
    if (end > 0) content = content.slice(0, end);
  } else {
    content = s;
  }
  content = content.split(/<hr\s*\/?>/i)[0];
  const text = htmlToText(content);

  if (vod.vod_name.includes('新版6v') || vod.vod_name.includes('免费电影')) vod.vod_name = cleanTitle(vod.vod_name.replace(/新版.*$/, ''));
  if (!vod.vod_name) {
    const pm = text.match(/◎\s*中\s*文\s*名\s*[:：]?\s*([^\n◎]{1,80})/);
    if (pm) vod.vod_name = clean(pm[1]);
  }

  const pic = (content.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
  if (pic) vod.vod_pic = absUrl(decodeEntities(pic));

  vod.vod_year = metaOf(text, ['年代']);
  vod.vod_area = metaOf(text, ['产地']);
  vod.vod_actor = metaOf(text, ['主演', '演员']);
  vod.vod_director = metaOf(text, ['导演']);
  vod.type_name = metaOf(text, ['类别']);
  const intro = text.match(/◎\s*简\s*介\s*([\s\S]*)$/);
  vod.vod_content = clean(intro ? intro[1] : '').replace(/^[\/／]+|[\/／]+$/g, '');

  // 在线线路：h3 + a.lBtn
  const h3s = [...s.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => ({ at: m.index, name: clean(m[1]) }));
  const groups = [];
  const groupMap = {};
  for (const m of s.matchAll(/<a\b[^>]*class="lBtn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const at = m.index;
    const attrs = m[0];
    const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!href) continue;
    let h = null;
    for (const one of h3s) {
      if (one.at < at) h = one;
      else break;
    }
    let label = h ? h.name.replace(/^播放地址[（(]?/i, '').replace(/[）)]$/g, '').trim() : '';
    if (!label || label.length > 12 || /^[一二三四五六七八九十0-9]+$/.test(label)) label = '线路' + (groups.length + 1);
    const epName = clean((attrs.match(/\btitle\s*=\s*["']([^"']*)["']/i) || [])[1] || m[1]) || '正片';
    const key = label;
    if (!groupMap[key]) {
      groupMap[key] = { name: label, eps: [], seen: new Set() };
      groups.push(groupMap[key]);
    }
    const abs = absUrl(href);
    if (groupMap[key].seen.has(abs)) continue;
    groupMap[key].seen.add(abs);
    groupMap[key].eps.push(safeName(epName) + '$' + abs);
  }

  const magnets = [];
  const magSeen = new Set();
  for (const m of s.matchAll(/<a\b[^>]*href="(magnet:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (magSeen.has(m[1])) continue;
    magSeen.add(m[1]);
    magnets.push(safeName(m[2]) + '$' + decodeEntities(m[1]));
  }
  if (magnets.length) groups.push({ name: '磁力', eps: magnets });

  const froms = [];
  const urls = [];
  for (const g of groups) {
    if (!g.eps.length) continue;
    froms.push(g.name);
    urls.push(g.eps.join('#'));
  }
  vod.vod_play_from = froms.join('$$$');
  vod.vod_play_url = urls.join('$$$');
  return vod;
}

// ---------------------------------------------------------------- 播放
function noteOf(message) {
  return message ? { note: message } : {};
}

async function probeMedia(url, ref) {
  let cur = str(url);
  for (let hop = 0; hop < 4; hop += 1) {
    const r = await reqText(cur, {
      headers: { 'User-Agent': UA, Referer: ref || HOST + '/', Range: 'bytes=0-1024' },
      timeout: 15000,
    });
    if (!r.status) return false;
    if (r.status >= 300 && r.status < 400) {
      const loc = str(r.headers.location || r.headers.Location);
      if (!loc) return false;
      try { cur = new URL(loc, cur).href; } catch (e) { return false; }
      continue;
    }
    if (r.status !== 200 && r.status !== 206) return false;
    if (/mpegurl|video|octet-stream|dash|mp2t/i.test(str(r.headers['content-type'] || r.headers['Content-Type']))) return true;
    return /#EXTM3U|<MPD|<video/i.test(r.text.slice(0, 512));
  }
  return false;
}

async function playOf(raw) {
  let id = str(raw).trim();
  if (id.includes('$')) id = id.slice(id.lastIndexOf('$') + 1).trim();
  try { id = decodeURIComponent(id); } catch (e) { /* 保持原样 */ }
  if (!id) return { parse: 1, url: '', ...noteOf('缺少播放地址') };

  if (/(magnet:|ed2k:|ftp:|push:\/\/)/i.test(id)) {
    return { parse: 1, url: id, ...noteOf('磁力/网盘链接，不是 m3u8/mp4 直链；请用下载器或网盘客户端') };
  }
  if (/^https?:\/\//i.test(id) && /\.(?:m3u8|mp4|flv|mkv)(?:[?#]|$)/i.test(id)) {
    if (await probeMedia(id)) return { parse: 0, url: id, header: { 'User-Agent': UA, Referer: HOST + '/' } };
    return { parse: 1, url: id, ...noteOf('直链探测未通过（HTTP 非 200/206 或不是媒体内容）') };
  }

  let page = id;
  if (!/^https?:\/\//i.test(page)) page = HOST + (page.startsWith('/') ? page : '/' + page);
  const pageHtml = await reqText(page, { headers: { Referer: HOST + '/' } });
  if (!pageHtml.text) return { parse: 1, url: page, ...noteOf('播放页取不到') };
  const pageText = pageHtml.text.replace(/\\\//g, '/').replace(/&amp;/g, '&');

  let media = '';
  const iframe = (pageText.match(/<iframe[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
  if (iframe) {
    const iframeUrl = absUrl(decodeEntities(iframe), page);
    const ph = await reqText(iframeUrl, { headers: { Referer: page } });
    const pt = ph.text.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    let playerUrl = (pt.match(/(?:const|let|var)\s+url\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!playerUrl) playerUrl = (pt.match(/["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) || [])[1] || '';
    if (playerUrl) media = absUrl(playerUrl, iframeUrl);
  }
  if (!media) {
    const absMedia = pageText.match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i);
    if (absMedia) {
      media = absMedia[0];
    } else {
      const relMedia = pageText.match(/["'](\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
      if (relMedia) media = absUrl(relMedia[1], page);
    }
  }

  if (media) {
    if (await probeMedia(media, page)) {
      return { parse: 0, url: media, header: { 'User-Agent': UA, Referer: HOST + '/' } };
    }
  }
  return { parse: 1, url: page, ...noteOf('播放页/iframe 内未找到可直连的 m3u8/mp4，已返回播放页交给壳子嗅探') };
}

// ---------------------------------------------------------------- 入口辅助
function pageOf(body) {
  return Math.max(1, parseInt(body.page || body.pg, 10) || 1);
}

function detailId(body) {
  let raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids || body.vod_id || '';
  raw = str(raw).trim();
  if (raw.includes('@')) raw = raw.split('@')[0];
  if (!/^https?:\/\//i.test(raw) && raw.startsWith('/')) raw = HOST + raw;
  return raw;
}

async function searchList(wd) {
  const body = 'show=title&tempid=1&tbname=article&mid=1&dopost=search&submit=&keyboard=' + encodeURIComponent(wd);
  const r = await reqText(HOST + '/e/search/so.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: HOST + '/e/search/so.php',
    },
    body,
    timeout: 20000,
  });
  let html = r.text;
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.location || r.headers.Location || '';
    if (loc) {
      const u = absUrl(loc, HOST + '/e/search/so.php');
      const rr = await reqText(u, { headers: { Referer: HOST + '/' } });
      html = rr.text;
    }
  }
  return parseList(html);
}

// ---------------------------------------------------------------- 模块入口
export default function createSpider() {
  return {
  meta: { key: 'py_xin6v', name: '🧲磁力- 极速', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      const r = await reqText(HOST + '/', { timeout: 20000 });
      return { class: CLASSES, filters: {}, list: parseList(r.text).slice(0, 80) };
    });

    fastify.post('/category', async (request) => {
      const body = bodyOf(request);
      const tid = str(body.id || body.tid || body.type_id || 'xijupian').replace(/^\/+|\/+$/g, '');
      const page = pageOf(body);
      const base = '/' + tid + '/';
      const path = page <= 1 ? base + 'index.html' : base + 'index_' + page + '.html';
      const r = await reqText(HOST + path, { timeout: 20000 });
      const list = parseList(r.text);
      return {
        page,
        pagecount: list.length >= 18 ? page + 1 : page,
        limit: list.length,
        total: list.length ? 9999 : 0,
        list,
      };
    });

    fastify.post('/detail', async (request) => {
      const id = detailId(bodyOf(request));
      if (!id) return { list: [] };
      const r = await reqText(id, { headers: { Referer: HOST + '/' }, timeout: 20000 });
      if (!r.text) return { list: [] };
      return { list: [detailOf(r.text, id)] };
    });

    fastify.post('/search', async (request) => {
      const body = bodyOf(request);
      const wd = str(body.wd || body.keyword || body.searchKey || '').trim();
      if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };
      const list = await searchList(wd);
      return { page: 1, pagecount: 1, limit: list.length, total: list.length, list };
    });

    fastify.post('/play', async (request) => {
      const body = bodyOf(request);
      const raw = body.id || body.play || body.url || '';
      try {
        return await playOf(raw);
      } catch (e) {
        return { parse: 1, url: str(raw), ...noteOf('播放解析异常: ' + str((e && e.message) || e)) };
      }
    });
  },
};
}