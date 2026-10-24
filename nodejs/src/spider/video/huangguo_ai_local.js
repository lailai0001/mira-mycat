import req from '../../util/req.js';
import crypto from 'crypto';

// GitHub Raw 托管；代码由客户端的 Node.js 环境执行，无服务器中转。
'use strict';
const UA='Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
async function fetchData(url, headers = {}, timeout = 16000, binary = false) {
  const h = Object.assign({ 'User-Agent': UA }, headers || {});
  try {
    const r = await req({ method: 'GET', url, headers: h, timeout, responseType: 'arraybuffer', maxRedirects: 5 });
    const buf = Buffer.from(r.data);
    return binary ? buf : buf.toString('utf8');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + new URL(url).host);
    if (typeof fetch !== 'undefined') {
      const r = await fetch(url, { headers: h });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + new URL(url).host);
      const buf = Buffer.from(await r.arrayBuffer());
      return binary ? buf : buf.toString('utf8');
    }
    throw e;
  }
}
function clean(s){return String(s||'').replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()}
function aurl(u,base){try{return new URL(String(u||''),base).href}catch{return ''}}
function m1(s,re){const m=String(s||'').match(re);return m?m[1]:''}
function body(r){return r.body||{}}
function page(r){return Math.max(1,parseInt(body(r).page||body(r).pg,10)||1)}
function ids(r){let v=body(r).id||body(r).ids||'';return String(Array.isArray(v)?v[0]:v)}
function listing(list,p,n=24){return {page:p,pagecount:p+(list.length>=n?1:0),limit:n,total:list.length>=n?9999:list.length,list}}
function mount(f,fn){for(const k of ['init','home','category','detail','search','play'])f.post('/'+k,async r=>{try{return await fn[k](r)}catch(e){console.error('[Node源]',k,e.message);throw e}})}
const HOST='https://huangguoai.com';const CLASSES=['hot','new','rank','AI换脸','AI魔改','短剧','漫剧','都市','古风','修仙','甜宠'].map(x=>({type_id:x,type_name:({hot:'热门',new:'最新',rank:'排行榜'})[x]||x}));
const filters=Object.fromEntries(CLASSES.map(x=>[x.type_id,[{key:'sort',name:'排序',value:[{n:'默认',v:''},{n:'热门',v:'hot'},{n:'最新',v:'new'}]}]]));
const playCache=new Map(),pending=new Set();
async function json(path,args={},fresh=false){let u=new URL(path,HOST);Object.entries(args).forEach(([k,v])=>u.searchParams.set(k,String(v)));if(fresh)u.searchParams.set('_t',String(Date.now()));try{return JSON.parse(await fetchData(u.href,{Referer:HOST+'/',Origin:HOST,...(fresh?{'Cache-Control':'no-cache'}:{})}))}catch(e){console.error('黄果请求失败',u.pathname,e.message);return {}}}
const payload=x=>x?.data??x,items=x=>{x=payload(x);return Array.isArray(x)?x:(x?.items||x?.list||x?.results||[])},meta=x=>{x=payload(x);return x?.pagination||x||{}};
function pic(o){let s=String(o.cover||o.vod_pic||o.pic||'');return s?aurl(s,HOST):''}
function remark(o){let n=o.episode_count||o.total_episodes;return n?(o.is_finished?'全':'更新至')+n+'集':(o.score?'评分'+o.score:'')}
function vod(o){return {vod_id:String(o.id||o.video_id||o.vod_id||''),vod_name:String(o.title||o.name||''),vod_pic:pic(o),vod_remarks:remark(o)}}
function pgRes(d,p){let a=items(d),m=meta(d),size=Number(m.size||m.page_size||24);return {page:p,pagecount:Number(m.pages||m.pagecount||(p+(a.length>=size?1:0))),limit:size,total:Number(m.total||a.length),list:a.map(vod)}}
async function videos(p,sort){return json('/api/videos',{page:p,page_size:24,sort:sort==='new'?'new':'hot'})}
async function search(q,p){return json('/api/search',{q,page:p})}
async function playUrl(vid,ep,fresh=false){let key=vid+'|'+ep,hit=playCache.get(key);if(!fresh&&hit&&Date.now()-hit.ts<300000)return hit.url;const result=await json('/api/videos/'+encodeURIComponent(vid)+'/play',{ep},fresh),d=payload(result),url=String(d?.video_url||d?.play_url||d?.url||result?.video_url||'');if(url)playCache.set(key,{url,ts:Date.now()});return url}
function warm(vid,ep){let n=Number(ep);if(!Number.isInteger(n))return;for(let i=n+1;i<=n+10;i++){let key=vid+'|'+i;if(pending.has(key)||playCache.has(key))continue;pending.add(key);(typeof setImmediate === 'function' ? setImmediate : (fn) => fn())(()=>playUrl(vid,String(i)).catch(()=>{}).finally(()=>pending.delete(key)))}}
export default function createSpider() {
  return {meta:{key:'py_huangguo_ai_local',name:'🍊黄果 - 短剧',type:3,searchable:1,quickSearch:1,filterable:1},api:async f=>{
mount(f,{init:async()=>({}),home:async()=>({class:CLASSES,filters,list:items(await videos(1,'hot')).map(vod)}),
category:async r=>{const p=page(r),id=ids(r)||'hot',sort=body(r).extend?.sort||body(r).filters?.sort||id;let d=id==='rank'?await json('/api/ranks/hot',{page:p}):['hot','new'].includes(id)?await videos(p,sort):await search(id,p);let list=items(d);if(!['hot','new','rank'].includes(id)){if(sort==='new')list.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));if(sort==='hot')list.sort((a,b)=>Number(b.hot||0)-Number(a.hot||0))}return pgRes({...d,data:Array.isArray(payload(d))?list:{...payload(d),items:list,list,results:list}},p)},
search:async r=>pgRes(await search(String(body(r).wd||body(r).keyword||''),page(r)),page(r)),
detail:async r=>{const id=ids(r).replace(/^hgai:/,'').split('|')[0],d=payload(await json('/api/videos/'+encodeURIComponent(id)));if(!d||typeof d!=='object'||!Object.keys(d).length)return {list:[]};let eps=Array.isArray(d.episodes)?d.episodes:[];if(!eps.length)eps=Array.from({length:Math.min(1000,Number(d.episode_count||d.total_episodes||1))},(_,i)=>({ep_num:i+1}));const play=eps.map((e,i)=>{let n=e.ep_num||e.episode||e.seq||i+1;return String(e.title||'第'+n+'集').replace(/[$#]/g,'_')+'$'+id+'|'+n});return {list:[{vod_id:id,vod_name:String(d.title||d.name||id),vod_pic:pic(d),vod_content:d.description||'',vod_actor:Array.isArray(d.actors)?d.actors.join('/'):String(d.actors||''),type_name:Array.isArray(d.tags)?d.tags.join('/'):String(d.tags||''),vod_play_from:'黄果AI本地',vod_play_url:play.join('#')}]}},
play:async r=>{const [vid,ep='1']=ids(r).replace(/^hgai:/,'').split('|');let url=await playUrl(vid,ep,true);warm(vid,ep);return url?{parse:0,url,header:{'User-Agent':UA,Referer:HOST+'/',Origin:HOST}}:{parse:1,url:HOST+'/video/'+encodeURIComponent(vid)+'/ep-'+ep+'/'} }
});

}};
}