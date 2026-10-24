import req from '../../util/req.js';
function normHeaders(h) {
  const o = {};
  try { for (const [k, v] of Object.entries(h || {})) o[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v; } catch (e) {}
  return o;
}
// Cat-contract transport: axios (req) first, typeof-guarded fetch fallback only.
// Returns engine-style { status, headers, text, content, data, buf } so the
// original hmtv call sites keep working. HTTP error statuses are returned,
// not thrown (original engine req resolved with status); network failures throw.
async function httpReq(url, opt = {}) {
  const o = opt || {};
  const headers = Object.assign({}, o.headers || {});
  delete headers['Accept-Encoding']; delete headers['accept-encoding'];
  const timeout = o.timeout || 20000;
  const binary = !!o.binary;
  const method = (o.method || (o.body != null ? 'POST' : 'GET')).toUpperCase();
  const data = o.body !== undefined ? o.body : o.data;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: binary ? 'arraybuffer' : 'text', maxRedirects: 5 });
    const buf = binary ? Buffer.from(r.data || []) : undefined;
    const text = binary ? '' : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
    return { status: r.status || 200, headers: normHeaders(r.headers), text, content: text, data: r.data, buf };
  } catch (e) {
    if (e && e.response) {
      const d = e.response.data;
      const buf = binary ? Buffer.from(d || []) : undefined;
      const text = binary ? '' : (typeof d === 'string' ? d : JSON.stringify(d ?? ''));
      return { status: e.response.status || 0, headers: normHeaders(e.response.headers), text, content: text, data: d, buf };
    }
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: (method === 'GET' || method === 'HEAD') ? undefined : data, signal: ctl.signal, redirect: 'follow' });
        const headers2 = {}; try { r.headers.forEach((v, k) => { headers2[String(k).toLowerCase()] = v; }); } catch (e2) {}
        if (binary) { const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: headers2, text: '', content: '', data: buf, buf }; }
        const text = await r.text(); return { status: r.status, headers: headers2, text, content: text, data: text };
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

/*
 * 腾讯视频（v.qq.com）· 从 drpy 规则重写为 CatPaw 模块
 * ---------------------------------------------------------------------------
 * 原规则是 ds 格式的 72KB 文本（大头是筛选表），被自动转成 Node 后中文标识符全成乱码
 * （'推荐' → '鎺ㄨ崘'、'一级' → '涓€绾?），所以首页/详情直接失效。这里改成纯 JS 模块，
 * 只用公开的腾讯 web 接口，不用 cheerio：
 *
 *   首页/分类  POST https://pbaccess.video.qq.com/.../MVLPageHTTPService/getMVLPage
 *              （channel_list + page_context 翻页，7 个频道实测都有 21 条/页）
 *   搜索      POST https://pbaccess.video.qq.com/trpc.videosearch.mobile_search...
 *              MbSearch（pagenum 从 0 开始）
 *   详情      GET  https://node.video.qq.com/x/api/float_vinfo2?cid=<cid>
 *              （标题/封面/简介/演职员/年份 + video_ids 全集）
 *   分集      GET  https://union.video.qq.com/fcgi-bin/data?...&idlist=<vid,vid,...>
 *              （每批 30 个 vid，给出分集标题与 category_map 类型）
 *
 * 播放：详情里的分集地址是 https://v.qq.com/x/cover/<cid>/<vid>.html（网页，不是视频）。
 *   D批已剥离第三方解析依赖：播放统一返回 { parse:1, url: 官方页, header } 交给播放器嗅探。
 *   原规则里的弹幕地址（47.92.94.193）不再返回，因为壳子不认 danmaku 字段。
 */

const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
const MVL = 'https://pbaccess.video.qq.com/trpc.multi_vector_layout.mvl_controller.MVLPageHTTPService/getMVLPage?&vversion_platform=2';
const SEARCH_API = 'https://pbaccess.video.qq.com/trpc.videosearch.mobile_search.MultiTerminalSearch/MbSearch?vplatform=2';
const VINFO = 'https://node.video.qq.com/x/api/float_vinfo2?cid=';
const UNION = 'https://union.video.qq.com/fcgi-bin/data?otype=json&tid=1804&appid=20001238&appkey=6c03bbe9658448a4&union_platform=1&idlist=';
const COVER = 'https://v.qq.com/x/cover/';

