import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_zhibo';
const NAME = '直播';
const TIMEOUT = 22000;
const PC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const DART_UA = 'Dart/3.4 (dart:io)';

/* ---------------- 双通道请求 ---------------- */
async function httpGet(url, headers = {}) {
  try {
    const { data } = await req.get(url, { headers, timeout: TIMEOUT, responseType: 'text' });
    if (data !== undefined && data !== null && data !== '') return String(data);
  } catch (e) {}
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(url, { headers, signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) return await r.text();
  } catch (e) {}
  return '';
}
async function httpGetJson(url, headers = {}) {
  try {
    const { data } = await req.get(url, { headers, timeout: TIMEOUT, responseType: 'json' });
    if (data !== undefined && data !== null && data !== '') {
      if (typeof data === 'object') return data;
      try { return JSON.parse(String(data)); } catch (e) {}
    }
  } catch (e) {}
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(url, { headers, signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) return await r.json();
  } catch (e) {}
  return null;
}
function hasHeader(headers, name) {
  const n = name.toLowerCase();
  return Object.keys(headers || {}).some(k => k.toLowerCase() === n);
}
async function httpPostForm(url, formStr, headers = {}) {
  const h = { ...headers };
  if (!hasHeader(h, 'content-type')) h['Content-Type'] = 'application/x-www-form-urlencoded';
  try {
    const { data } = await req.post(url, formStr, { headers: h, timeout: TIMEOUT, responseType: 'text' });
    if (data !== undefined && data !== null && data !== '') {
      if (typeof data === 'object') return data;
      const s = String(data);
      try { return JSON.parse(s); } catch (e) { return s; }
    }
  } catch (e) {}
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(url, { method: 'POST', headers: h, body: formStr, signal: ctl.signal });
    clearTimeout(t);
    const s = await r.text();
    try { return JSON.parse(s); } catch (e) { return s; }
  } catch (e) {}
  return null;
}
function clean(s) { return String(s || '').replace(/<[^>]+>/g, '').trim(); }
function md5hex(s) { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }
function randHex(n) {
  const cs = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < n; i++) s += cs[Math.floor(Math.random() * 16)];
  return s;
}
function fmtOnline(n) {
  n = parseInt(n, 10) || 0;
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
}

/* ================= 虎牙 ================= */
const HUYA_LIST = 'https://www.huya.com';
const HUYA_API = 'https://mp.huya.com';
async function huyaList(gameId, page) {
  const url = HUYA_LIST + '/cache.php?m=LiveList&do=getLiveListByPage&tagAll=0' + (gameId ? '&gameId=' + encodeURIComponent(gameId) : '') + '&page=' + page;
  const j = await httpGetJson(url, { 'User-Agent': DART_UA });
  const datas = (j && j.data && Array.isArray(j.data.datas)) ? j.data.datas : [];
  return datas.filter(i => i && i.profileRoom).map(i => ({
    vod_id: 'huya@@' + i.profileRoom,
    vod_name: clean(i.introduction) || '虎牙直播',
    vod_pic: String(i.screenshot || ''),
    vod_remarks: fmtOnline(i.totalCount) + '人',
    vod_year: clean(i.nick),
  }));
}
function huyaSignUrl(cdn, uid, streamName, bitRate) {
  const ts = Math.floor(Date.now() / 1000);
  const seqid = '' + uid + ts;
  const ss = md5hex(seqid + '|huya_adr|102');
  const wsTime = (ts + 21600).toString(16);
  const wsSecret = md5hex('DWq8BcJ3h6DJt6TY_' + uid + '_' + streamName + '_' + ss + '_' + wsTime);
  const ratio = bitRate > 0 ? bitRate : 2000;
  return cdn.flvBase + '/' + streamName + '.flv?ratio=' + ratio + '&wsSecret=' + wsSecret + '&wsTime=' + wsTime +
    '&ctype=huya_adr&seqid=' + seqid + '&uid=' + uid + '&fs=bgct&ver=1&t=102';
}
async function huyaProfile(roomId) {
  const j = await httpGetJson(HUYA_API + '/cache.php?m=Live&do=profileRoom&roomid=' + encodeURIComponent(roomId), { 'User-Agent': PC_UA });
  if (!j || j.status !== 200 || !j.data) return null;
  return j.data;
}
const huya = {
  async detail(roomId) {
    const d = await huyaProfile(roomId);
    if (!d) return null;
    const live = d.liveData || {};
    const rates = [
      { n: '蓝光', b: 4000 }, { n: '超清', b: 2000 }, { n: '高清', b: 1200 }, { n: '流畅', b: 500 },
    ];
    return {
      name: clean(live.introduction) || '虎牙直播',
      pic: '', typeName: clean(live.gameFullName), director: clean(live.nick),
      remarks: clean(live.contentIntro),
      playFrom: '虎牙直播',
      playUrl: rates.map(r => r.n + '$huya@@' + roomId + '@@' + r.b).join('#'),
    };
  },
  async play(roomId, bitRate) {
    const d = await huyaProfile(roomId);
    if (!d) return '';
    const uid = d.profileInfo && d.profileInfo.uid;
    const list = (d.stream && Array.isArray(d.stream.baseSteamInfoList)) ? d.stream.baseSteamInfoList : [];
    if (!uid || !list.length) return '';
    list.sort((a, b) => (parseInt(b.iWebPriorityRate, 10) || 0) - (parseInt(a.iWebPriorityRate, 10) || 0));
    const cdn = list[0];
    const sname = cdn.sStreamName;
    if (!cdn.sFlvUrl || !sname) return '';
    return huyaSignUrl({ flvBase: cdn.sFlvUrl }, uid, sname, parseInt(bitRate, 10) || 2000);
  },
};

