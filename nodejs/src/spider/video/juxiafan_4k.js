import req from '../../util/req.js';
import crypto from 'crypto';
"use strict";
// 滴源本地 Node 插件；仅依赖 Node 标准库，GitHub 负责静态托管。
const buf=x=>Buffer.isBuffer(x)?x:Buffer.from(String(x??''),'utf8');
const rand=n=>crypto.randomBytes(Math.ceil(n)).toString('hex').slice(0,n);
const b64=x=>buf(x).toString('base64');
const unb64=x=>Buffer.from(String(x||''),'base64');
const aes=(data,key,mode='ecb',iv=null,decode=false,encoding='base64')=>{const k=buf(key);const c=decode?crypto.createDecipheriv(`aes-${k.length*8}-${mode}`,k,mode==='ecb'?null:buf(iv)):crypto.createCipheriv(`aes-${k.length*8}-${mode}`,k,mode==='ecb'?null:buf(iv));return Buffer.concat([c.update(decode?Buffer.from(String(data),encoding):buf(data)),c.final()]);};
function rsa(s,key){let pk=String(key).includes('BEGIN')?String(key):'-----BEGIN PUBLIC KEY-----\n'+String(key).match(/.{1,64}/g).join('\n')+'\n-----END PUBLIC KEY-----';return crypto.publicEncrypt({key:pk,padding:crypto.constants.RSA_PKCS1_PADDING},buf(s)).toString('base64')}
async function siteReq(url, { body = null, method, headers = {}, timeout = 18000, binary = false } = {}) {
  const data = body == null ? undefined : body;
  const h = Object.assign({ 'User-Agent': 'okhttp/3.12.1' }, headers);
  try {
    const r = await req({ method: method || (data ? 'POST' : 'GET'), url, headers: h, data, timeout, responseType: binary ? 'arraybuffer' : 'text', maxRedirects: 5 });
    if (binary) return Buffer.from(r.data || []);
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + new URL(url).host);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method: method || (data ? 'POST' : 'GET'), headers: h, body: data, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + new URL(url).host);
        return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