const CHANNELS = [
  { type_id: 'movie', type_name: '电影', channel: '100173' },
  { type_id: 'tv', type_name: '电视剧', channel: '100113' },
  { type_id: 'mini_series', type_name: '短剧', channel: '120188' },
  { type_id: 'variety', type_name: '综艺', channel: '100109' },
  { type_id: 'cartoon', type_name: '动漫', channel: '100119' },
  { type_id: 'child', type_name: '少儿', channel: '100150' },
  { type_id: 'doco', type_name: '纪录片', channel: '100105' },
];
const CHANNEL_BY_ID = {};
for (const c of CHANNELS) CHANNEL_BY_ID[c.type_id] = c.channel;

const MEDIA_RE = /\.(?:m3u8|mp4|flv|mkv|mpd|ts)(?:[?#]|$)/i;
const TRAILER_KEYS = ['预告', '花絮', '片花', '特辑', '幕后', '采访', '制作', 'MV', '主题曲'];
const PAGE_SIZE = 21;
const MAX_VIDS = 300; // 一次详情最多解析 300 个 vid（10 批并发出请求），长篇动画（仙逆 168 集）也能全给

function headers(extra) {
  return Object.assign(
    {
      'User-Agent': PC_UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Origin: 'https://v.qq.com',
      Referer: 'https://v.qq.com/',
    },
    extra || {}
  );
}

async function reqText(url, opt) {
  return httpReq(url, opt || {});
}

function toJson(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch (e) {
    return null;
  }
}

// union 接口返回的是 `QZOutputJson={...};` 这种 JSONP 文本
function parseQz(text) {
  const s = String(text || '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(s.slice(i, j + 1));
  } catch (e) {
    return null;
  }
}

function postJson(url, payload, timeout) {
  return reqText(url, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload || {}),
    timeout: timeout || 15000,
  }).then((r) => toJson(r.text) || {});
}

function str(v) {
  return v == null ? '' : String(v);
}

function bodyOf(request) {
  return (request && request.body) || {};
}

function pageOf(body) {
  return Math.max(1, parseInt(body.page || body.pg, 10) || 1);
}

// 图片：补协议、补尾号（腾讯的封面常以 / 结尾，要加 0 才是有效图）
function fixPic(pic) {
  let s = str(pic).trim();
  if (!s) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('http://')) s = 'https://' + s.slice(7);
  if (s.endsWith('/')) s += '0';
  return s;
}

