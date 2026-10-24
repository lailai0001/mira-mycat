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
function plugin(key,name,classes,impl,filterable=0){return {meta:{key,name,type:3,searchable:1,quickSearch:1,filterable},api:async f=>{f.post('/init',async()=>({}));f.post('/home',async r=>({class:classes,filters:filterable?(impl.filters||{}):{},list:await impl.home(r.body||{})}));f.post('/category',async r=>impl.category(r.body||{}));f.post('/search',async r=>impl.search(r.body||{}));f.post('/detail',async r=>({list:await impl.detail(r.body||{})}));f.post('/play',async r=>impl.play(r.body||{}));}}}

const H='https://www.duanju84.com';
const classes=[['27','短剧'],['label_boy','男频爽剧'],['label_girl','女频爽剧'],['label_hot','热门推荐']].map(([type_id,type_name])=>({type_id,type_name}));
function cards(h){let rows=[];for(const x of h.matchAll(/<a\s+href="\/duanju\/(\d+)\.html"\s+title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)){let name=text(x[2]),b=x[3];if(!name)continue;rows.push({vod_id:x[1],vod_name:name,vod_pic:abs(H,m(b,/data-original="([^"]+)/)||m(b,/src="([^"]+)/))})}return [...new Map(rows.map(x=>[x.vod_id,x])).values()]}
function catUrl(b){let type=String(b.id||'27'),n=pg(b);if(type.startsWith('label_')){let tag={label_boy:'boy',label_girl:'girl',label_hot:'hot'}[type];return H+'/label/'+tag+(n>1?'/page/'+n:'')+'.html'}return H+'/show/27--------'+n+'---.html'}
export default function createSpider() {
  const s = plugin('duanju_bashi','短剧巴士',classes,{home:async()=>cards(await siteReq(H+'/')).slice(0,40),category:async b=>list(cards(await siteReq(catUrl(b))),pg(b)),search:async b=>list(cards(await siteReq(H+'/search/'+encodeURIComponent(b.wd||'')+'-------------.html')),pg(b)),detail:async b=>{let u=H+'/duanju/'+encodeURIComponent(id(b))+'.html';let h=await siteReq(u);let eps=[...h.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*(?:第\d+集|播放)[^<]*)<\/a>/g)].map(x=>text(x[2])+'$'+abs(u,x[1]));return [{vod_id:u,vod_name:text(m(h,/<h1[^>]*>([\s\S]*?)<\/h1>/)),vod_content:text(m(h,/<meta[^>]*name="description"[^>]*content="([^"]+)/)),vod_play_from:'站点线路',vod_play_url:eps.join('#')}]},play:async b=>{let u=id(b);if(/^\d+$/.test(u))u=H+'/duanju/'+u+'.html';if(/\/duanju\/\d+\.html/i.test(u)){try{let dh=await siteReq(u),ep=m(dh,/href=["']([^"']*\/djplay\/\d+-\d+-\d+\.html)/i);if(ep)u=abs(u,ep)}catch(e){}}if(/\.(m3u8|mp4)(\?|$)/i.test(u))return {parse:0,url:u};const unesc=s=>String(s||'').replace(/\\u([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\\//g,'/').replace(/&amp;/g,'&');try{let h=await siteReq(u);let raw=m(h,/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);if(raw){try{let p=JSON.parse(raw),v=unesc(p.url);if(String(p.encrypt)==='1')v=decodeURIComponent(v);else if(String(p.encrypt)==='2')v=unesc(Buffer.from(v,'base64').toString('utf8'));if(/^https?:\/\//i.test(v))return {parse:0,url:abs(u,v)}}catch(e){}}let x=m(h,/<source[^>]*src=["']([^"']+)/i)||m(h,/\"url\"\s*:\s*\"(https?:[^"]+?\.(?:m3u8|mp4)[^"]*)/i);if(x)return {parse:0,url:abs(u,unesc(x))}}catch(e){console.warn('短剧巴士播放页',e.message)}return {parse:1,url:u}}});
  s.meta.key = 'py_duanju_bashi';
  s.meta.name = '🎬短剧 - 巴士';
  return s;
}
