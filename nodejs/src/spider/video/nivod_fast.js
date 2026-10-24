// 滴源 Node 插件兼容基础环境；原始业务源码保留在此文件中。
'use strict';
import req from '../../util/req.js';
import crypto from 'crypto';
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
async function request(url, opt) {
  const o = opt || {};
  const method = String(o.method || 'GET').toUpperCase();
  const r = await req({ method, url, headers: o.headers || {}, data: o.body || o.data || undefined, timeout: o.timeout || 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ' ' + url);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}

const NIVOD_HOST = 'https://www.nivod.cc';
const NIVOD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function nivodText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();
}

function nivodAbs(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return NIVOD_HOST + (url.startsWith('/') ? url : '/' + url);
}

function nivodCards(html) {
    const list = [];
    const seen = {};
    const blocks = String(html || '').match(/<li\b[^>]*class="[^"]*qy-mod-li[^"]*"[\s\S]*?<\/li>/gi) || [];
    blocks.forEach((it) => {
        const href = (it.match(/href="(\/voddetail\/[^"?#]+)[^"]*"/i) || [])[1] || '';
        const id = (href.match(/\/voddetail\/(\d+)/i) || [])[1] || '';
        if (!id || seen[id]) return;
        const title = nivodText(((it.match(/<a\b[^>]*class="[^"]*link-txt[^"]*"[^>]*title="([^"]+)"/i) || [])[1]) ||
            ((it.match(/<a\b[^>]*title="([^"]+)"[^>]*class="[^"]*link-txt/i) || [])[1]) ||
            ((it.match(/<a\b[^>]*class="[^"]*link-txt[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1]));
        if (!title) return;
        let pic = (it.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i) || [])[2] || '';
        if (!pic) pic = (it.match(/data-original="([^"]+)"/i) || [])[1] || '';
        const remarks = nivodText((it.match(/<span\b[^>]*class="[^"]*qy-mod-label[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
        seen[id] = 1;
        list.push({
            vod_id: id,
            vod_name: title,
            vod_pic: nivodAbs(pic),
            vod_remarks: remarks
        });
    });
    return list;
}

async function nivodRequest(url) {
    return await request(url, {
        headers: {
            'User-Agent': NIVOD_UA,
            'Referer': NIVOD_HOST + '/'
        },
        timeout: 10000
    });
}

var rule = {
    title: '🎬泥视频·极速',
    author: 'Codex修复',
    type: '影视',
    host: NIVOD_HOST,
    url: '/class.html?channel=fyclass&page=fypage',
    searchUrl: '/search.html?keyword=**&page=fypage',
    detailUrl: '/voddetail/fyid',
    class_name: '电影&电视剧&综艺&动漫',
    class_url: 'movie&tv&show&anime',
    searchable: 1,
    quickSearch: 1,
    filterable: 0,
    headers: {
        'User-Agent': NIVOD_UA,
        'Referer': NIVOD_HOST + '/'
    },

    推荐: async function () {
        const html = await nivodRequest(NIVOD_HOST + '/');
        return nivodCards(html).slice(0, 60);
    },

    一级: async function (tid, pg) {
        pg = pg || 1;
        const url = NIVOD_HOST + '/class.html?channel=' + encodeURIComponent(tid) + '&page=' + pg;
        const html = await nivodRequest(url);
        return nivodCards(html);
    },

    搜索: async function (wd, quick, pg) {
        pg = pg || 1;
        const url = NIVOD_HOST + '/search.html?keyword=' + encodeURIComponent(wd) + '&page=' + pg;
        const html = await nivodRequest(url);
        return nivodCards(html);
    },

    二级: async function (ids) {
        const id = Array.isArray(ids) ? ids[0] : ids;
        const url = NIVOD_HOST + '/voddetail/' + id;
        const html = await nivodRequest(url);
        const title = nivodText((html.match(/<title>([^_<]+?)(?:_在线观看)?\s*-\s*泥视频/i) || [])[1]);
        const content = nivodText((html.match(/<meta\b[^>]*name="description"[^>]*content="([\s\S]*?)"\s*\/?>/i) || [])[1]);
        const keywords = nivodText((html.match(/<meta\b[^>]*name="keywords"[^>]*content="([^"]*)"/i) || [])[1]);
        const pic = nivodAbs((html.match(/<img\b[^>]*src="([^"]+)"[^>]*class="left-img"/i) || [])[1] || ('/imgs/' + id + '.jpg'));
        const eps = [];
        const seen = {};
        const re = /<a\b[^>]*href="(\/vodplay\/[^"?#]+)"[^>]*>[\s\S]*?<div\b[^>]*class="item"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/a>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const epUrl = nivodAbs(m[1]);
            if (seen[epUrl]) continue;
            seen[epUrl] = 1;
            eps.push(nivodText(m[2]).replace(/\$/g, ' ') + '$' + epUrl);
        }
        eps.reverse();
        return {
            vod_id: String(id),
            vod_name: title || String(id),
            vod_pic: pic,
            vod_remarks: eps.length ? ('共' + eps.length + '集') : '',
            vod_year: (keywords.match(/\b(19|20)\d{2}\b/) || [])[0] || '',
            vod_area: keywords.indexOf('大陆') > -1 ? '大陆' : '',
            vod_content: content,
            vod_play_from: '泥视频',
            vod_play_url: eps.join('#')
        };
    },

    // 播放页 /vodplay/<id>/epN 是 HTML，真实地址在 /xhr_playinfo/<id>-epN 的
    // pdatas[].playurl（多条线路 m3u8）里；这里直接取出直链返回 parse:0，
    // 不再把网页地址丢给壳子的网页嗅探（真机上嗅探不到 DPlayer 的 XHR 地址）。
    lazy: async function (flag, id) {
        const header = {
            'User-Agent': NIVOD_UA,
            'Referer': NIVOD_HOST + '/'
        };
        const pageUrl = nivodAbs(id);
        if (!pageUrl) return { parse: 0, url: '' };
        if (/\.(m3u8|mp4)(?:[?#]|$)/i.test(pageUrl)) return { parse: 0, url: pageUrl, header };

        // 真实接口形如 /xhr_playinfo/<id>-<ep>，先按 URL 规则直接拼，少一次页面请求；
        // 拼不出来或接口没数据时，再回读播放页里写死的接口地址。
        let list = [];
        const loadInfo = async (p) => {
            try {
                const txt = await nivodRequest(nivodAbs(p));
                const data = JSON.parse(txt);
                return (data && data.pdatas || [])
                    .map((x) => String(x && x.playurl || ''))
                    .filter((u) => /^https?:\/\//i.test(u));
            } catch (e) { return []; }
        };
        const m = pageUrl.match(/\/vodplay\/(\d+)\/([^/?#]+)/i);
        if (m) list = await loadInfo('/xhr_playinfo/' + m[1] + '-' + m[2]);
        if (!list.length) {
            try {
                const html = await nivodRequest(pageUrl);
                const infoPath = (html.match(/["'](\/xhr_playinfo\/[^"']+)["']/i) || [])[1] || '';
                if (infoPath) list = await loadInfo(infoPath);
            } catch (e) { /* 接口取不到时回退网页嗅探 */ }
        }

        // 多条线路里挑第一条真正能返回 #EXTM3U 的：并发试探、先成功者胜，
        // 前面的线路给一点优先级（错开 120ms），避免某条线路在本地被墙/失效；
        // 全部失败就退回第一条，保证 /play 不会长时间卡住。
        const picks = list.slice(0, 4);
        const chosen = picks.length ? await new Promise((resolve) => {
            let pending = picks.length, done = false;
            const finish = (u) => { if (!done) { done = true; resolve(u || ''); } };
            const timer = setTimeout(() => finish(''), 3500);
            picks.forEach((u, i) => {
                setTimeout(async () => {
                    if (done) return;
                    let ok = /\.mp4(?:[?#]|$)/i.test(u);
                    if (!ok) {
                        try {
                            const body = await request(u, { headers: Object.assign({}, header, { Range: 'bytes=0-2047' }), timeout: 4000 });
                            ok = /^#EXTM3U/i.test(String(body || '').replace(/^\uFEFF/, '').trim());
                        } catch (e) { ok = false; }
                    }
                    if (ok) { clearTimeout(timer); finish(u); return; }
                    if (--pending === 0) { clearTimeout(timer); finish(''); }
                }, i * 120);
            });
        }) : '';
        if (chosen) return { parse: 0, url: chosen, header };
        if (list.length) return { parse: 0, url: list[0], header };

        // 兜底：保留原来的网页地址交给壳子嗅探
        return { parse: 1, url: pageUrl, header };
    }
};




// 插件入口必须为 const __spider={meta,api}；所有 key 均为英文标识。
const __key='py_nivod_fast',__title='📹泥视频 - 极速';
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
const __spider={meta:{key:__key,name:__title,type:3,searchable:rule.searchable?1:0,quickSearch:rule.quickSearch?1:0,filterable:rule.filterable?1:0},api:async fastify=>{
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
 const p=typeof result==='string'?{parse:0,url:result}:result||{parse:0,url:''}; if(p.url&&/\.(m3u8|mp4)(?:[?#]|$)/i.test(p.url))p.parse=0;return p;});
}};

export default function createSpider() { return __spider; }
