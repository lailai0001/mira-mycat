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

const SITE='https://123-1349250429.cos.ap-shanghai.myqcloud.com/app.txt',FALLBACK='https://juziapp.hzhcbkj.cn';
const PUB='MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCr8SzZhjYy+rsya1K09t8d2K50pWFoBkgUqMpKOiW+3IEVKd4eTdvg9RSOjQ82kypL6R9BnsmrS1V8s4PVDwjQbUtYhTPPC9Hz16qY7rpD6m0d2vr09/UpWQ5uOy9PR0QTrsioveZ+DIe9jc3C+zBCu/kZSY/R8stwJoiitki3gwIDAQAB';
const SAFE='OC1A06E197EF10CF3F6058CA7A803B5E',NATIVE='ed5fdsgucxumegqa',PW='11GK2we32144LO&hilUITB)FMd1khdaF',UA='okhttp/3.12.1',PKG='com.mxj.wylcjbxyx',VC='3024',VNAME='3.0.2.4',APP='%E6%A9%98%E6%B1%81';
const seal='090DA8F91D3F60CC6CB250D86F06FE12'+'######'+'3DADB42485B7F864E766479ADA6B1176D81D8D73'+'~~~~~~'+PKG+'>>>+++'+VC;
const e=aes(seal,PW).toString('base64'),e2=b64(e),SAFECODE=(e2.slice(0,16)+e2.slice(-16)).toUpperCase();
let active='',session=null,promise=null,categoriesCache=null;
const random=n=>rand(n).replace(/[^a-z0-9]/gi,'a');
async function host(){if(active)return active;try{active=String((await json(SITE)).domain||FALLBACK).replace(/^http:/,'https:').replace(/\/$/,'')}catch{active=FALLBACK}return active}
async function post(path,body,headers={},binary=false){return siteReq((await host())+path,{body,headers:{'User-Agent':UA,...headers},binary})}
async function initSession(){const udid=crypto.createHash('md5').update(String(Date.now())+Math.random()).digest('hex').slice(0,16).toUpperCase();const payload={username:'tv_'+udid.slice(0,10).toLowerCase(),password:crypto.createHash('md5').update('tv'+udid).digest('hex'),udid};let token='';try{await post('/api/ex/v3/user/register',JSON.stringify(payload),{'Content-Type':'application/json'});}catch{}try{let d=JSON.parse(await post('/api/ex/v3/user/login',JSON.stringify(payload),{'Content-Type':'application/json'}));token=d.data?.token||d.data?.user?.token||''}catch{}
 const ts=Date.now(),rnd=random(16),sign=rsa(String(ts)+rnd,PUB),body=pb([1,ts],[2,sign],[3,rnd],[4,rnd],[5,rnd]);const p={plat:'android',vOs:'16',_vOsCode:'36',vApp:VC,vName:VNAME,pkg:PKG,appName:APP,udid,uuid:udid,chid:'10000',androidID:udid,net:'1',young:0,tenantId:'*',v:1,device:0,lang:'zh',country:'CN',cpu:'arm64-v8a'};
 const raw=await post('/api/v5/find/app/zone',body,{'Content-Type':'application/x-protobuf',Accept:'application/x-protobuf','Cache-Control':'no-cache',publicParams:JSON.stringify(p)},true),f=safePb(pf(safePb(raw),3)),pub=[2,3,4,5].map(n=>ps(f,n)).join('');if(!pub)throw Error('zone missing RSA key');session={udid,token,pub,expires:Date.now()+850000};return session}
async function ensure(){if(session?.expires>Date.now())return session;if(!promise)promise=initSession().finally(()=>promise=null);return promise}
function hdr(s,proto=true){const ts=Date.now(),r=random(16),sig=rsa(String(ts)+r+VC,s.pub),a=aes(String(ts)+r,SAFE).toString('base64');const d={country:'CN',vName:VNAME,cpuId:'',young:0,facturer:'OnePlus',pkg:PKG,uuid:s.udid,resolution:'1080x2256',mac:'02%3A00%3A00%3A00%3A00%3A00',sig,abid:'7470',model:'PJX110',plat:'android',udid:s.udid,dpi:'480',net:'1',lang:'zh',random_str:r,brand:'OnePlus',timestamp:ts,density:'3.0',appName:APP,cpu:'arm64-v8a',chid:'10000',carrier:'%E8%81%94%E9%80%9A',sig2:a.slice(0,8),v:1,sig3:a.slice(8),tenantId:'*',_vOsCode:'36',vOs:'16',vApp:VC,device:0,androidID:s.udid};
 const h={'User-Agent':UA,'Cache-Control':'no-cache',publicParams:JSON.stringify({paramsData:aes(JSON.stringify(d),NATIVE,'cbc',NATIVE).toString('hex')}),Accept:proto?'application/x-protobuf':'application/json'};if(proto)h['Content-Type']='application/x-protobuf';if(s.token)h.token=s.token;return h}