const json=async(url,opt)=>JSON.parse(await siteReq(url,opt));
function varint(n){let b=BigInt(n),a=[];while(b>=128n){a.push(Number((b&127n)|128n));b>>=7n}a.push(Number(b));return Buffer.from(a)}
function pbfield(f,v){if(typeof v==='number'||typeof v==='bigint')return Buffer.concat([varint(f*8),varint(v)]);const d=buf(v);return Buffer.concat([varint(f*8+2),varint(d.length),d])}
const pb=(...arr)=>Buffer.concat(arr.map(([f,v])=>pbfield(f,v)));
function readv(data,pos){let n=0n,s=0n,i=pos;while(i<data.length){let a=data[i++];n|=BigInt(a&127)<<s;if(!(a&128))return [Number(n),i];s+=7n;if(s>70n)throw Error('pb varint too long')}throw Error('truncated varint')}
function parsepb(data){data=buf(data);const o=[];let i=0;while(i<data.length){let [tag,p]=readv(data,i);i=p;const f=tag>>3,w=tag&7;if(w===0){let [v,k]=readv(data,i);o.push([f,w,v]);i=k}else if(w===2){let [n,k]=readv(data,i);if(n<0||k+n>data.length)throw Error('pb length');o.push([f,w,data.subarray(k,k+n)]);i=k+n}else if(w===1||w===5){let n=w===1?8:4;o.push([f,w,data.subarray(i,i+n)]);i+=n}else throw Error('pb wire '+w)}return o}
function pf(p,n,w=2){return(p||[]).find(x=>x[0]===n&&x[1]===w)?.[2]??(w===2?Buffer.alloc(0):0)}
const ps=(p,n)=>buf(pf(p,n)).toString('utf8'), pi=(p,n)=>Number(pf(p,n,0)||0);
const safePb=d=>{try{return parsepb(d)}catch{return []}};
const P=(b,n)=>Math.max(1,Number(b?.[n]||b?.page||b?.pg||1)||1);
const ID=b=>String(Array.isArray(b?.id)?b.id[0]:b?.id||b?.ids||b?.vod_id||'');
const RES=(items,page=1,limit=20)=>({list:items,page,pagecount:page+(items.length>=limit?1:0),limit,total:items.length>=limit?99999:items.length});
function modulePlugin(meta,fn){return {meta:{...meta,type:3,searchable:1,quickSearch:1},api:async f=>{for(const k of ['init','home','category','search','detail','play'])f.post('/'+k,async r=>{try{return await fn[k](r.body||{})}catch(e){console.error('['+meta.name+']['+k+']',e.message);if(k==='play')return {parse:0,url:'',error:e.message};if(k==='home')return {class:[],list:[],error:e.message};if(k==='detail')return {list:[],error:e.message};return {list:[],page:P(r.body||{}),error:e.message}}})}}}
const enc=s=>encodeURIComponent(String(s));
const isMedia=u=>/\.(m3u8|mp4|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(\?|$)/i.test(String(u));
const headUA={'User-Agent':'okhttp/3.12.1'};

const HOSTS=['http://manian.juxiafan.com','http://195.225.24.128:6213','http://jugaoqing.com','http://jumianfei.com','http://juyongjiu.com','http://kuailezhuiju2.com','http://zhuiju666.com','http://194.147.100.155:7744'];
const KEY='kZ6fT8oF6oM8eX6lF7eH2rJ3pW7gW0kC',UA='okhttp/4.12.0';let best=HOSTS[0];
const sign=s=>aes(s,KEY).toString('base64');
async function post(path,body='',type){let err;for(const host of [best,...HOSTS.filter(x=>x!==best)]){try{const t=await siteReq(host+path,{method:'POST',body:body===null?Buffer.alloc(0):body,headers:{'User-Agent':UA,'Content-Type':type||'application/json;charset=UTF-8'}});if(t.includes('"code"')){best=host;return JSON.parse(t)}}catch(e){err=e}}throw err||Error('all hosts failed: '+path)}
const encform=o=>Object.keys(o).sort().map(k=>enc(k)+'='+new URLSearchParams({[k]:String(o[k])}).toString().split('=')[1]).join('&');
async function postForm(path,data){const a={...data,timestamp:String(Math.floor(Date.now()/1000))};const concat=encform(a);return post(path,concat+'&datasign='+enc(sign(concat)),'application/x-www-form-urlencoded')}
async function postJson(path,data){const a={...data,timestamp:String(Math.floor(Date.now()/1000))};const concat=Object.keys(a).sort().map(k=>k+'='+String(a[k])).join('&');return post(path,JSON.stringify({...a,datasign:sign(concat)}),'application/json;charset=UTF-8')}
async function get(u){try{return JSON.parse(await siteReq(u,{headers:{'User-Agent':UA}}))}catch{return {}}}
const convert=x=>({vod_id:String(x.id),vod_name:x.name||'',vod_pic:x.videoPic||'',vod_remarks:x.remarks||''});
function result(d,page){const data=d.data||{},list=(data.list||[]).filter(x=>x.id).map(convert);return{list,page,pagecount:Math.max(page,Number(data.totalPage||1)),limit:Number(data.limit||20),total:Number(data.totalCount||list.length)}}
async function home(){const d=await post('/api/v1/video/classifies',null);const cls=(d.data||[]).filter(x=>x.id&&x.name).map(x=>({type_id:String(x.id),type_name:x.name})).sort((a,b)=>+a.type_id-+b.type_id);if(!cls.find(x=>x.type_id==='22023'))cls.push({type_id:'22023',type_name:'直播'});return{class:cls,filters:{},list:(await category({id:'22016',page:1})).list}}
async function category(b){const page=P(b),tid=Number(ID(b)||'22016');if(tid===22023){const d=await get(best+'/api/v1/video/liveVideo');const list=(d.data?.list||[]).filter(x=>x.id).map(convert);return {list,page:1,pagecount:1,total:list.length,limit:list.length}}
 let r=result(await postJson('/api/v1/video/index',{pageNum:page,typeId:tid}),page);if(r.list.length<10)r=result(await postJson('/api/v1/video/search',{keyword:'',typeId:tid,pageNum:page}),page);return r}
async function search(b){let wd=String(b.wd||b.keyword||'').trim();try{if(wd.includes('%'))wd=decodeURIComponent(wd)}catch{}if(!wd)return RES([],P(b));const r=result(await postJson('/api/v1/video/search',{keyword:wd,pageNum:P(b)}),P(b));r.list.sort((a,b)=>Number(b.vod_id)-Number(a.vod_id));return r}
const fetchDetail=async id=>(await postForm('/api/v1/video/videoDetails',{id})).data||{};
async function detail(b){const vid=ID(b),d=await fetchDetail(vid);if(!d.id)return {list:[]};const names=[],plays=[];for(const src of d.playerSource||[]){const eps=(src.episodes||[]).map((ep,i)=>String(ep.episodeName||`第${i+1}集`).replace(/[$#]/g,'_')+'$'+vid+'_'+(i+1));if(!eps.length)continue;names.push(src.sourceName||'剧下饭');plays.push(eps.join('#'))}return{list:[{vod_id:String(d.id),vod_name:d.name||'',vod_pic:d.videoPic||'',vod_actor:d.actor||'',vod_director:d.director||'',vod_remarks:d.remarks||'',vod_content:d.content||'',vod_year:d.year||'',vod_area:d.area||'',vod_play_from:names.join('$$$'),vod_play_url:plays.join('$$$')}]}}
async function play(b){const id=ID(b),flag=String(b.flag||'');const match=id.match(/^(.*?)_(\d+)$/);if(!match)return{parse:0,url:id,header:{'User-Agent':UA}};const vid=match[1],ep=+match[2],d=await fetchDetail(vid);const sources=[...(d.playerSource||[])].sort((a,b)=>Number((b.sourceName||'')===flag)-Number((a.sourceName||'')===flag));for(const src of sources){const info=(src.episodes||[])[ep-1];if(!info)continue;const pc=info.playerCode||'';if(!pc)continue;let url='';if(src.parseUrl){const x=await get(src.parseUrl+pc);url=x.url||''}if(!url&&!/^https?:/.test(pc)){const x=await postForm('/api/v1/player/analysisUrl',{from:src.sourceCode||'',code:pc});url=x.data||''}if(!url)url=pc;if(url)return{parse:isMedia(url)?0:/^https?:/.test(url)?0:1,url,header:{'User-Agent':UA,...(src.sourceCode==='huya'?{Referer:'https://www.huya.com/'}:{})}}}return{parse:0,url:'',error:'no playable source'}}
export default function createSpider() {
  const s = modulePlugin({key:'juxiafan_4k',name:'剧下饭4K',filterable:0},{init:async()=>({}),home,category,search,detail,play});
  s.meta.key = 'py_juxiafan_4k';
  s.meta.name = '🍚剧饭 - 4K';
  return s;
}
