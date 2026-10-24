import req from '../../util/req.js';
import crypto from 'crypto';
async function reqTextAx(url, opt = {}) {
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
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

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
  return reqTextAx(url, opt);
}
async function post(url,opt={}){return request(url,{...opt,method:'POST'})}
const axios=async opt=>({data:await request(opt.url,opt)});
// 需要 HTML DOM 选择器的源使用 cheerio；滴源未安装时会明确报错，不再静默返回空列表。
import cheerio from 'cheerio';
function ensureHtml(){}
function pq(html){ensureHtml();return cheerio.load(html)}
function pdfa(html,selector){ensureHtml();let sel=String(selector||'').replace(/&&/g,' ');let $=cheerio.load(String(html||''));return $(sel).toArray().map(e=>$.html(e));}
function pdfh(html,selector){ensureHtml();let ss=String(selector||'').split('&&'),sel=ss[0]||'body',field=ss[1]||'Text';let $=cheerio.load(String(html||''));let node=$(sel).first();if(field==='Html')return node.html()||'';if(field==='Text')return node.text()||'';return node.attr(field)||'';}
function pd(html,selector,base){let u=pdfh(html,selector);return u&&base?urljoin(base,u):u}



/*
@header({
  searchable: 1,
  filterable: 0,
  quickSearch: 0,
  title: '🦛河马剧场·短剧',
  '类型': '短剧',
  lang: 'ds'
})
*/

const HOST = 'https://www.kuaikaw.cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CLASSES = [
    {type_id: '417-464', type_name: '逆袭'},
    {type_id: '713', type_name: '闪婚'},
    {type_id: '462', type_name: '甜宠'},
    {type_id: '1129', type_name: '都市'},
    {type_id: '444', type_name: '古装'},
    {type_id: '916', type_name: '穿越'},
    {type_id: '439-465', type_name: '重生'},
    {type_id: '416-1708', type_name: '复仇'},
    {type_id: '714-1126', type_name: '家庭'},
    {type_id: '838', type_name: '情感'},
    {type_id: '1115-1589', type_name: '漫剧'},
    {type_id: '1091-1096', type_name: '电影'},
    {type_id: '1092-1097', type_name: '电视剧'},
    {type_id: '1642-1643', type_name: '综艺'},
];

function abs(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    return HOST + (url[0] === '/' ? url : '/' + url);
}