function secure(kv){const ts=Date.now(),r=random(8),raw=aes(String(kv)+ts,SAFECODE).toString('base64');return pb([1,r+raw.slice(0,12)],[2,raw.slice(12)],[3,random(20)],[4,ts],[5,r])}
async function proto(path,kv,retry=true){const s=await ensure();try{const raw=await post(path,secure(kv),hdr(s),true),f=safePb(raw),code=pi(f,1);if(code!==200&&retry){session=null;return proto(path,kv,false)}return{code,msg:ps(f,2),data:pf(f,3)}}catch(e){if(retry){session=null;return proto(path,kv,false)}throw e}}
function items(data){return safePb(data).filter(x=>x[0]===1&&x[1]===2).map(x=>{const f=safePb(x[2]),cover=safePb(pf(f,2));return{vod_id:String(pi(f,3)),vod_name:ps(f,5),vod_pic:ps(cover,2)||ps(cover,1),vod_remarks:ps(f,13)}}).filter(x=>x.vod_name)}
function score(n){n=n.toLowerCase();const i=['自建4k-3','自建4k-2','jd4k'].findIndex(x=>n.includes(x));return i>=0?1000-i:n.includes('4k')?900:n.includes('蓝光')?700:100}
async function cats(){if(categoriesCache)return categoriesCache;try{const d=await json((await host())+'/api/v3/drama/getCategory?orderBy=type_id',{headers:{'User-Agent':UA,Accept:'application/json'}});categoriesCache=(d.data||[]).filter(x=>x.name&&String(x.id)!=='29').map(x=>({type_id:String(x.id),type_name:x.name}))}catch{}return categoriesCache?.length?categoriesCache:[['21','电影'],['22','剧集'],['25','动漫'],['26','综艺'],['27','短剧'],['28','漫剧']].map(([type_id,type_name])=>({type_id,type_name}))}
async function category(b){const p=P(b),r=await proto('/api/proto/v5/drama/category',`typeId1=${ID(b)||'21'}&page=${p}&pagesize=24`);return RES(items(r.data),p,24)}
async function search(b){const p=P(b),r=await proto('/api/proto/v5/drama/search',`searchKeys=${b.wd||b.keyword||''}&page=${p}&pagesize=24`);return RES(items(r.data),p,24)}
async function detail(b){const vid=ID(b),r=await proto('/api/proto/v5/drama/getDetail','id='+vid),f=safePb(r.data),lines={};
 // 原版专门按二进制 tag EA 01 扫描，避免上游不规则嵌套字段。
 for(let i=0;i<r.data.length-3;i++){if(r.data[i]!==0xea||r.data[i+1]!==0x01)continue;let len,pos;try{[len,pos]=readv(r.data,i+2)}catch{continue}if(len<1||pos+len>r.data.length)continue;const e=safePb(r.data.subarray(pos,pos+len));i=pos+len-1;let path=ps(e,4),title=ps(e,2)||ps(e,3)||'正片',src=ps(e,9),line=ps(e,10)||src||'正片';if(!path)continue;title=title.replace(/^第?0*(\d{1,4})[集话期](?:完结)?$/,'$1');const pid=isMedia(path)?path:b64(JSON.stringify({vodPlayFrom:src,playUrl:path}));(lines[line]??=[]).push(title.replace(/[$#]/g,' ')+'$'+pid)}const order=Object.keys(lines).sort((a,b)=>score(b)-score(a));return{list:[{vod_id:vid,vod_name:ps(f,9),vod_pic:'',vod_remarks:ps(f,26)||ps(f,13),vod_area:ps(f,1),vod_actor:ps(f,25),vod_content:ps(f,6),vod_play_from:order.join('$$$'),vod_play_url:order.map(x=>lines[x].join('#')).join('$$$')}]}}
async function play(b){const raw=ID(b);if(isMedia(raw)||/^https?:/.test(raw))return{parse:0,url:raw,header:headUA};let d;try{d=JSON.parse(unb64(raw).toString())}catch{return{parse:0,url:''}}const r=await proto('/api/proto/v5/videoUsableUrl',`vodPlayFrom=${d.vodPlayFrom||''}&playUrl=${d.playUrl||''}`),url=ps(safePb(r.data),1);return{parse:isMedia(url)?0:1,url,header:headUA}}
export default function createSpider() {
  const s = modulePlugin({key:'juzi_4k',name:'橘汁2',filterable:1},{init:async()=>({}),home:async()=>{const c=await cats();return{class:c,filters:{},list:(await category({id:c[0].type_id,page:1})).list}},category,search,detail,play});
  s.meta.key = 'py_juzi_4k';
  s.meta.name = '橘汁2';
  return s;
}
