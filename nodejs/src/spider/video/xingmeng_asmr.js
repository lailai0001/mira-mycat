import req from '../../util/req.js';
async function reqTextAx(url, opt = {}) {
  const method = (opt.method || 'GET').toUpperCase();
  const headers = Object.assign({}, opt.headers || {});
  const timeout = opt.timeout || 20000;
  const body = opt.body !== undefined ? opt.body : opt.data;
  const data = (body != null && typeof body === 'object' && !Buffer.isBuffer(body)) ? JSON.stringify(body) : body;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: data, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

'use strict';
const NODE_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';
async function siteReq(url, opts = {}) {
  const headers = Object.assign({ 'User-Agent': NODE_UA }, opts.headers || {});
  return reqTextAx(url, { ...opts, headers });
}
async function json(u,opt){try{return JSON.parse(await siteReq(u,opt))}catch{return {}}}
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const m=(s,r)=>((String(s||'').match(r)||[])[1]||'');
const abs=(base,u)=>{try{return new URL(u,base).href}catch{return ''}};
const pg=b=>Math.max(1,parseInt(b?.page||b?.pg||1,10)||1);
const id=b=>String(Array.isArray(b?.id)?b.id[0]:(b?.id||b?.ids||''));
const list=(data,page=1,size=20)=>({list:data,page,pagecount:page+(data.length>=size?1:0),limit:size,total:data.length>=size?9999:data.length});
function plugin(key,name,classes,impl,filterable=0){return {meta:{key,name,type:3,searchable:1,quickSearch:1,filterable},api:async f=>{f.post('/init',async()=>({}));f.post('/home',async r=>({class:classes,filters:filterable?(impl.filters||{}):{},list:await impl.home(r.body||{})}));f.post('/category',async r=>impl.category(r.body||{}));f.post('/search',async r=>impl.search(r.body||{}));f.post('/detail',async r=>({list:await impl.detail(r.body||{})}));f.post('/play',async r=>impl.play(r.body||{}))}}}

/*
@header({
  searchable: 1,
  filterable: 0,
  quickSearch: 1,
  title: '星梦ASMR',
  lang: 'ds',
  类型: '影视'
})
星梦ASMR —— Aibox drpy 服务端源（var rule 格式，服务器直连公网 www.asmrzy.top）
列表/搜索：解析 <li class="joe_list__item">（title/thumbnail/img data-src/time）
详情：h1 标题 + og:image + video 提取（joe-dplayer 里的 m3u8 直链 / iframe / smartideo / video / source / 直链）
播放：直链 parse:0；bilibili/bilibili_aid 走 B站 API 取直链；youtube 走 embed
*/
const HOST = 'https://www.asmrzy.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

function match1(text, re) { const m = text.match(re); return m ? m[1] : ''; }
function matchAll(text, re) { const out = []; let m; while ((m = re.exec(text))) out.push(m[1]); return out; }
function joinUrl(base, url) { return url.indexOf('http') === 0 ? url : (base + '/' + String(url).replace(/^\//, '')); }

// 解析文章列表项
function parseItems(html) {
  const blocks = matchAll(html, /<li[^>]*class="[^"]*joe_list__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g);
  const videos = [];
  for (const blk of blocks) {
    const title = match1(blk, /<a[^>]+class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/).trim();
    let link = match1(blk, /<a[^>]+href="([^"]+)"[^>]*class="[^"]*thumbnail[^"]*"/)
      || match1(blk, /<a[^>]+href="([^"]+)"[^>]*>[^<]*<img/);
    if (!title || !link) continue;
    link = joinUrl(HOST, link);
    const pic = match1(blk, /<img[^>]+data-src="([^"]+)"/) || match1(blk, /<img[^>]+src="([^"]+)"/);
    const rem = match1(blk, /<time[^>]*>([^<]+)<\/time>/) || match1(blk, /<li>(\d{4}年\d{2}月\d{2}日)<\/li>/);
    videos.push({ title: title, pic_url: pic, desc: rem, url: link });
  }
  return videos;
}

// 从详情页 HTML 提取视频地址
function extractVideo(html) {
  if (!html) return null;
  let m = html.match(/<iframe[^>]+src="([^"]+)"/i);
  if (m) {
    let src = m[1].trim();
    if (src.indexOf('//') === 0) src = 'https:' + src;
    else if (src.indexOf('/') === 0) src = joinUrl(HOST, src);
    src = src.replace(/&amp;/g, '&');
    if (!/google|trustpilot|tree-nation/i.test(src)) return src;
  }
  m = html.match(/<div[^>]*class="[^"]*smartideo[^"]*"[^>]*data-(?:src|url)="([^"]+)"/i);
  if (m) return m[1];
  m = html.match(/<video[^>]+src="([^"]+)"/i);
  if (m) return m[1];
  m = html.match(/<source[^>]+src="([^"]+)"/i);
  if (m) return m[1];
  m = html.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|webm|flv))/i);
  if (m) return m[1];
  m = html.match(/<a[^>]+href="(https?:\/\/[^"]+\.(?:mp4|m3u8|webm))"/i);
  if (m) return m[1];
  return null;
}

