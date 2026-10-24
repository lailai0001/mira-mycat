import req from '../../util/req.js';
import crypto from 'crypto';
import cheerio from 'cheerio';
// 滴源 Node 插件兼容基础环境；原始业务源码保留在此文件中。
'use strict';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
const log = (...a)=>console.log(...a);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const CryptoJS={HmacSHA256:(str,key)=>({toString:()=>crypto.createHmac('sha256',key).update(str).digest('hex')})};
function base64Decode(x){return Buffer.from(String(x),'base64').toString('utf8')}
function base64Encode(x){return Buffer.from(String(x)).toString('base64')}
function setResult(v){return Array.isArray(v)?v.map(x=>({vod_id:String(x.vod_id||x.url||x.id||''),vod_name:String(x.vod_name||x.title||x.name||''),vod_pic:String(x.vod_pic||x.img||x.pic_url||x.pic||''),vod_remarks:String(x.vod_remarks||x.desc||'')})):[]}
function urljoin(a,b){return new URL(String(b||''),String(a)).href}
function buildUrl(raw, params){const u=new URL(raw);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return u.href}
function urlDeal(x){return x}
const local={get:()=>'',set:()=>{}};
async function request(url, opt = {}) {
  if (typeof opt === 'string') opt = {};
  const method = (opt.method || 'GET').toUpperCase();
  const headers = Object.assign({}, opt.headers || {});
  const timeout = opt.timeout || 20000;
  const body = opt.body !== undefined ? opt.body : opt.data;
  try {
    const r = await req({ method, url, headers, data: body, timeout, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const tt = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body, signal: ctl.signal, redirect: 'follow' });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(tt); }
    }
    throw e;
  }
}
async function post(url,opt={}){return request(url,{...opt,method:'POST'})}
const axios=async opt=>({data:await request(opt.url,opt)});
// 需要 HTML DOM 选择器的源使用 cheerio；滴源未安装时会明确报错，不再静默返回空列表。
function ensureHtml(){if(!cheerio)throw Error('此源使用 drpy DOM 规则，运行环境需提供 cheerio 模块')}
function pq(html){ensureHtml();return cheerio.load(html)}
function pdfa(html,selector){ensureHtml();let sel=String(selector||'').replace(/&&/g,' ');let $=cheerio.load(String(html||''));return $(sel).toArray().map(e=>$.html(e));}
function pdfh(html,selector){ensureHtml();let ss=String(selector||'').split('&&'),sel=ss[0]||'body',field=ss[1]||'Text';let $=cheerio.load(String(html||''));let node=$(sel).first();if(field==='Html')return node.html()||'';if(field==='Text')return node.text()||'';return node.attr(field)||'';}
function pd(html,selector,base){let u=pdfh(html,selector);return u&&base?urljoin(base,u):u}



/*
@header({
  searchable: 2,
  filterable: 0,
  quickSearch: 0,
  title: '茶杯狐',
  '类型': '影视',
  logo: 'https://citapa.com/favicon.ico',
  lang: 'ds'
})
*/