function stripTags(s) {
    return String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeJsonText(s) {
    return String(s || '').replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function nextData(html) {
    html = String(html || '');
    const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return {};
    try {
        return JSON.parse(decodeJsonText(m[1]));
    } catch (e) {
        return {};
    }
}

function walk(obj, fn, seen) {
    seen = seen || [];
    if (!obj || typeof obj !== 'object') return;
    if (seen.indexOf(obj) >= 0) return;
    seen.push(obj);
    fn(obj);
    if (Array.isArray(obj)) {
        obj.forEach(function (it) { walk(it, fn, seen); });
    } else {
        Object.keys(obj).forEach(function (k) { walk(obj[k], fn, seen); });
    }
}

function pickBooks(data) {
    const out = [];
    const ids = {};
    walk(data, function (o) {
        if (o && o.bookId && o.bookName && (o.coverWap || o.introduction || o.totalChapterNum)) {
            const id = String(o.bookId);
            if (!ids[id]) {
                ids[id] = 1;
                out.push(bookVod(o));
            }
        }
    });
    return out;
}

function bookVod(o) {
    const ep = o.totalChapterNum || o.chapterCount || '';
    const end = Number(o.status) === 1 || o.statusDesc === '完本';
    return {
        vod_id: String(o.bookId || ''),
        vod_name: String(o.bookName || ''),
        vod_pic: abs(o.coverWap || o.cover || ''),
        vod_remarks: ep ? (end ? '全' + ep + '集' : '更新至' + ep + '集') : (o.statusDesc || ''),
        vod_content: o.introduction || '',
    };
}

async function getHtml(url) {
    return await request(url, {
        headers: {
            'User-Agent': UA,
            'Referer': HOST + '/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
    });
}

function findBook(data, id) {
    let found = null;
    walk(data, function (o) {
        if (!found && o && String(o.bookId || '') === String(id) && o.bookName) found = o;
    });
    return found || {};
}

function findChapters(data, bookId) {
    let best = [];
    walk(data, function (o) {
        if (Array.isArray(o) && o.length && o[0] && o[0].chapterId) {
            if (o.length > best.length) best = o;
        }
    });
    return best.map(function (c, i) {
        const name = c.chapterName || ('第' + (c.chapterIndex || (i + 1)) + '集');
        return {
            name: name,
            id: String(bookId) + ':' + String(c.chapterId || ''),
            mp4: c.chapterVideoVo && c.chapterVideoVo.mp4 ? c.chapterVideoVo.mp4 : '',
            charge: String(c.isCharge || ''),
            cover: c.cover || '',
        };
    }).filter(function (c) { return c.id.indexOf(':') > 0; });
}

var rule = {
    title: '🦛河马剧场·短剧',
    host: HOST,
    url: '/browse/fyclass/fypage',
    detailUrl: '/drama/fyid',
    searchUrl: '/search?searchValue=**',
    searchable: 1,
    quickSearch: 0,
    filterable: 0,
    timeout: 8000,
    class_name: CLASSES.map(function (c) { return c.type_name; }).join('&'),
    class_url: CLASSES.map(function (c) { return c.type_id; }).join('&'),
    play_parse: true,
    play_json: [{re: '*', json: {}}],

    推荐: async function () {
        const html = await getHtml(HOST + '/');
        const data = nextData(html);
        return pickBooks(data).slice(0, 60);
    },

    一级: async function () {
        let cate = this.MY_CATE || '417-464';
        let pg = Number(this.MY_PAGE || 1);
        let url = HOST + '/browse/' + cate + (pg > 1 ? '/' + pg : '');
        const html = await getHtml(url);
        const data = nextData(html);
        let list = [];
        const pp = data && data.props && data.props.pageProps ? data.props.pageProps : {};
        if (Array.isArray(pp.bookList)) list = pp.bookList.map(bookVod);
        if (!list.length) list = pickBooks(data);
        return list;
    },

    二级: async function (ids) {
        const id = Array.isArray(ids) ? ids[0] : ids;
        const html = await getHtml(HOST + '/drama/' + id);
        const data = nextData(html);
        const book = findBook(data, id);
        const chapters = findChapters(data, id);
        const plays = chapters.length ? chapters : [{name: '第1集', id: String(id)}];
        const tag = (book.bookTypeThree || []).map(function (t) { return t.name; }).filter(Boolean).join('/');
        return {
            vod_id: String(id),
            vod_name: book.bookName || stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [,''])[1]) || '',
            vod_pic: abs(book.coverWap || book.cover || ''),
            type_name: tag,
            vod_year: '',
            vod_area: '',
            vod_actor: [book.actor, book.actress].filter(Boolean).join(','),
            vod_director: '',
            vod_remarks: book.totalChapterNum ? '全' + book.totalChapterNum + '集' : (book.statusDesc || ''),
            vod_content: book.introduction || '',
            vod_play_from: '河马',
            vod_play_url: plays.map(function (p) { return p.name + '$' + p.id; }).join('#'),
        };
    },

    搜索: async function (wd, quick, pg) {
        const key = wd || this.KEY || '';
        const html = await request(HOST + '/seo/video/6007', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Referer': HOST + '/search?searchValue=' + encodeURIComponent(key),
                'Content-Type': 'application/json',
                'pname': 'www.kuaikaw.cn',
            },
            body: JSON.stringify({sourceType: 1, keyword: key, index: Number(pg || this.MY_PAGE || 1)})
        });
        let json = html;
        if (typeof html === 'string') {
            try { json = JSON.parse(html); } catch (e) { json = {}; }
        }
        const data = json && json.data ? json.data : json;
        const list = (data && Array.isArray(data.bookList)) ? data.bookList : [];
        return list.map(bookVod);
    },

    lazy: async function (flag, id) {
        id = String(id || '');
        let bookId = id;
        let chapterId = '';
        if (id.indexOf(':') > -1) {
            const arr = id.split(':');
            bookId = arr[0];
            chapterId = arr[1];
        }
        let url = chapterId ? (HOST + '/episode/' + bookId + '/' + chapterId) : (HOST + '/episode/' + bookId);
        try {
            const html = await getHtml(url);
            const data = nextData(html);
            let hit = '';
            walk(data, function (o) {
                if (!hit && o && String(o.chapterId || '') === String(chapterId) && o.chapterVideoVo && o.chapterVideoVo.mp4) {
                    hit = o.chapterVideoVo.mp4;
                }
            });
            if (!hit) {
                walk(data, function (o) {
                    if (!hit && o && o.chapterVideoVo && o.chapterVideoVo.mp4) hit = o.chapterVideoVo.mp4;
                });
            }
            if (hit) {
                return {
                    parse: 0,
                    url: hit,
                    header: {'User-Agent': UA, 'Referer': url}
                };
            }
        } catch (e) {}
        return {parse: 1, url: url};
    }
};


// 插件入口必须为 module.exports={meta,api}；所有 key 均为英文标识。
const __key='py_hema_duanju',__title='🦛河马 - 短剧';
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