function parsePlatform(url) {
  if (!url) return ['none', null];
  let m = url.match(/(?:bilibili\.com\/video\/|player\.bilibili\.com\/player\.html\?[^"]*bvid=)([a-zA-Z0-9]+)/i);
  if (m) return ['bilibili', m[1]];
  m = url.match(/player\.bilibili\.com\/player\.html\?[^"]*aid=(\d+)/i);
  if (m) return ['bilibili_aid', m[1]];
  m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (m) return ['youtube', m[1]];
  return ['direct', url];
}

// 提取详情页真封面（排除 logo/gravatar/lazyload/data:）
function extractPic(html) {
  const re = /<img[^>]+(?:data-src|src)="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1].trim();
    if (src.indexOf('data:') === 0) continue;
    if (/logo|lazyload|gravatar|\.svg/i.test(src)) continue;
    return src;
  }
  return '';
}

async function getBilibiliPlay(vid, isAid) {
  try {
    const h = { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com' };
    const viewUrl = isAid
      ? 'https://api.bilibili.com/x/web-interface/view?aid=' + vid
      : 'https://api.bilibili.com/x/web-interface/view?bvid=' + vid;
    const view = JSON.parse(await siteReq(viewUrl, { headers: h }));
    if (view.code !== 0 || !view.data) return '';
    const cid = view.data.cid, bvid = view.data.bvid;
    const playUrl = 'https://api.bilibili.com/x/player/playurl?bvid=' + bvid + '&cid=' + cid + '&qn=80';
    const play = JSON.parse(await siteReq(playUrl, { headers: h }));
    if (play.code !== 0 || !play.data || !play.data.durl || !play.data.durl[0]) return '';
    return play.data.durl[0].url;
  } catch (e) { return ''; }
}

var rule = {
  类型: '影视',
  title: '星梦ASMR',
  version: '0.0.1',
  host: 'https://www.asmrzy.top',
  homeUrl: '/category/cn/',
  url: '/category/fyclass/fypage/',
  searchUrl: '/?s=**&page=fypage',
  searchable: 1,
  quickSearch: 1,
  filterable: 0,
  header: HEADERS,
  class_name: '中国&韩国&日本&其他&音频',
  class_url: 'cn&kr&jp&other&listen',
  推荐: '*',
  一级: async function () {
    const text = await siteReq(this.input, { headers: HEADERS });
    return parseItems(text);
  },
  搜索: async function () {
    const text = await siteReq(this.input, { headers: HEADERS });
    return parseItems(text);
  },
  二级: async function () {
    const text = await siteReq(this.input, { headers: HEADERS });
    const vid = (String(this.input || '').match(/(\d+)\.html/) || [])[1] || String(this.input || '');
    const title = match1(text, /<h1[^>]*>([\s\S]*?)<\/h1>/).trim() || '未知';
    const pic = extractPic(text);
    const excerpt = match1(text, /<meta[^>]+name="description"[^>]+content="([^"]+)"/);
    const video_url = extractVideo(text);
    let play_from = '', play_url = '';
    if (video_url) {
      const platform = parsePlatform(video_url)[0];
      const plid = parsePlatform(video_url)[1];
      if (platform === 'bilibili') play_url = '正片$bilibili://' + plid;
      else if (platform === 'bilibili_aid') play_url = '正片$bilibili_aid://' + plid;
      else if (platform === 'youtube') play_url = '正片$youtube://' + plid;
      else play_url = '正片$' + video_url;
      play_from = '视频';
    }
    const vod = {
      vod_id: vid,
      vod_name: title,
      vod_pic: pic,
      vod_content: excerpt || (video_url ? '' : '未提取到视频地址，可能需手动解析。'),
      vod_play_from: play_from,
      vod_play_url: play_url,
    };
    return vod;
  },
  lazy: async function (flag, id) {
    const s = String(id || '');
    if (s.indexOf('bilibili://') === 0) {
      const bvid = s.slice('bilibili://'.length);
      const url = await getBilibiliPlay(bvid, false);
      if (url) return { parse: 0, url: url, header: { 'Referer': 'https://www.bilibili.com' } };
      return { parse: 0, url: 'https://player.bilibili.com/player.html?bvid=' + bvid, header: {} };
    }
    if (s.indexOf('bilibili_aid://') === 0) {
      const aid = s.slice('bilibili_aid://'.length);
      const url = await getBilibiliPlay(aid, true);
      if (url) return { parse: 0, url: url, header: { 'Referer': 'https://www.bilibili.com' } };
      return { parse: 0, url: 'https://player.bilibili.com/player.html?aid=' + aid, header: {} };
    }
    if (s.indexOf('youtube://') === 0) {
      const yid = s.slice('youtube://'.length);
      return { parse: 0, url: 'https://www.youtube.com/embed/' + yid + '?autoplay=1', header: {} };
    }
    if (s.indexOf('http') === 0) {
      return { parse: 0, url: s, header: {} };
    }
    return { parse: 0, url: '', header: {} };
  },
  play_parse: true,
  play_json: [],
};


export default function createSpider() {
  const s = plugin('xingmeng_asmr','星梦ASMR', [{type_id:'cn',type_name:'中国'},{type_id:'kr',type_name:'韩国'},{type_id:'jp',type_name:'日本'},{type_id:'other',type_name:'其他'},{type_id:'listen',type_name:'音频'}], {
 home: async ()=>{let h=await siteReq(rule.host+'/category/cn/');return parseItems(h).map(x=>({vod_id:x.url,vod_name:x.title,vod_pic:x.pic_url,vod_remarks:x.desc}))},
 category:async b=>{let n=pg(b);let url=rule.host+'/category/'+(b.id||'cn')+'/'+(n>1?n+'/':'');let h=await siteReq(url);return list(parseItems(h).map(x=>({vod_id:x.url,vod_name:x.title,vod_pic:x.pic_url,vod_remarks:x.desc})),n)},
 search:async b=>{let n=pg(b),h=await siteReq(rule.host+'/?s='+encodeURIComponent(b.wd||'')+'&page='+n);return list(parseItems(h).map(x=>({vod_id:x.url,vod_name:x.title,vod_pic:x.pic_url,vod_remarks:x.desc})),n)},
 detail:async b=>{let u=id(b);return [await rule.二级.call({...rule,input:u})]},
 play:async b=>rule.lazy('',id(b))
});
  s.meta.key = 'py_xingmeng_asmr';
  s.meta.name = '✨星梦 ASMR-S';
  return s;
}