/* ================= 斗鱼 ================= */
const DY_SITE = 'https://www.douyu.com';
const DY_M = 'https://m.douyu.com';
async function douyuList(cate2, page) {
  const path = cate2 ? '/gapi/rkc/directory/mixList/2_' + encodeURIComponent(cate2) + '/' + page : '/japi/weblist/apinc/allpage/6/' + page;
  const j = await httpGetJson(DY_SITE + path, { 'User-Agent': DART_UA });
  const rl = (j && j.data && Array.isArray(j.data.rl)) ? j.data.rl : [];
  return rl.filter(i => i && i.rid).map(i => ({
    vod_id: 'douyu@@' + i.rid,
    vod_name: clean(i.rn) || '斗鱼直播',
    vod_pic: String(i.rs16 || ''),
    vod_year: fmtOnline(i.ol) + '人',
    vod_remarks: clean(i.nn),
  }));
}
async function douyuCates() {
  const j = await httpGetJson(DY_M + '/api/cate/list', { 'User-Agent': DART_UA });
  const info = (j && j.data && Array.isArray(j.data.cate1Info)) ? j.data.cate1Info : [];
  return {
    cate1: info.map(i => ({ n: clean(i.cate1Name), v: String(i.cate1Id) })),
    cate2: (j && j.data && Array.isArray(j.data.cate2Info)) ? j.data.cate2Info : [],
  };
}
async function douyuSession(channel) {
  const headers = { 'User-Agent': PC_UA, 'referer': DY_SITE + '/' + channel };
  let did = randHex(32);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    const r = await fetch(DY_SITE + '/' + channel, { headers, signal: ctl.signal });
    clearTimeout(t);
    const ck = r.headers.get('set-cookie') || '';
    const m = ck.match(/dy_did=([a-f0-9]{32})/);
    if (m) did = m[1];
  } catch (e) {}
  const sec = await httpGetJson(DY_SITE + '/wgapi/livenc/liveweb/websec/getEncryption?did=' + did, headers);
  if (!sec || sec.error !== 0 || !sec.data) return null;
  const sd = sec.data;
  return { did, secretKey: sd.key, randomStr: sd.rand_str, encTime: sd.enc_time || 1, encData: sd.enc_data, channel };
}
async function douyuPlayUrl(sess, rate) {
  const now = Math.floor(Date.now() / 1000);
  let cur = sess.randomStr;
  for (let i = 0; i < (sess.encTime || 1); i++) cur = md5hex(cur + sess.secretKey);
  const auth = md5hex(cur + sess.secretKey + sess.channel + now);
  const form = new URLSearchParams({
    enc_data: sess.encData, tt: String(now), did: sess.did, auth,
    cdn: '', rate: rate > 0 ? String(rate) : '', hevc: '0', fa: '0', ive: '0',
  }).toString();
  const headers = {
    'User-Agent': PC_UA, 'Referer': DY_SITE + '/' + sess.channel,
    'Origin': DY_SITE, 'Cookie': 'dy_did=' + sess.did + '; mantine-color-scheme-value=light',
  };
  let pr = await httpPostForm(DY_SITE + '/lapi/live/getH5PlayV1/' + sess.channel, form, headers);
  if (!pr || pr.error !== 0) {
    // 旧版 API 兜底
    const legacy = new URLSearchParams({
      did: sess.did, tt: String(now), sign: auth, cdn: '',
      rate: rate > 0 ? String(rate) : '-1', ver: 'Douyu_223061205',
      iar: '1', ive: '1', hevc: '0', fa: '0',
    }).toString();
    pr = await httpPostForm(DY_SITE + '/lapi/live/getH5Play/' + sess.channel, legacy, headers);
  }
  if (!pr || pr.error !== 0) return null;
  const si = pr.data || {};
  let url = '';
  if (si.rtmp_url && si.rtmp_live) url = si.rtmp_url + '/' + si.rtmp_live;
  else if (si.hls_url) url = si.hls_url;
  const rates = Array.isArray(si.multirates) ? si.multirates : [];
  return { url, rates };
}
const douyu = {
  async detail(channel) {
    const j = await httpGetJson(DY_SITE + '/betard/' + encodeURIComponent(channel), { 'User-Agent': PC_UA, 'Referer': DY_SITE + '/' + channel });
    const room = (j && j.room) || {};
    const sess = await douyuSession(channel);
    if (!sess) return null;
    const got = await douyuPlayUrl(sess, -1);
    let rates = [];
    if (got && got.rates.length) {
      rates = [...got.rates].sort((a, b) => (parseInt(b.bit, 10) || 0) - (parseInt(a.bit, 10) || 0))
        .map(r => ({ n: clean(r.name) || (r.rate + 'P'), b: parseInt(r.rate, 10) || -1 }));
    } else {
      rates = [{ n: '原画', b: -1 }];
    }
    const qB64 = Buffer.from(JSON.stringify(rates.map(r => [r.n, '#' + r.b]).flat()), 'utf8').toString('base64');
    const sB64 = Buffer.from(JSON.stringify(sess), 'utf8').toString('base64');
    return {
      name: clean(room.room_name) || '斗鱼直播',
      pic: '', typeName: clean(room.second_lvl_name), director: clean(room.nickname), remarks: '',
      playFrom: '斗鱼直播',
      playUrl: '原画$douyu@@' + qB64 + '@@' + sB64,
    };
  },
  async play(qualitiesB64, sessB64) {
    let qualities = [], sess = null;
    try {
      qualities = JSON.parse(Buffer.from(qualitiesB64, 'base64').toString('utf8'));
      sess = JSON.parse(Buffer.from(sessB64, 'base64').toString('utf8'));
    } catch (e) { return { parse: 1, url: '', header: {} }; }
    const out = [];
    for (let i = 0; i + 1 < qualities.length; i += 2) {
      const name = qualities[i];
      const marker = String(qualities[i + 1] || '');
      const rate = marker.startsWith('#') ? (parseInt(marker.slice(1), 10) || -1) : -1;
      try {
        const got = await douyuPlayUrl(sess, rate);
        if (got && got.url) { out.push(name, got.url); break; }
      } catch (e) {}
    }
    if (!out.length) return { parse: 1, url: '', header: {} };
    return { parse: 0, url: out.length === 2 ? out[1] : out, header: { 'User-Agent': 'libmpv', 'Icy-MetaData': '1' } };
  },
};

