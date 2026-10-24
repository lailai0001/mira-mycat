// 滴源 Node 环境通用兼容层。原始站点代码完整保留在下方。
'use strict';
import req from '../../util/req.js';
function base64Encode(x) { return Buffer.from(String(x), 'utf8').toString('base64'); }
function base64Decode(x) { return Buffer.from(String(x), 'base64').toString('utf8'); }
const log = (...args) => console.log(...args);
const setResult = function(items) {
  if (!Array.isArray(items)) return items || [];
  return items.map(i => ({
    vod_id: String(i.vod_id || i.url || i.id || ''),
    vod_name: String(i.vod_name || i.title || i.name || ''),
    vod_pic: String(i.vod_pic || i.pic_url || i.img || i.pic || ''),
    vod_remarks: String(i.vod_remarks || i.desc || i.remarks || '')
  }));
};
async function fetchText(url, headers) {
  const r = await req.get(url, { headers: headers || {}, timeout: 10000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ' ' + url);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
const _fetch = async (url, opts = {}) => { const text = await fetchText(url, (opts || {}).headers || {}); return { text: async () => text }; };
const local={get:()=>'',set:()=>{}};

/*
@header({
  searchable: 1,
  filterable: 1,
  quickSearch: 0,
  title: '独播库',
  author: 'EylinSir',
  '类型': '影视',
  logo:'https://www.dbku.tv/static/favicon.ico',
  lang: 'ds'
})
*/

var rule = {
    类型: '影视',
    author: 'EylinSir',
    title: '独播库',
    host: 'https://api.dbokutv.com',
    url: '/home',
    logo:'https://www.dbku.tv/static/favicon.ico',
    searchUrl: '/vodsearch',
    searchable: 1,
    quickSearch: 0,
    filterable: 1,
    timeout: 10000,
    play_parse: true,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.duboku.tv/"
    },

    get: async function(path) {
        let url = this.getSignedUrl(path);
        let resp = await _fetch(url, { headers: this.headers });
        return JSON.parse(await resp.text());
    },

    format: function(list) {
        return (list || []).map(j => ({
            title: j.Name,
            url: `${this.host}${this.decodeData(j.DId || j.DuId)}`,
            desc: j.Tag,
            pic_url: this.decodeData(j.TnId),
            vod_id: this.decodeData(j.DId || j.DuId)
        }));
    },

    class_parse: async function() {
        return {
            class: [{ type_id: '2', type_name: '连续剧' }, { type_id: '1', type_name: '电影' }, { type_id: '3', type_name: '综艺' }, { type_id: '4', type_name: '动漫' }],
            filters: {}
        };
    },

    推荐: async function() {
        let json = await this.get('/home');
        let videos = [];
        (json || []).forEach(g => videos.push(...this.format(g.VodList)));
        return setResult(videos);
    },

    一级: async function(tid, pg) {
        let page = (pg || 1).toString();
        let data = await this.get(`/vodshow/${tid}--------${page === '1' ? '' : page}---`);
        return setResult(this.format(data.VodList));
    },

    二级: async function() {
        let id = this.input.replace(this.host, '');
        let data = await this.get(id);
        if (!data) return {};
        let playUrls = (data.Playlist || []).map(i => 
            `${i.EpisodeName}$${this.decodeData(i.VId)}`
        ).join('#');
        return {
            vod_id: id,
            vod_name: data.Name,
            vod_pic: this.decodeData(data.TnId),
            vod_remarks: `评分：${data.Rating}`,
            vod_year: data.ReleaseYear,
            vod_area: data.Region,
            vod_actor: Array.isArray(data.Actor) ? data.Actor.join(',') : data.Actor,
            vod_director: data.Director,
            vod_content: data.Description,
            vod_play_from: '独播库',
            vod_play_url: playUrls,
            type_name: `${data.Genre || ''},${data.Scenario || ''}`
        };
    },

    搜索: async function() {
        let data = await this.get(`/vodsearch?wd=${this.KEY}`);
        let url = this.getSignedUrl('/vodsearch') + `&wd=${this.KEY}`;
        let resp = await _fetch(url, { headers: this.headers });
        return setResult(this.format(JSON.parse(await resp.text())));
    },

    lazy: async function() {
        let id = this.input.replace(this.host, '');
        let res = await this.get(id);
        return {
            parse: 0,
            url: this.decodeData(res.HId),
            header: {
                'User-Agent': this.headers['User-Agent'],
                'Origin': 'https://w.duboku.io',
                'Referer': 'https://w.duboku.io/'
            }
        };
    },

    getSignedUrl: function(path) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const rand = Math.floor(Math.random() * 800000001);
        const combined = (rand + 100000000).toString() + (900000000 - rand).toString();
        let interleaved = '';
        const len = Math.min(combined.length, ts.length);
        for (let i = 0; i < len; i++) interleaved += combined[i] + ts[i];
        interleaved += combined.substring(len) + ts.substring(len);
        const ssid = base64Encode(interleaved).replace(/=/g, '.');
        const rStr = (l) => Array(l).fill(0).map(() => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
        return `${this.host}${path}${path.includes('?') ? '&' : '?'}sign=${rStr(60)}&token=${rStr(38)}&ssid=${ssid}`;
    },

    decodeData: function(data) {
        if (!data || typeof data !== 'string') return '';
        let str = data.replace(/['"]/g, '').trim();
        if (!str) return '';
        let res = '';
        for (let i = 0; i < str.length; i += 10) {
            res += str.substring(i, i + 10).split('').reverse().join('');
        }
        try { return base64Decode(res.replace(/\./g, '=')); } catch (e) { return ''; }
    },
};





// 滴源要求的 { meta, api } 注册入口
function __paramBody(req){return req&&req.body||{};}
function __classes(r){
 const ids=String(r.class_url||'').split('&'), names=String(r.class_name||'').split('&');
 return ids[0] ? ids.map((id,i)=>({type_id:id,type_name:names[i]||id})) : [];
}
function __url(r,pat,tid,pg,wd,extend){
 let x=String(pat||'').replace(/fyclass/g,encodeURIComponent(tid||''))
   .replace(/fypage/g,String(pg||1)).replace(/fyid/g,encodeURIComponent(tid||''))
   .replace(/\*\*/g,encodeURIComponent(wd||''));
 x=x.replace(/\{\{fl\.([\w]+)(?:\s+or\s+([^}]+))?\}\}/g,(_,k,d)=>encodeURIComponent(extend[k]||d||''));
 if (/^https?:\/\//i.test(x))return x;
 return String(r.host||'').replace(/\/$/,'') + (x.startsWith('/')?'':'/')+x;
}
async function __call(r,fn,args,ctx={}){
 if(typeof fn!=='function')return [];
 const old={};for(const k of Object.keys(ctx)){old[k]=r[k];r[k]=ctx[k];}
 try{return await fn.apply(r,args||[])}finally{for(const k of Object.keys(ctx))r[k]=old[k];}
}
function __items(res){
 if(Array.isArray(res))return setResult(res);
 return setResult((res&&res.list)||(res&&res.vod_list)||(res&&res.data&&res.data.list)||[]);
}
function __wrapDetails(d){
 if(!d)return {list:[]};if(Array.isArray(d))return {list:d};
 if(d.list)return d;
 return {list:[d]};
}
const __key = 'py_duboku';
const __name = '📺独播库 - 极速';
const __spider={
 meta:{key:__key,name:__name,type:3,searchable:Number(rule.searchable||0)?1:0,quickSearch:Number(rule.quickSearch||0)?1:0,filterable:Number(rule.filterable||0)?1:0},
 api: async function(fastify){
  let initialized=false;
  async function init(){if(initialized)return; initialized=true;
   try{if(rule['预处理'])await __call(rule,rule['预处理']);}
   catch(e){initialized=false;throw e;}
  }
  fastify.post('/init', async()=>{await init();return {}});
  fastify.post('/home',async(req)=>{
   await init();let cl=__classes(rule),filters=rule.filter||{};
   if(typeof rule.class_parse==='function'){
    try{let parsed=await __call(rule,rule.class_parse,[]);if(parsed&&parsed.class)cl=parsed.class;if(parsed&&parsed.filters)filters=parsed.filters;}catch(e){console.warn(__name,'class_parse:',e.message)}
   }
   let list=[];if(rule['推荐'])try{list=__items(await __call(rule,rule['推荐'],[],{input:__url(rule,rule.homeUrl||'/', '',1)}))}catch(e){console.warn(__name,'home:',e.message)}
   return {class:cl,filters,list};
  });
  fastify.post('/category',async(req)=>{
   await init();const b=__paramBody(req),id=String(b.id||b.tid||'1'),page=Math.max(1,parseInt(b.page||b.pg||1,10)||1),ext=b.extend||b.filters||{};
   const input=__url(rule,rule.url||rule.homeUrl||'/',id,page,'',ext);
   const result=await __call(rule,rule['一级'],[id,page,true,ext],{input,MY_CATE:id,MY_PAGE:page,MY_FL:ext});
   const list=__items(result);return {list,page,pagecount:page+(list.length>=20?1:0),limit:list.length,total:list.length?9999:0};
  });
  fastify.post('/detail',async(req)=>{
   await init();const b=__paramBody(req);let id=Array.isArray(b.id)?b.id[0]:b.id||b.vod_id||'';
   const input=__url(rule,rule.detailUrl||'',id,1);
   const out=await __call(rule,rule['二级'],[[id]],{input:rule.detailUrl?input:String(id),MY_URL:String(id)});
   return __wrapDetails(out);
  });
  fastify.post('/search',async(req)=>{
   await init();const b=__paramBody(req),wd=String(b.wd||b.keyword||''),page=Math.max(1,parseInt(b.page||1,10)||1);
   if(!wd)return {list:[],page,pagecount:page};
   const input=__url(rule,rule.searchUrl||'', '',page,wd);
   const out=await __call(rule,rule['搜索'],[wd,false,page],{input,KEY:wd,MY_PAGE:page});
   const list=__items(out);return {list,page,pagecount:page+(list.length>=20?1:0),limit:list.length,total:list.length?9999:0};
  });
  fastify.post('/play',async(req)=>{
   await init();const b=__paramBody(req),id=String(Array.isArray(b.id)?b.id[0]:b.id||''),flag=String(b.flag||'');
   if(typeof rule.lazy!=='function')return {parse:0,url:id};
   const out=await __call(rule,rule.lazy,[flag,id],{input:id,flag,MY_FLAG:flag,HOST:rule.host});
   return out||{parse:0,url:''};
  });
 }
};

export default function createSpider() { return __spider; }