var rule = {
    title: '茶杯狐',
    logo: 'https://citapa.com/favicon.ico',
    host: 'https://citapa.com',
    url: '/',
    searchUrl: '/search.php?searchword=**&page=fypage',
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
    play_parse: true,
    class_name: '电影&电视剧&综艺&动漫',
    class_url: '1&2&3&4',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36',
        'Referer': 'https://citapa.com/',
        'Origin': 'https://citapa.com'
    },

    fix: function(u) {
        if (!u) return '';
        if (u.startsWith('//')) return 'https:' + u;
        if (u.startsWith('/')) return this.host + u;
        return u;
    },

    getContent: function(res) {
        if (!res) return '';
        if (typeof res === 'string') return res;
        return res.content || res.text || res.body || '';
    },

    cleanText: function(s) {
        return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    },

    parseList: function(html) {
        let videos = [], seen = new Set();
        let items = pdfa(html, '.module-search-item') || [];
        if (!items.length) items = pdfa(html, '.module-item') || [];
        items.forEach(item => {
            let href = pdfh(item, 'a&&href');
            if (!href) return;
            let m = href.match(/\/movie\/index(\d+)\.html/);
            if (!m) return;
            let vodId = m[1];
            if (seen.has(vodId)) return;
            seen.add(vodId);

            let vodName = this.cleanText(
                pdfh(item, 'h3 a&&Text') || pdfh(item, 'h3 a&&title') || 
                pdfh(item, 'img&&alt') || pdfh(item, 'a&&title') || 
                pdfh(item, '.module-item-title&&Text') || ''
            );
            let vodPic = this.fix(
                pdfh(item, 'img&&data-src') || pdfh(item, 'img&&data-original') || 
                pdfh(item, 'img&&src') || ''
            );
            let vodRemarks = this.cleanText(
                pdfh(item, '.module-item-text&&Text') || pdfh(item, '.video-serial&&Text') || 
                pdfh(item, '.video-serial&&title') || ''
            );

            if (vodName) {
                videos.push({
                    vod_id: vodId,
                    vod_name: vodName,
                    vod_pic: vodPic,
                    vod_remarks: vodRemarks
                });
            }
        });
        return videos;
    },

    一级: async function(tid, pg, filter, extend) {
        let res = await request(this.host + '/search.php?searchtype=5&tid=' + tid + '&page=' + pg, { headers: this.headers });
        return this.parseList(this.getContent(res));
    },

    二级: async function(ids) {
        let vid = ids[0].split(',')[0].trim();
        let res = await request(this.host + '/movie/index' + vid + '.html', { headers: this.headers });
        let html = this.getContent(res);
        if (!html) return {};

        let vodName = this.cleanText(pdfh(html, 'h1&&Text') || pdfh(html, 'meta[property=og:title]&&content'));
        let vodPic = this.fix(pdfh(html, 'meta[property=og:image]&&content') || pdfh(html, 'img&&data-src') || pdfh(html, 'img&&data-original') || pdfh(html, 'img&&src'));
        let vodContent = this.cleanText(pdfh(html, 'meta[property=og:description]&&content'));
        let vodDirector = this.cleanText(pdfh(html, 'meta[property=og:video:director]&&content'));
        let vodActor = this.cleanText(pdfh(html, 'meta[property=og:video:actor]&&content'));
        let vodArea = this.cleanText(pdfh(html, 'meta[property=og:video:area]&&content'));

        let tabs = pdfa(html, '[data-dropdown-value]').map(el => pdfh(el, '&&data-dropdown-value')).filter(Boolean);

        let playFrom = [], playUrl = [];
        pdfa(html, '.module-list.module-player-list').forEach((panel, i) => {
            let eps = pdfa(panel, 'a[href*="/play/"]').map(a => {
                let t = this.cleanText(pdfh(a, 'a&&title') || pdfh(a, 'a&&Text'));
                let u = this.fix(pdfh(a, 'a&&href'));
                return t && u ? t + '$' + u : null;
            }).filter(Boolean);

            if (eps.length) {
                let key = tabs[i] || '线路' + (i + 1);
                if (!playFrom.includes(key)) {
                    playFrom.push(key);
                    playUrl.push(eps.join('#'));
                }
            }
        });

        if (!playFrom.length) {
            let eps = pdfa(html, 'a[href*="/play/' + vid + '-"]').map(a => {
                let t = this.cleanText(pdfh(a, 'a&&Text')) || '播放';
                let u = this.fix(pdfh(a, 'a&&href'));
                return t && u ? t + '$' + u : null;
            }).filter(Boolean);
            if (eps.length) {
                playFrom.push('默认');
                playUrl.push(eps.join('#'));
            }
        }

        if (!playFrom.length) return {};

        return {
            vod_id: vid,
            vod_name: vodName,
            vod_pic: vodPic,
            vod_director: vodDirector,
            vod_actor: vodActor,
            vod_area: vodArea,
            vod_content: vodContent,
            vod_play_from: playFrom.join('$$$'),
            vod_play_url: playUrl.join('$$$')
        };
    },

    搜索: async function(key, quick, pg) {
        key = String(key || '').trim();
        if (!key) return setResult([]);

        pg = Number(pg || 1);
        let searchGet = this.host + '/search.php?searchword=' + encodeURIComponent(key) + '&page=' + pg;

        let html = '';
        try {
            let res = await request(searchGet, { headers: this.headers, timeout: 15000 });
            html = this.getContent(res);
        } catch (e) {}

        if (!/(module-search-item|module-item|movie\/index\d+\.html)/i.test(html)) {
            try {
                let res = await request(this.host + '/search.php', {
                    method: 'post',
                    headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: 'searchword=' + encodeURIComponent(key) + '&page=' + pg,
                    timeout: 15000
                });
                let postHtml = this.getContent(res);
                if (postHtml) html = postHtml;
            } catch (e) {}
        }

        return this.parseList(html);
    },

    lazy: async function(flag, id, vipFlags) {
        let playPageUrl = id.startsWith('http') ? id : this.host + id;
        let res = await request(playPageUrl, { headers: this.headers });
        let html = this.getContent(res);
        if (!html) return { parse: 1, url: playPageUrl };

        let m3u8Matches = html.match(/["']([^"']+\.m3u8[^"']*)["']/gi);
        if (!m3u8Matches || !m3u8Matches.length) return { parse: 1, url: playPageUrl, header: this.headers };

        let playUrls = m3u8Matches.map(url => url.replace(/^["']|["']$/g, ''));
        let playUrl = playUrls[0];

        let urlMatch = playPageUrl.match(/\/play\/(\d+)-(\d+)-(\d+)\.html/);
        if (urlMatch && playUrls.length > 1) {
            let lineIndex = parseInt(urlMatch[2]) || 0;
            if (lineIndex >= 0 && lineIndex < playUrls.length) {
                playUrl = playUrls[lineIndex];
            }
        }

        if (playUrl.startsWith('//')) playUrl = 'https:' + playUrl;
        else if (playUrl.startsWith('/')) playUrl = this.host + playUrl;

        return { parse: 0, url: playUrl, header: this.headers };
    },

    推荐: async function() {
        let res = await request(this.host + '/', { headers: this.headers });
        return this.parseList(this.getContent(res));
    },

    class_parse: async function() {
        return {
            class: [
                { type_id: '1', type_name: '电影' },
                { type_id: '2', type_name: '电视剧' },
                { type_id: '3', type_name: '综艺' },
                { type_id: '4', type_name: '动漫' }
            ],
            filters: {}
        };
    }
};


// 插件入口必须为 {meta, api} 对象；所有 key 均为英文标识。
const __key='py_chabeihu',__title='🦊茶杯狐 - 极速';
function __cls(){return String(rule.class_url||'').split('&').filter(Boolean).map((id,i)=>({type_id:id,type_name:String(rule.class_name||'').split('&')[i]||id}))}
function __page(b){return Math.max(1,Number.parseInt(b.page||b.pg||1,10)||1)}
function __url(pattern,{id='',page=1,wd='',ext={}}={}){
 let s=String(pattern||'/').replace(/fyclass/g,encodeURIComponent(id)).replace(/fypage/g,String(page)).replace(/fyid/g,encodeURIComponent(id)).replace(/\*\*/g,encodeURIComponent(wd));
 s=s.replace(/\{\{fl\.([\w]+)(?:\s+or\s+[^}]+)?\}\}/g,(_,k)=>encodeURIComponent(ext[k]||''));
 return /^https?:\/\//.test(s)?s:new URL(s,rule.host||rule.homeUrl||'https://invalid.local').href;
}
function __list(v){if(typeof v==='string')throw Error('原始 drpy 声明式规则需单独移植，不能直接当函数执行');if(Array.isArray(v))return setResult(v);return setResult(v&&v.list||[])}
function __detail(v){return {list:Array.isArray(v)?v:(v&&v.list?v.list:v?[v]:[])}}
async function __run(name,args=[],ctx={}){
 const fn=rule[name];if(typeof fn!=='function')throw Error(name+' 当前使用 drpy 声明式/内置解析规则，需 DOM 适配，尚未完成');
 const old={};for(const k of Object.keys(ctx)){old[k]=rule[k];rule[k]=ctx[k]}
 try {return await fn.apply(rule,args)}finally{for(const k of Object.keys(ctx))rule[k]=old[k]}
}
export default function createSpider() {
  return {meta:{key:__key,name:__title,type:3,searchable:rule.searchable?1:0,quickSearch:rule.quickSearch?1:0,filterable:rule.filterable?1:0},api:async fastify=>{
 let ready=false;const initialize=async()=>{if(ready)return;if(typeof rule['预处理']==='function')await __run('预处理');ready=true};
 fastify.post('/init',async()=>{await initialize();return {}});
 fastify.post('/home',async req=>{await initialize();let classes=__cls(),filters=rule.filter||{};
 if(typeof rule.class_parse==='function'){const c=await __run('class_parse');classes=c.class||classes;filters=c.filters||filters;}
 let list=[];if(typeof rule['推荐']==='function')list=__list(await __run('推荐',[],{input:__url(rule.homeUrl||'/')}));
 return {class:classes,filters,list};});
 fastify.post('/category',async req=>{await initialize();const b=req.body||{},id=String(b.id||'1'),page=__page(b),ext=b.extend||b.filters||{};
 const v=await __run('一级',[id,page,true,ext],{input:__url(rule.url,{id,page,ext}),MY_CATE:id,MY_PAGE:page,MY_FL:ext});const list=__list(v);
 return {page,pagecount:page+(list.length>=20?1:0),list,limit:list.length,total:list.length?9999:0};});
 fastify.post('/detail',async req=>{await initialize();const b=req.body||{},id=String(Array.isArray(b.id)?b.id[0]:b.id||'');
 return __detail(await __run('二级',[[id]],{input:rule.detailUrl?__url(rule.detailUrl,{id}):id,MY_URL:id}));});
 fastify.post('/search',async req=>{await initialize();const b=req.body||{},wd=String(b.wd||b.keyword||''),page=__page(b);if(!wd)return {list:[],page,pagecount:page};
 const list=__list(await __run('搜索',[wd,false,page],{input:__url(rule.searchUrl,{wd,page}),KEY:wd,MY_PAGE:page}));return {page,pagecount:page+(list.length>=20?1:0),list,limit:list.length,total:list.length?9999:0};});
 fastify.post('/play',async req=>{await initialize();const b=req.body||{},id=String(Array.isArray(b.id)?b.id[0]:b.id||'');
 if(typeof rule.lazy!=='function')return {parse:0,url:id};const result=await __run('lazy',[b.flag||'',id],{input:id,MY_FLAG:b.flag||''});
 return typeof result==='string'?{parse:0,url:result}:result||{parse:0,url:''};});
}};
}