function stripTags(s) {
  return str(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fixName(s) {
  return stripTags(s).replace(/[#$]/g, ' ').trim();
}

// ---------------------------------------------------------------- 首页 / 分类

// 从 MVLPage 的 modules.normal[].children_list.*.cards 里抽海报卡片
function pickCards(json) {
  const out = [];
  const cards = (json && json.data && json.data.modules && json.data.modules.normal && json.data.modules.normal.cards) || [];
  for (const card of cards) {
    const cl = card.children_list || {};
    for (const key of Object.keys(cl)) {
      if (/^(?:filter|nav)_card$/.test(key)) continue;
      const list = cl[key] && cl[key].cards;
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const p = item && item.params;
        if (!p) continue;
        let title = fixName(p.title || p.sub_title || '');
        let pic = p.new_pic_hz || p.new_pic_vt || p.image_url || p.pic_540x304 || '';
        if (!title && p.poster) {
          const poster = toJson(p.poster);
          if (poster) {
            title = fixName(poster.title);
            pic = pic || poster.image_url;
          }
        }
        const cid = str(p.cid || '').trim();
        if (!cid || !title) continue;
        out.push({
          vod_id: cid,
          vod_name: title,
          vod_pic: fixPic(pic),
          vod_remarks:
            fixName(p.timelong || p.episode_updated || p.marklabel_0_prime_text || p.mz_sub_title || '') ||
            (p.year ? str(p.year) + ' 年' : ''),
          vod_year: str(p.year || ''),
        });
      }
    }
  }
  return out;
}

function pageContext(page) {
  const offset = (page - 1) * PAGE_SIZE;
  return {
    page_index: String(page),
    _ctrl_page_index: String(page),
    _ds_cli_6970df954e7a9803_poster_offset: String(offset),
    _ds_cli_6970df954e7a9803_poster_size: String(PAGE_SIZE),
    _ctrl_showed_module_num: '1',
    _merger_mod_cnt: '1',
    sdk_page_ctx: '{"page_offset":1,"page_size":5,"used_module_num":1}',
    video_un_page_index: '1',
  };
}

function filterParams(extend) {
  const parts = [];
  const ext = extend || {};
  for (const key of [
    'sort', 'itype', 'ipay', 'iarea', 'iyear', 'theater', 'award',
    'recommend', 'recommend_1', 'recommend_2', 'recommend_3', 'producer',
    'characteristic', 'exclusive', 'itrailer', 'iregion', 'pay',
    'anime_status', 'item', 'all', 'gender', 'language', 'child_ip',
    'prefer', 'story', 'identity', 'attraction',
  ]) {
    const v = str(ext[key]).trim();
    if (v && v !== '-1' && v !== 'undefined') parts.push(key + '=' + encodeURIComponent(v));
  }
  if (!parts.some((x) => x.startsWith('sort='))) parts.unshift('sort=75');
  return parts.join('&');
}

async function channelPage(channelId, filter, page) {
  const body = {
    page_params: {
      page_type: 'operation',
      page_id: 'channel_list',
      channel_id: channelId,
      filter_params: filter,
    },
    page_context: pageContext(page),
  };
  const j = await postJson(MVL, body, 15000);
  const list = pickCards(j);
  const more = !!(j && j.data && j.data.has_next_page);
  return { list, more, ret: j && j.ret };
}

// ---------------------------------------------------------------- 搜索

// 实测：MbSearch 的 pagenum 不是页号（pagenum=1 返回的是无关的解说/预告片），
// 只有 pagenum=0 是干净的搜索结果，所以固定单页，不做假分页。
// 搜索里混着大量解说/预告/原著剪辑，按「标题是否就是片名」打分排序，把正片顶上去
const CLIP_KEYS = ['预告', '花絮', '片花', '特辑', '幕后', '采访', '解说', '盘点', '混剪',
  '彩蛋', '揭秘', '纯享', '原著', 'reaction', '反应', '测评', '速看', '剪辑'];

function scoreOf(name, wd) {
  let s = 1;
  if (name === wd) s = 6;
  else if (name.startsWith(wd)) s = 5;
  else if (name.indexOf(wd) >= 0) s = name.length <= 12 ? 4 : 2;
  if (CLIP_KEYS.some((k) => name.indexOf(k) >= 0)) s -= 3;
  if (name.length > 30) s -= 1;
  return s;
}

async function searchPage(wd) {
  const body = {
    version: '25042201',
    clientType: 1,
    filterValue: '',
    uuid: 'B1E50847-D25F-4C4B-BBA0-36F0093487F6',
    retry: 0,
    query: wd,
    pagenum: 0,
    isPrefetch: true,
    pagesize: 30,
    queryFrom: 0,
    searchDatakey: '',
    transInfo: '',
    isneedQc: true,
    preQid: '',
    adClientInfo: '',
    extraInfo: {
      isNewMarkLabel: '1',
      multi_terminal_pc: '1',
      themeType: '1',
      sugRelatedIds: '{}',
      appVersion: '',
    },
  };
  const j = await postJson(SEARCH_API, body, 15000);
  const out = [];
  const seen = new Set();
  const push = (list) => {
    for (const it of list || []) {
      const doc = it && it.doc;
      const info = it && it.videoInfo;
      if (!doc || !doc.id || !info) continue;
      const id = str(doc.id);
      const name = fixName(info.title);
      if (!id || !name || seen.has(id)) continue;
      // 只要腾讯自家的条目：其它平台的 cid 在 v.qq.com 上打不开
      const sites = Array.isArray(info.playSites) ? info.playSites : [];
      if (sites.length) {
        const hasQQ = sites.some((s) => s && str(s.enName).toLowerCase() === 'qq');
        if (!hasQQ) continue;
      }
      const epCount = info.episodeSites ? Object.keys(info.episodeSites).length : 0;
      seen.add(id);
      out.push({
        vod_id: id,
        vod_name: name,
        vod_pic: fixPic(info.imgUrl || ''),
        vod_remarks: fixName(info.secondLine || '') || (epCount > 0 ? epCount + ' 集' : ''),
        score: scoreOf(name, wd),
      });
    }
  };
  push(j && j.data && j.data.normalList && j.data.normalList.itemList);
  for (const box of (j && j.data && j.data.areaBoxList) || []) push(box.itemList);

  out.sort((a, b) => b.score - a.score);
  // 有正片命中时把明显是剪辑/解说的丢掉，别让用户只看到二创
  const good = out.filter((x) => x.score > 0);
  const list = (good.length ? good : out).slice(0, 30);
  return list.map((x) => ({ vod_id: x.vod_id, vod_name: x.vod_name, vod_pic: x.vod_pic, vod_remarks: x.vod_remarks }));
}

// ---------------------------------------------------------------- 详情

function unionFetch(vids) {
  return reqText(UNION + vids.join(','), { headers: headers(), timeout: 15000 }).then((r) => parseQz(r.text));
}

// hero 信息 → vod 对象
function vodOf(cid, j) {
  const c = (j && j.c) || {};
  let typeName = '';
  if (Array.isArray(j && j.typ)) {
    const main = str(j.typ[0]);
    const sub = Array.isArray(j.typ[1]) ? j.typ[1].map(str) : [];
    typeName = [main].concat(sub).filter(Boolean).join(',');
  }
  let actor = '';
  if (Array.isArray(j && j.nam)) {
    const flat = j.nam.flat ? j.nam.flat() : j.nam;
    actor = (Array.isArray(flat) ? flat : [flat]).map(str).filter(Boolean).join(',');
  }
  return {
    vod_id: cid,
    vod_name: fixName(c.title || c.full_title || '腾讯视频 ' + cid),
    vod_pic: fixPic(c.pic),
    vod_content: stripTags(c.description || ''),
    vod_year: str(c.year || ''),
    vod_area: stripTags(c.area || ''),
    vod_remarks: fixName((j && j.rec) || c.rec || ''),
    type_name: typeName,
    vod_actor: actor,
  };
}

function splitEpisodes(list) {
  const main = [];
  const groups = { 预告: [], 花絮片花: [], 特辑: [] };
  for (const ep of list) {
    const type = str(ep.type);
    if (type && TRAILER_KEYS.some((k) => type.includes(k))) {
      if (type.includes('预告')) groups.预告.push(ep);
      else if (type.includes('花絮') || type.includes('片花')) groups.花絮片花.push(ep);
      else if (type.includes('特辑') || type.includes('幕后')) groups.特辑.push(ep);
      else groups.特辑.push(ep);
    } else {
      main.push(ep);
    }
  }
  return { main, groups };
}

async function detailOf(cidRaw) {
  const cid = str(cidRaw).trim();
  if (!cid) return null;
  const r = await reqText(VINFO + encodeURIComponent(cid), { headers: headers({ Referer: 'https://v.qq.com/' }), timeout: 15000 });
  const j = toJson(r.text);
  if (!j || !j.c) return null;

  const vod = vodOf(cid, j);
  const vids = (j.c.video_ids || []).map(str).filter(Boolean).slice(0, MAX_VIDS);

  // union 接口：每批 30 个 vid，给出真实分集标题与类型
  const batches = [];
  for (let i = 0; i < vids.length; i += 30) batches.push(vids.slice(i, i + 30));
  const results = await Promise.all(batches.map((b) => unionFetch(b).catch(() => null)));

  const eps = [];
  const seen = new Set();
  for (const res of results) {
    for (const item of (res && res.results) || []) {
      const f = item && item.fields;
      if (!f || !f.vid || seen.has(f.vid)) continue;
      seen.add(f.vid);
      const cat = Array.isArray(f.category_map) ? f.category_map : [];
      eps.push({
        vid: str(f.vid),
        title: fixName(f.title) || '第' + (eps.length + 1) + '集',
        type: str(cat[1] || ''),
      });
    }
  }
  // union 挂了也要能看：退回用 video_ids 编号
  if (!eps.length) {
    vids.forEach((vid, i) => eps.push({ vid, title: vids.length > 1 ? '第' + (i + 1) + '集' : '正片', type: '' }));
  }

  const { main, groups } = splitEpisodes(eps);
  const froms = [];
  const urls = [];
  const toUrl = (list) => list.map((e) => e.title + '$' + COVER + cid + '/' + e.vid + '.html').join('#');
  if (main.length) {
    froms.push('正片');
    urls.push(toUrl(main));
  }
  for (const name of ['预告', '花絮片花', '特辑']) {
    if (!groups[name].length) continue;
    froms.push(name);
    urls.push(toUrl(groups[name]));
  }
  if (froms.length) {
    vod.vod_play_from = froms.join('$$$');
    vod.vod_play_url = urls.join('$$$');
    vod.vod_total = main.length || eps.length;
  }
  return vod;
}

// ---------------------------------------------------------------- 播放解析



// 用 Range 取前 2KB、手动跟 3 跳，只认真的能出媒体内容的地址
/* stripped(D批): 第三方解析分支已删 */


/* stripped(D批): 第三方解析分支已删 */


/* stripped(D批): 第三方解析分支已删 */


// 从 play 参数里认 cid/vid：兼容 https://v.qq.com/x/cover/<cid>/<vid>.html
function idsOf(raw) {
  const s = str(raw).trim();
  let m = /\/x\/cover\/([0-9A-Za-z]+)\/([0-9A-Za-z]+)\.html/i.exec(s);
  if (m) return { cid: m[1], vid: m[2] };
  m = /[?&]cid=([0-9A-Za-z]+)/i.exec(s);
  if (m) return { cid: m[1], vid: '' };
  return { cid: '', vid: '' };
}

export default function createSpider() {
  return {
  meta: { key: 'py_tencent_video', name: '🐧腾讯- 4K', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      // 三个频道并发出首页（电影/电视剧/动漫），够 60 条就不再多打接口
      const use = CHANNELS.slice(0, 3);
      const pages = await Promise.all(use.map((c) => channelPage(c.channel, 'sort=75', 1).catch(() => ({ list: [] }))));
      const list = [];
      const seen = new Set();
      for (const p of pages) {
        for (const item of p.list || []) {
          if (seen.has(item.vod_id)) continue;
          seen.add(item.vod_id);
          list.push(item);
        }
      }
      return {
        class: CHANNELS.map((c) => ({ type_id: c.type_id, type_name: c.type_name })),
        filters: {},
        list: list,
      };
    });

    fastify.post('/category', async (request) => {
      const body = bodyOf(request);
      const tid = str(body.id || body.type_id || body.tid || 'movie').trim();
      const page = pageOf(body);
      const channelId = CHANNEL_BY_ID[tid] || (/^\d+$/.test(tid) ? tid : '100173');
      const filter = filterParams(body.extend || body.filters || body.ext || {});
      const r = await channelPage(channelId, filter, page).catch(() => ({ list: [], more: false }));
      return {
        page: page,
        pagecount: r.more ? page + 1 : page,
        limit: r.list.length,
        total: r.list.length ? (r.more ? page * PAGE_SIZE + PAGE_SIZE : (page - 1) * PAGE_SIZE + r.list.length) : 0,
        list: r.list,
      };
    });

    fastify.post('/search', async (request) => {
      const body = bodyOf(request);
      const wd = str(body.wd || body.keyword || body.searchKey || '').trim();
      if (!wd) return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };
      const list = await searchPage(wd).catch(() => []);
      // 接口只给一页，pagecount 固定 1，避免壳子翻出无关结果
      return { page: 1, pagecount: 1, limit: list.length, total: list.length, list: list };
    });

    fastify.post('/detail', async (request) => {
      const body = bodyOf(request);
      const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.vod_id || body.ids || '';
      const vod = await detailOf(raw).catch(() => null);
      return { list: vod ? [vod] : [] };
    });

    fastify.post('/play', async (request) => {
      const body = bodyOf(request);
      let raw = str(body.id || body.play || body.url || '').trim();
      // 壳子有时会把「集名$地址」整串丢过来，取 $ 后面那段
      if (raw && !/^https?:\/\//i.test(raw) && raw.includes('$')) raw = raw.slice(raw.lastIndexOf('$') + 1).trim();
      const header = headers({ Referer: 'https://v.qq.com/' });
      if (!raw) return { parse: 1, url: '', header };

      // 已经是真媒体（m3u8/mp4/mpd）→ 直接交给播放器
      if (/^https?:\/\//i.test(raw) && MEDIA_RE.test(raw)) {
        return { parse: 0, url: raw, header };
      }

      let page = raw;
      if (!/^https?:\/\//i.test(page)) {
        const { cid, vid } = idsOf(page);
        // 传进来的是纯 cid / vid 时，拼回腾讯的剧集页再解析
        page = cid && vid ? COVER + cid + '/' + vid + '.html' : cid ? COVER + cid + '.html' : raw;
      }

      // NOTE(D批): 第三方解析已剥离；播放交回腾讯官方页，由播放器嗅探。
      return { parse: 1, url: page, header };
    });
  },
};
}
