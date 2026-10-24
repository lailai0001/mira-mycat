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

const TXT='https://dyttandroid04-1372779881.cos.ap-shanghai.myqcloud.com/app_dyttandroid.txt',FALLBACK='http://122.228.193.211:18008';
const PUB='MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCduNEnfxGaLuQRk5ABzXHhPV43zi00sCHjLo8BYc+Wi6xXm2b4v0i28Sq4WlNCKhseft9fz8kO/qLr6/022o1RcuOU7e4GFL3U9WnNODwRBYSYWd+K8nqpI/tAUDmZEBGRWqjrc7x6aMl3A+xpnWkLbPCLsuhbuuUE3tv09oeOpwIDAQAB';
const KEY='D2KREWRIBVNAUJJYEDL4VFHOY2Q0PQ==',IV='OC1A06E197EF10CF3F6058CA7A803B5E',FIXED='ed5fdsgucxumegqa',UA='okhttp/3.12.1';
let active='',hostExp=0,classes=[];
const rstr=n=>crypto.randomBytes(n*2).toString('base64').replace(/[^A-Za-z0-9]/g,'').slice(0,n-1)+'=';
function headers(proto=true){const uid=rand(32).toUpperCase(),ts=Date.now(),r=rstr(16),vapp='3007';
 const d={country:'CN',vName:'3.0.0.7',cpuId:'MT6893Z%2FCZA',young:0,facturer:'Xiaomi',pkg:'com.dytiantang.one',uuid:uid,resolution:'1080x2272',mac:'02%3A00%3A00%3A00%3A00%3A00',abid:'397',model:'M2104K10AC',plat:'android',udid:uid,dpi:'440',net:'1',lang:'zh',brand:'Xiaomi',density:'2.75',appName:'电影天堂',cpu:'arm64-v8a',chid:'10000',carrier:'%E8%81%94%E9%80%9A',_vOsCode:33,vOs:'13',v:1,tenantId:'',vApp:vapp,device:0,androidID:'a1b2c3d4e5f60718'};
 // 注意 Python 源 VERSION.replace('.', '') 为 3007，不是 30007
 d.sig=rsa(String(ts)+r+vapp,PUB);d.random_str=r;d.timestamp=ts;
 const a=aes(String(ts)+r,IV).toString('base64');d.sig2=a.slice(0,8);d.sig3=a.slice(8);
 return {'User-Agent':UA,Accept:proto?'application/x-protobuf':'application/json','Content-Type':proto?'application/x-protobuf':'application/json; charset=utf-8',publicParams:JSON.stringify({paramsData:aes(JSON.stringify(d),FIXED,'cbc',FIXED).toString('hex')})};
}
function body(kv){const ts=Date.now(),r=rstr(8),r20=rstr(20),s=Object.entries(kv).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>k+'='+v).join('&'),payload=r+aes(s+ts,KEY).toString('base64');return pb([1,payload.slice(0,20)],[2,payload.slice(20)],[3,r20],[4,ts],[5,r])}
async function host(){if(active&&hostExp>Date.now())return active;try{const v=await json(TXT);active=String(v.domain||FALLBACK)}catch{active=FALLBACK}hostExp=Date.now()+1800000;return active}
async function proto(path,kv){const h=await host(),raw=await siteReq(h+path,{body:body(kv),binary:true,headers:headers(true)});const f=parsepb(raw);return {code:pi(f,1),message:ps(f,2),data:pf(f,3)}}
async function categories(){try{const d=await json((await host())+'/api/v3/drama/getCategory?orderBy=type_id',{headers:headers(false)});classes=(d.data||[]).filter(x=>x.name&&x.name!=='公告').map(x=>({type_id:String(x.id),type_name:x.name}));}catch(e){console.warn('[天天4K] category',e.message)}return classes.length?classes:[{type_id:'1',type_name:'电影'}]}
function entries(data){return safePb(data).filter(x=>x[0]===1&&x[1]===2).map(x=>{let f=safePb(x[2]),cov=pf(f,2),cf=safePb(cov);return{vod_id:String(pi(f,3)),vod_name:ps(f,5),vod_pic:ps(cf,2)||ps(cf,1),vod_remarks:ps(f,13)}}).filter(x=>x.vod_name)}
const scores=n=>{let s=String(n).toLowerCase();let p=['高清蓝光4k','自建4k-3','自建4k-2','jd4k'].findIndex(x=>s.includes(x));return p>=0?1000-p:s.includes('4k')?900:s.includes('2160')?800:s.includes('蓝光')?700:100};
async function category(b){const page=P(b),e=b.extend||b.filters||{},r=await proto('/api/proto/v5/drama/category',{pagesize:'21',typeId1:ID(b)||'1',page:String(page),vodOrderBy:e.extend_sort||e.sort||'最新',vodArea:e.area||'',vodLang:e.lang||'',vodClass:e.class||'',vodYear:e.year||''});return RES(entries(r.data),page,21)}
async function search(b){const page=P(b),r=await proto('/api/proto/v5/drama/search',{searchKeys:b.wd||b.keyword||'',page:String(page),pagesize:'21'});return RES(entries(r.data),page,21)}
async function detail(b){const vid=ID(b),r=await proto('/api/proto/v5/drama/getDetail',{id:vid}),f=safePb(r.data),lines={};for(const x of f.filter(x=>x[0]===29&&x[1]===2)){const e=safePb(x[2]),name=ps(e,10)||'默认',title=ps(e,2)||'播放',path=ps(e,4),src=ps(e,9);if(!path)continue;const play=isMedia(path)?path:b64(JSON.stringify({vodPlayFrom:src,playUrl:path}));(lines[name]??=[]).push(title.replace(/[$#]/g,' ')+'$'+play)}const order=Object.keys(lines).sort((a,b)=>scores(b)-scores(a));return{list:[{vod_id:vid,vod_name:ps(f,9),vod_pic:'',vod_year:String(pi(f,18)||''),vod_area:ps(f,1),vod_remarks:ps(f,26),vod_actor:ps(f,25),vod_content:ps(f,6),vod_play_from:order.join('$$$'),vod_play_url:order.map(x=>lines[x].join('#')).join('$$$')}]}}
async function play(b){const id=ID(b);if(isMedia(id)||/^https?:/.test(id))return{parse:0,url:id,header:headUA};let obj;try{obj=JSON.parse(unb64(id).toString())}catch{return{parse:0,url:''}}const r=await proto('/api/proto/v5/videoUsableUrl',{vodPlayFrom:obj.vodPlayFrom||'',playUrl:obj.playUrl||''}),f=safePb(r.data),url=ps(f,1),h={...headUA};for(const x of f){if(x[1]!==2||[1,7,8,9].includes(x[0]))continue;const sub=safePb(x[2]),k=ps(sub,1);if(k)h[k]=ps(sub,2)}return{parse:isMedia(url)?0:1,url,header:h}}
export default function createSpider() {
  const s = modulePlugin({key:'tiantian_4k',name:'天天4K',filterable:1},{init:async()=>({}),home:async()=>({class:await categories(),filters:{},list:(await category({id:(await categories())[0].type_id,page:1})).list}),category,search,detail,play});
  s.meta.key = 'py_tiantian_4k';
  s.meta.name = '☀️天天 - 4K';
  return s;
}