/* ================= 网易CC ================= */
const CC_SITE = 'https://cc.163.com';
async function ccList(page) {
  const start = (page - 1) * 20;
  const j = await httpGetJson(CC_SITE + '/api/category/live/?format=json&start=' + start + '&size=20', { 'User-Agent': PC_UA });
  const lives = (j && Array.isArray(j.lives)) ? j.lives : [];
  return lives.filter(i => i && i.cuteid).map(i => ({
    vod_id: 'wangyi@@' + i.cuteid,
    vod_name: clean(i.title) || '网易CC',
    vod_pic: String(i.cover || ''),
    vod_remarks: clean(i.nickname),
    raw: i,
  }));
}
async function ccFind(cuteid) {
  for (let pg = 1; pg <= 5; pg++) {
    const list = await ccList(pg);
    const hit = list.find(i => String(i.raw.cuteid) === String(cuteid));
    if (hit) return hit.raw;
    if (list.length < 20) break;
  }
  return null;
}
const wangyi = {
  async detail(cuteid) {
    const it = await ccFind(cuteid);
    if (!it) return null;
    const m3u8 = String(it.m3u8 || '');
    const share = String(it.sharefile || '');
    const lines = [];
    if (m3u8) lines.push('高清$wangyi@@' + cuteid + '@@m3u8');
    if (share) lines.push('备用$wangyi@@' + cuteid + '@@share');
    if (!lines.length) return null;
    return {
      name: clean(it.title) || '网易CC', pic: String(it.cover || ''),
      typeName: clean(it.gamename), director: clean(it.nickname),
      remarks: fmtOnline(it.visitor) + '人',
      playFrom: '网易CC', playUrl: lines.join('#'),
    };
  },
  async play(cuteid, which) {
    const it = await ccFind(cuteid);
    if (!it) return '';
    const u = which === 'share' ? String(it.sharefile || '') : String(it.m3u8 || '');
    return u.startsWith('http') ? u : '';
  },
};

