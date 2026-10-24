'use strict';
import req from '../../util/req.js';
import crypto from 'crypto';
const HOST='https://www.jiabaide.cn';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.61 Safari/537.36';
const cache=new Map();
function cached(k,ttl){const v=cache.get(k);return v&&Date.now()-v.at<ttl?v.value:null;}
function setcache(k,v){if(cache.size>120)cache.delete(cache.keys().next().value);cache.set(k,{at:Date.now(),value:v});return v;}
function qs(p){return Object.entries(p).map(([k,v])=>k+'='+encodeURIComponent(String(v??''))).join('&');}
function signHeaders(p={}){const t=String(Date.now());const signing={...p,key:'cb808529bae6b6be45ecfab29a4889bc',t};const raw=Object.entries(signing).map(([k,v])=>k+'='+String(v??'')).join('&');const md5=crypto.createHash('md5').update(raw).digest('hex');return {'User-Agent':UA,Accept:'application/json, text/plain, */*',sign:crypto.createHash('sha1').update(md5).digest('hex'),t,deviceid:crypto.randomUUID()};}
// 站点会 307 到 /GE/CC/VALIDATOR 再回来：实测验证器绑定同连接——同 socket
// 跟随整条链才通（分连接重访验证器会被 CC 策略 403）。因此这里只发一次 req.get
// 交给传输层自动跟随；仓内 req.js 是 keepAlive 的 axios 实例，同站重定向复用连接，
// 与 curl -L 行为一致。不要改成手动分跳（手动分跳在任何传输层都可能换连接而 403）。
async function get(path, p = {}) {
  const url = HOST + path + (Object.keys(p).length ? '?' + qs(p) : '');
  try {
    const r = await req.get(url, { headers: signHeaders(p), timeout: 12000, responseType: 'text', validateStatus: () => true });
    if (r.status >= 400) return null;
    const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    return txt ? JSON.parse(txt) : null;
  } catch (e) { return null; }
}
function vod(v){if(!v||typeof v!=='object')return null;let o={};for(const [k,val] of Object.entries(v)){let key=k.toLowerCase();if(key.startsWith('vod')&&key.length>3)key='vod_'+key.slice(3);if(key.startsWith('type')&&key.length>4)key='type_'+key.slice(4);o[key]=val;}o.vod_id=String(o.vod_id??v.id??'');o.vod_name=String(o.vod_name??v.name??'');o.vod_pic=String(o.vod_pic??v.cover??'');o.vod_remarks=String(o.vod_remarks??'');return o.vod_id&&o.vod_name?o:null;}
function vods(a){return (Array.isArray(a)?a:[]).map(vod).filter(Boolean);}
function page(data,p,size){const a=Array.isArray(data?.list)?data.list:[];const total=Number(data?.total??data?.totalCount??data?.count??0);const pages=Number(data?.pages??data?.pageCount??data?.pagecount??(total?Math.ceil(total/size):p+(a.length>=size?1:0)));return {page:p,pagecount:Math.max(1,pages),limit:size,total:total||0,list:vods(a)};}
const opt=(arr,key='itemText',valueKey='itemValue')=>(Array.isArray(arr)?arr:[]).map(x=>({n:String(x[key]??''),v:String(x[valueKey]??'')}));
async function home(){const hit=cached('home',180000);if(hit)return hit;let [c,f,h,s]=await Promise.all([get('/api/mw-movie/anonymous/get/filer/type'),get('/api/mw-movie/anonymous/v1/get/filer/list'),get('/api/mw-movie/anonymous/v1/home/all/list'),get('/api/mw-movie/anonymous/home/hotSearch')]);if(!Array.isArray(c?.data))c=await get('/api/mw-movie/anonymous/get/filer/type');const classes=(Array.isArray(c?.data)?c.data:[]).map(x=>({type_id:String(x.typeId),type_name:String(x.typeName)}));const filters={};for(const [tid,d] of Object.entries(f?.data||{})){const sort=[{n:'最近更新',v:'2'},{n:'人气高低',v:'3'},{n:'评分高低',v:'4'}];filters[tid]=[{key:'type',name:'类型',value:opt(d.typeList)},...(d.plotList?.length?[{key:'v_class',name:'剧情',value:opt(d.plotList,'itemText','itemText')}]:[]),{key:'area',name:'地区',value:opt(d.districtList,'itemText','itemText')},{key:'year',name:'年份',value:opt(d.yearList,'itemText','itemText')},{key:'lang',name:'语言',value:opt(d.languageList,'itemText','itemText')},{key:'sort',name:'排序',value:tid==='1'?sort.slice(1):sort}];}
let items=[];for(const v of Object.values(h?.data||{}))if(Array.isArray(v?.list))items.push(...v.list);if(Array.isArray(s?.data))items.push(...s.data);let seen=new Set();const list=vods(items).filter(x=>!seen.has(x.vod_id)&&seen.add(x.vod_id)).slice(0,60);return setcache('home',{class:classes,filters,list});}
const safe=s=>String(s??'').replace(/[#$]/g,' ').trim();
const __spider={meta:{key:'py_wencaiyingshi',name:'📖文才 - 极速',type:3,searchable:1,quickSearch:1,filterable:1},api:async fastify=>{
fastify.post('/init',async()=>({}));
fastify.post('/home',async()=>home());
fastify.post('/category',async request=>{const b=request.body||{},p=Math.max(1,Number(b.page)||1),x={...(b.filters||{}),...(b.extend||{})};const q={area:x.area||'',filterStatus:'1',lang:x.lang||'',pageNum:p,pageSize:'30',sort:x.sort||'1',sortBy:'1',type:x.type||'',type1:String(b.id||''),v_class:x.v_class||'',year:x.year||''};return page((await get('/api/mw-movie/anonymous/video/list',q))?.data,p,30);});
fastify.post('/search',async request=>{const b=request.body||{},p=Math.max(1,Number(b.page)||1),z=(await get('/api/mw-movie/anonymous/video/searchByWord',{keyword:b.wd||'',pageNum:p,pageSize:'8',sourceCode:'1'}))?.data?.result;return page(z,p,8);});
fastify.post('/detail',async request=>{const b=request.body||{},id=String(Array.isArray(b.id)?b.id[0]:(b.id??(Array.isArray(b.ids)?b.ids[0]:b.ids))??'');const data=(await get('/api/mw-movie/anonymous/video/detail',{id}))?.data;if(!data)return {list:[]};const v=vod(data);if(!v)return {list:[]};const epList=Array.isArray(data.episodeList)?data.episodeList:(Array.isArray(data.episodelist)?data.episodelist:[]);let eps=epList.map(x=>safe(epList.length>1?x.name:v.vod_name)+'$'+id+'@@'+String(x.nid??x.nId??x.id??'')).filter(x=>!x.endsWith('@@'));v.vod_play_from=eps.length?'文才影视':'';v.vod_play_url=eps.join('#');delete v.episodelist;return {list:[v]};});
fastify.post('/play',async request=>{const b=request.body||{},[id,nid]=String(b.id||'').split('@@');if(!id||!nid)return {parse:1,url:''};const data=(await get('/api/mw-movie/anonymous/v2/video/episode/url',{clientType:'1',id,nid}))?.data;const options=(Array.isArray(data?.list)?data.list:[]).filter(x=>/^https?:\/\//i.test(x.url||''));if(!options.length)return {parse:1,url:''};const pref=options.find(x=>/4k|1080|高清|蓝光/i.test(x.resolutionName||''))||options[0];return {parse:0,url:pref.url,header:{'User-Agent':UA,Origin:HOST,Referer:HOST+'/'}};});
}};

export default function createSpider() { return __spider; }
