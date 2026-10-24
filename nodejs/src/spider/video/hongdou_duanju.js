import req from '../../util/req.js';
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


'use strict';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';
async function siteReq(url, opts = {}) { return reqTextAx(url, opts); }
async function json(u,opt){try{return JSON.parse(await siteReq(u,opt))}catch{return {}}}
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const m=(s,r)=>((String(s||'').match(r)||[])[1]||'');
const abs=(base,u)=>{try{return new URL(u,base).href}catch{return ''}};
const pg=b=>Math.max(1,parseInt(b?.page||b?.pg||1,10)||1);
const id=b=>String(Array.isArray(b?.id)?b.id[0]:(b?.id||b?.ids||''));
const list=(data,page=1,size=20)=>({list:data,page,pagecount:page+(data.length>=size?1:0),limit:size,total:data.length>=size?9999:data.length});
function plugin(key,name,classes,impl,filterable=0){return {meta:{key,name,type:3,searchable:1,quickSearch:1,filterable},api:async f=>{f.post('/init',async()=>({}));f.post('/home',async r=>({class:classes,filters:filterable?(impl.filters||{}):{},list:await impl.home(r.body||{})}));f.post('/category',async r=>impl.category(r.body||{}));f.post('/search',async r=>impl.search(r.body||{}));f.post('/detail',async r=>({list:await impl.detail(r.body||{})}));f.post('/play',async r=>impl.play(r.body||{}))}}}

const HOST='https://hdou.tv',API='https://api.dramaplay.shop',PIC='https://static.hdou.tv';
const cat=[['0','最新短剧'],['334','都市'],['155','古装'],['338','爱情'],['362','总裁'],['285','甜宠'],['332','逆袭'],['341','重生'],['306','穿越'],['397','玄幻'],['220','悬疑']].map(([type_id,type_name])=>({type_id,type_name}));
const genres=[['0','全部'],...cat.slice(1).map(x=>[x.type_id,x.type_name])];
const filters=Object.fromEntries(cat.map(x=>[x.type_id,[{key:'typeid',name:'题材',value:genres.map(([v,n])=>({v,n}))}]]));
const picture=v=>!v?'':abs(PIC+'/',v);const remarks=v=>v.tp||(v.sum||v.video?'全'+(v.sum||v.video)+'集':v.text||'');
const cards=rows=>(Array.isArray(rows)?rows:[]).filter(v=>v.id&&v.name).map(v=>({vod_id:String(v.id),vod_name:v.name,vod_pic:picture(v.img||v.pic),vod_remarks:remarks(v)}));
async function get(path,q){return json(API+path+'?'+new URLSearchParams(q),{headers:{Referer:HOST+'/',Origin:HOST}})}
async function page(b,type='0',word=''){let p=pg(b),q={limit:24,offset:(p-1)*24,lx:1};if(type&&type!=='0')q.typeid=type;if(word)q.keytext=word;const d=await get('/api/video/lists',q);return {list:cards(d.rows),page:p,pagecount:Math.max(1,Math.ceil((+d.total||0)/24)),limit:24,total:+d.total||0}}
export default function createSpider() {
  const s = plugin('hongdou_duanju','红豆短剧',cat,{filters,home:async()=> (await page({page:1})).list,category:b=>page(b,b.extend?.typeid||b.filters?.typeid||b.id),search:b=>page(b,'0',b.wd||b.keyword),detail:async b=>{let v=id(b);if(!/^\d+$/.test(v))return [];let a=await get('/api/video/info',{id:v,mid:0}),d=await get('/api/video/videoinfo',{page:1,uid:0,vid:v,mid:0,token:''});let eps=(d.data||d.result||[]);if(!Array.isArray(eps))eps=[];eps.sort((x,y)=>(+x.weigh||0)-(+y.weigh||0));let play=eps.map((x,i)=>(x.name||x.fjname||'第'+(i+1)+'集').replace(/[$#]/g,' ')+'$'+(x.videourl||x.src||'')).filter(x=>!x.endsWith('$'));if(!play.length&&a.videourl)play=['第1集$'+a.videourl];return [{vod_id:v,vod_name:a.name||v,vod_pic:picture(a.img||a.pic),vod_content:text(a.story||a.info),vod_remarks:remarks(a),vod_play_from:'红豆直连',vod_play_url:play.join('#')}]},play:async b=>({parse:0,url:id(b),header:{Referer:HOST+'/'}})},1);
  s.meta.key = 'py_hongdou_duanju';
  s.meta.name = '🫘红豆 - 短剧';
  return s;
}