/* ================= B站 ================= */
const BILI_API = 'https://api.live.bilibili.com';
const BILI_CATES = [
  { n: '网游', v: '2' }, { n: '手游', v: '3' }, { n: '单机', v: '6' },
  { n: '娱乐', v: '1' }, { n: '电台', v: '5' }, { n: '虚拟主播', v: '9' },
  { n: '生活', v: '10' }, { n: '知识', v: '11' }, { n: '赛事', v: '13' },
];
function biliH() { return { 'User-Agent': PC_UA, 'Referer': 'https://live.bilibili.com/' }; }
async function biliAreas() {
  const j = await httpGetJson(BILI_API + '/room/v1/Area/getList', biliH());
  const arr = (j && j.code === 0 && Array.isArray(j.data)) ? j.data : [];
  return arr.map(a => ({ id: String(a.id), name: clean(a.name), list: Array.isArray(a.list) ? a.list : [] }));
}
async function biliList(parentArea, areaId, page) {
  const j = await httpGetJson(BILI_API + '/room/v3/area/getRoomList?platform=web&parent_area_id=' + encodeURIComponent(parentArea) +
    '&area_id=' + encodeURIComponent(areaId) + '&sort_type=online&page=' + page + '&page_size=30', biliH());
  const list = (j && j.code === 0 && j.data && Array.isArray(j.data.list)) ? j.data.list : [];
  const hasMore = j && j.data && j.data.has_more === 1;
  return {
    list: list.filter(r => r && r.roomid).map(r => ({
      vod_id: 'bili@@' + r.roomid,
      vod_name: clean(r.title) || 'B站直播',
      vod_pic: String(r.cover || r.system_cover || ''),
      vod_remarks: fmtOnline(r.online) + '人',
      vod_year: clean(r.uname),
    })),
    hasMore,
  };
}
const bili = {
  async detail(roomId) {
    const info = await httpGetJson(BILI_API + '/room/v1/Room/get_info?room_id=' + encodeURIComponent(roomId), biliH());
    if (!info || info.code !== 0 || !info.data) return null;
    const ri = info.data;
    const pr = await httpGetJson(BILI_API + '/room/v1/Room/playUrl?cid=' + encodeURIComponent(roomId) + '&qn=10000&platform=web',
      { ...biliH(), 'Origin': 'https://live.bilibili.com' });
    const pd = (pr && pr.code === 0 && pr.data) || {};
    const qdesc = {};
    for (const q of (Array.isArray(pd.quality_description) ? pd.quality_description : [])) qdesc[q.qn] = q.desc;
    const acc = (Array.isArray(pd.accept_quality) ? pd.accept_quality : ['10000']).map(Number).sort((a, b) => b - a);
    const lines = acc.map(qn => (qdesc[qn] || ('清晰度' + qn)) + '$bili@@' + roomId + '@@' + qn).join('#');
    return {
      name: clean(ri.title) || 'B站直播', pic: String(ri.user_cover || ''),
      typeName: clean(ri.parent_area_name) + '/' + clean(ri.area_name),
      director: clean(ri.uname), remarks: '在线' + fmtOnline(ri.online) + '人',
      playFrom: 'B站直播', playUrl: lines || ('原画$bili@@' + roomId + '@@10000'),
    };
  },
  async play(roomId, qn) {
    const pr = await httpGetJson(BILI_API + '/room/v1/Room/playUrl?cid=' + encodeURIComponent(roomId) + '&qn=' + encodeURIComponent(qn || '10000') + '&platform=web',
      { ...biliH(), 'Origin': 'https://live.bilibili.com' });
    if (!pr || pr.code !== 0 || !pr.data) return '';
    const durl = Array.isArray(pr.data.durl) ? pr.data.durl : [];
    const urls = durl.map((d, i) => ['线路' + (i + 1), d.url]).filter(x => x[1]);
    if (!urls.length) return '';
    if (urls.length === 1) return urls[0][1];
    return urls.flat();
  },
};

