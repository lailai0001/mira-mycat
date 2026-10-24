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

const HOST='https://lssy.net';const names=['短剧大全','重生','穿越','都市','甜宠','虐恋','战神','逆袭','古装','家庭','悬疑','剧情'];
const classes=names.map((n,i)=>({type_id:String(i+1),type_name:n}));
function cards(html){const out=[],seen=new Set();for(const z of html.matchAll(/<div class="card">([\s\S]*?)<\/div>\s*<\/div>/g)){const b=z[1],v=m(b,/detail\.php\?vid=(\d+)/);if(!v||seen.has(v))continue;seen.add(v);out.push({vod_id:v,vod_name:text(m(b,/<div class="title">([\s\S]*?)<\/div>/)),vod_pic:abs(HOST,m(b,/data-original="([^"]+)"/)||m(b,/src="([^"]+\.(?:jpg|png|webp)[^"]*)"/)),vod_remarks:m(b,/(\d+\s*集)/)})}return out.filter(x=>x.vod_name)}
function pageurl(page,keyword=''){return HOST+'/?'+(keyword?'keyword='+encodeURIComponent(keyword)+'&':'')+'p='+page}
async function page(p,k){const h=await siteReq(pageurl(p,k));const n=[...h.matchAll(/[?&]p=(\d+)/g)].map(x=>+x[1]);return {...list(cards(h),p,20),pagecount:Math.max(p,...n,1)}}
export default function createSpider() {
  const s = plugin('duanju_daquan','短剧大全',classes,{home:async()=>cards(await siteReq(HOST+'/')),category:b=>page(pg(b),names[(+b.id||1)-1]==='短剧大全'?'':(names[(+b.id||1)-1]||'')),search:b=>page(pg(b),b.wd||b.keyword||''),detail:async b=>{const v=id(b);if(!/^\d+$/.test(v))return [];const h=await siteReq(HOST+'/detail.php?vid='+v);const eps=[];for(const e of h.matchAll(/<div[^>]*class="episode[^"]*"[^>]*data-src="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g))eps.push((text(e[2])||'第'+(eps.length+1)+'集')+'$'+abs(HOST,e[1]));if(!eps.length)for(const e of new Set([...h.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g)].map(z=>z[0])))eps.push('第'+(eps.length+1)+'集$'+e);return [{vod_id:v,vod_name:text(m(h,/<title>([^<]+)/)),vod_pic:abs(HOST,m(h,/<video[^>]*poster="([^"]+)/)||m(h,/data-original="([^"]+)/)),vod_content:m(h,/<meta name="description" content="([^"]+)/),vod_play_from:'直链',vod_play_url:eps.join('#')} ]},play:async b=>({parse:/\.(m3u8|mp4)(\?|$)/i.test(id(b))?0:1,url:id(b),header:{'User-Agent':UA,Referer:HOST+'/'}})});
  s.meta.key = 'py_duanju_daquan';
  s.meta.name = '🎬短剧 - 大全';
  return s;
}
