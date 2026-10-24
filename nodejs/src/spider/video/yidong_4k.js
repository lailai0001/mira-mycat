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

const SITE='https://vidsite.cloudseekr.com',API=SITE+'/vidsite/vs/',SHARE='https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/',YD_KEY='PVGDwmcvfs1uV3d1';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',FP=crypto.randomBytes(16).toString('hex');
const classes=[['1','电影'],['2','电视剧'],['3','动漫']].map(([type_id,type_name])=>({type_id,type_name}));
const H={'User-Agent':UA,'Content-Type':'application/json; charset=utf-8',Origin:SITE,Referer:SITE+'/vid/app/',Accept:'application/json, text/plain, */*'};
const YH={'User-Agent':'okhttp/4.9.0','Content-Type':'application/json;charset=UTF-8',Referer:'https://yun.139.com/',Origin:'https://yun.139.com','hcy-cool-flag':'1','x-deviceinfo':'||3|12.27.0|chrome|131.0.0.0|1||windows 10|546X902|zh-CN|||','authorization':''};
async function site(path,body){return json(API+path,{body:JSON.stringify(body),headers:H})}
function encBody(payload){const iv=crypto.randomBytes(16);return Buffer.concat([iv,aes(JSON.stringify(payload),YD_KEY,'cbc',iv)]).toString('base64')}
async function yd(path,data){const out=await siteReq(SHARE+path,{body:encBody(data),headers:YH});try{return JSON.parse(out)}catch{const raw=unb64(out.trim());return JSON.parse(aes(raw.subarray(16).toString('base64'),YD_KEY,'cbc',raw.subarray(0,16),true).toString())}}
const cache=new Map();
async function outlink(id,dir='root'){const key=id+'|'+dir,hit=cache.get(key);if(hit&&hit.exp>Date.now())return hit.data;const j=await yd('getOutLinkInfoV6',{getOutLinkInfoReq:{account:'',linkID:id,passwd:'',caSrt:1,coSrt:1,srtDr:0,bNum:1,pCaID:dir,eNum:200}});const d=j.data||{},out={coLst:d.coLst||[],caLst:d.caLst||[]};cache.set(key,{data:out,exp:Date.now()+600000});return out}
async function walk(link,dir='root',depth=0,result=[]){if(depth>4)return result;const d=await outlink(link,dir);for(const it of d.coLst){if(it.coID)result.push(it)}for(const folder of d.caLst){if(folder.path)await walk(link,folder.path,depth+1,result)}return result}
async function page(b,col,word){const p=P(b),body={columnId:+col,cateIdList:[0,0,0],pageIndex:p,pageSize:12};if(word)body.searchKey=word;const d=(await site('qryPageColumnVideo',body)).data||{};return{page:p,pagecount:+d.pages||p,limit:12,total:+d.total||0,list:(d.list||[]).map(x=>({vod_id:String(x.id),vod_name:x.title||'',vod_pic:x.appCoverUrl||'',vod_remarks:x.remark||'',vod_year:String(x.releaseYear||'')}))}}
async function detail(b){const id=ID(b);await site('addAccessRecord',{videoId:+id,fprint:FP}).catch(()=>{});const d=(await site('qryVideoDetail',{videoId:+id,fprint:FP})).data||{};if(!d.title)return{list:[]};const vod={vod_id:id,vod_name:d.title,vod_pic:d.appCoverUrl||'',vod_content:d.remark||'',vod_year:String(d.releaseYear||''),vod_play_from:'移动云盘',vod_play_url:''};const url=String(d.resUrl||''),link=(url.match(/(?:\/w\/i\/|[?&]linkID=|\/m\/i\?)([A-Za-z0-9]+)/)||[])[1];if(link){const eps=[];for(const file of await walk(link)){const size=Number(file.coSize||0),label=String(file.coName||'视频')+`[${(size/1048576).toFixed(1)}MB]`,info=[link,file.path||'',file.coID,label].join('|');eps.push(label.replace(/[$#]/g,'_')+'$'+info)}vod.vod_play_url=eps.join('#')}return{list:[vod]}}
async function play(b){const raw=ID(b),[link,path,coid]=raw.split('|');if(!link||!coid)return{parse:0,url:'',error:'no share file id'};const d=(await yd('getContentInfoFromOutLink',{getContentInfoFromOutLinkReq:{contentId:coid,linkID:link,account:''},commonAccountInfo:{account:'',accountType:1}})).data||{};const present=d.contentInfo?.presentURL||'';if(!present)return{parse:0,url:'',error:'139 云盘未返回播放清单'};const txt=await siteReq(present,{headers:{'User-Agent':UA,Referer:'https://yun.139.com/'}});const lines=txt.split(/\r?\n/).filter(x=>x.includes('index.m3u8')&&!x.startsWith('#'));const pick=['2160','1080','720','480'].map(q=>lines.find(x=>x.includes(q+'/index.m3u8'))).find(Boolean)||lines[0];const url=pick?new URL(pick.trim(),present).href:present;return{parse:0,url,header:{'User-Agent':UA,Referer:'https://yun.139.com/'}}}
export default function createSpider() {
  const s = modulePlugin({key:'yidong_4k',name:'移动4K',filterable:0},{init:async()=>({}),home:async()=>({class:classes,filters:{},list:(await page({page:1},1)).list}),category:b=>page(b,ID(b)||1),search:b=>page(b,0,String(b.wd||b.keyword||'')),detail,play});
  s.meta.key = 'py_yidong_4k';
  s.meta.name = '♨️移动 - 4K';
  return s;
}