/* ================= 路由 ================= */
const PLAT_LIST = [
  { key: 'huya', name: '虎牙' },
  { key: 'douyu', name: '斗鱼' },
  { key: 'wangyi', name: '网易CC' },
  { key: 'bili', name: 'B站' },
];
const PLAY_HEADERS = {
  wangyi: { 'User-Agent': 'ExoPlayer', 'Connection': 'Keep-Alive', 'Icy-MetaData': '1' },
  bili: { 'Accept': '*/*', 'Icy-MetaData': '1', 'referer': 'https://live.bilibili.com', 'user-agent': PC_UA },
  huya: { 'User-Agent': 'ExoPlayer', 'Connection': 'Keep-Alive', 'Icy-MetaData': '1' },
  douyu: { 'User-Agent': 'libmpv', 'Icy-MetaData': '1' },
};

async function init() { return {}; }

async function home() {
  const filters = {
    bili: [{ key: 'cate', name: '分类', value: BILI_CATES }],
  };
  try {
    const areas = await biliAreas();
    if (areas.length) filters.bili = [{ key: 'cate', name: '分类', value: areas.map(a => ({ n: a.name, v: a.id })) }];
  } catch (e) {}
  try {
    const dc = await douyuCates();
    if (dc.cate1.length) filters.douyu = [{ key: 'cate', name: '分类', value: dc.cate1 }];
  } catch (e) {}
  return { class: PLAT_LIST.map(p => ({ type_id: p.key, type_name: p.name })), filters };
}

async function category(reqIn) {
  const body = reqIn?.body || {};
  let tid = String(body.tid || body.id || 'huya');
  const page = Math.max(1, parseInt(body.page, 10) || 1);
  const extend = body.extend || {};
  const cate = String(extend.cate || body.cate || '');
  let list = [];
  let pagecount = 1;
  try {
    if (tid === 'huya') {
      list = await huyaList('', page); pagecount = list.length >= 20 ? page + 1 : page;
    } else if (tid === 'douyu') {
      const c2 = tid.split('@@')[1];
      const r = await douyuList(c2, page);
      list = r; pagecount = list.length >= 20 ? page + 1 : page;
    } else if (tid === 'douyu') {
      if (cate && page === 1) {
        const dc = await douyuCates();
        list = dc.cate2.filter(i => String(i.cate1Id) === cate).map(i => ({
          vod_id: 'click_douyu@@' + i.cate2Id, vod_name: clean(i.cate2Name),
          vod_pic: String(i.icon || ''), vod_remarks: clean(i.count), vod_tag: 'folder',
        }));
        pagecount = 1;
      } else { list = await douyuList('', page); pagecount = list.length >= 20 ? page + 1 : page; }
    } else if (tid === 'wangyi') {
      const r = await ccList(page);
      list = r.map(({ raw, ...rest }) => rest);
      pagecount = list.length >= 20 ? page + 1 : page;
    } else if (tid.startsWith('click_bili@@')) {
      const parts = tid.split('@@');
      const r = await biliList(parts[1], parts[2], page);
      list = r.list; pagecount = r.hasMore ? page + 1 : page;
    } else if (tid === 'bili') {
      const pc = cate || '2';
      if (cate && page === 1) {
        const areas = await biliAreas();
        const hit = areas.find(a => a.id === pc);
        if (hit && hit.list.length) {
          list = hit.list.map(s => ({
            vod_id: 'click_bili@@' + pc + '@@' + s.id, vod_name: clean(s.name),
            vod_pic: String(s.pic || ''), vod_tag: 'folder',
          }));
          pagecount = 1;
        } else {
          const r = await biliList(pc, 0, 1);
          list = r.list; pagecount = r.hasMore ? 2 : 1;
        }
      } else {
        const r = await biliList(pc, 0, page);
        list = r.list; pagecount = r.hasMore ? page + 1 : page;
      }
    }
  } catch (e) {}
  return { page, pagecount, limit: list.length, total: 9999, list };
}

async function detail(reqIn) {
  const body = reqIn?.body || {};
  const id = String(body.id || '');
  const parts = id.split('@@');
  const plat = parts[0];
  let d = null;
  try {
    if (plat === 'huya') d = await huya.detail(parts[1]);
    else if (plat === 'douyu') d = await douyu.detail(parts[1]);
    else if (plat === 'wangyi') d = await wangyi.detail(parts[1]);
    else if (plat === 'bili') d = await bili.detail(parts[1]);
  } catch (e) {}
  if (!d) return { list: [] };
  return {
    list: [{
      vod_id: id, vod_name: d.name, vod_pic: d.pic || '',
      type_name: d.typeName || '', vod_director: d.director || '',
      vod_remarks: d.remarks || '', vod_content: '',
      vod_play_from: d.playFrom, vod_play_url: d.playUrl,
    }],
  };
}

async function play(reqIn) {
  const body = reqIn?.body || {};
  let id = String(body.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop().trim();
  const parts = id.split('@@');
  const plat = parts[0];
  try {
    if (plat === 'huya') {
      const url = await huya.play(parts[1], parts[2]);
      if (url) return { parse: 0, url, header: PLAY_HEADERS.huya };
    } else if (plat === 'douyu') {
      return await douyu.play(parts[1], parts[2]);
    } else if (plat === 'wangyi') {
      const url = await wangyi.play(parts[1], parts[2]);
      if (url) return { parse: 0, url, header: PLAY_HEADERS.wangyi };
    } else if (plat === 'bili') {
      const r = await bili.play(parts[1], parts[2]);
      if (r) {
        if (typeof r === 'string') return { parse: 0, url: r, header: PLAY_HEADERS.bili };
        return { parse: 0, url: r, header: PLAY_HEADERS.bili };
      }
    }
  } catch (e) {}
  if (/^https?:\/\//i.test(id)) return { parse: 0, url: id, header: PLAY_HEADERS[plat] || {} };
  return { parse: 1, url: '', header: {} };
}

async function search() {
  return { page: 1, pagecount: 1, limit: 0, total: 0, list: [] };
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
