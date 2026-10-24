import req from '../../util/req.js';
function normHeaders(h) {
  const o = {};
  try { for (const [k, v] of Object.entries(h || {})) o[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v; } catch (e) {}
  return o;
}
// Cat-contract transport: axios (req) first, typeof-guarded fetch fallback only.
// Returns engine-style { status, headers, text, content, data, buf } so the
// original hmtv call sites keep working. HTTP error statuses are returned,
// not thrown (original engine req resolved with status); network failures throw.
async function httpReq(url, opt = {}) {
  const o = opt || {};
  const headers = Object.assign({}, o.headers || {});
  delete headers['Accept-Encoding']; delete headers['accept-encoding'];
  const timeout = o.timeout || 20000;
  const binary = !!o.binary;
  const method = (o.method || (o.body != null ? 'POST' : 'GET')).toUpperCase();
  const data = o.body !== undefined ? o.body : o.data;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: binary ? 'arraybuffer' : 'text', maxRedirects: 5 });
    const buf = binary ? Buffer.from(r.data || []) : undefined;
    const text = binary ? '' : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
    return { status: r.status || 200, headers: normHeaders(r.headers), text, content: text, data: r.data, buf };
  } catch (e) {
    if (e && e.response) {
      const d = e.response.data;
      const buf = binary ? Buffer.from(d || []) : undefined;
      const text = binary ? '' : (typeof d === 'string' ? d : JSON.stringify(d ?? ''));
      return { status: e.response.status || 0, headers: normHeaders(e.response.headers), text, content: text, data: d, buf };
    }
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: (method === 'GET' || method === 'HEAD') ? undefined : data, signal: ctl.signal, redirect: 'follow' });
        const headers2 = {}; try { r.headers.forEach((v, k) => { headers2[String(k).toLowerCase()] = v; }); } catch (e2) {}
        if (binary) { const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: headers2, text: '', content: '', data: buf, buf }; }
        const text = await r.text(); return { status: r.status, headers: headers2, text, content: text, data: text };
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

// GitHub Raw 托管；代码由客户端的 Node.js 环境执行，无服务器中转。
const UA='Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
async function fetchData(url,headers={},timeout=16000,binary=false,depth=0){
  const r = await httpReq(url, { headers: Object.assign({ 'User-Agent': UA }, headers || {}), timeout, binary });
  if (r.status >= 400) throw Error('HTTP ' + r.status + ' ' + new URL(url).host);
  return binary ? r.buf : r.text;
}
function clean(s){return String(s||'').replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()}
function aurl(u,base){try{return new URL(String(u||''),base).href}catch{return ''}}
function m1(s,re){const m=String(s||'').match(re);return m?m[1]:''}
function body(r){return r.body||{}}
function page(r){return Math.max(1,parseInt(body(r).page||body(r).pg,10)||1)}
function ids(r){let v=body(r).id||body(r).ids||'';return String(Array.isArray(v)?v[0]:v)}
function listing(list,p,n=24){return {page:p,pagecount:p+(list.length>=n?1:0),limit:n,total:list.length>=n?9999:list.length,list}}
function mount(f,fn){for(const k of ['init','home','category','detail','search','play'])f.post('/'+k,async r=>{try{return await fn[k](r)}catch(e){console.error('[Node源]',k,e.message);throw e}})}
const NAVS=['https://x99dh.cc','https://x99dh.one'],DEFAULT='https://ptt01.com';let HOST='',hostExpiry=0;
async function get(u){return fetchData(u,{'Referer':new URL(u).origin+'/'})}
async function hostNow(){if(HOST&&Date.now()<hostExpiry)return HOST;let candidates=[DEFAULT];for(const nav of NAVS){try{let h=await get(nav);for(const part of h.match(/[A-Za-z0-9+/=]{100,}/g)||[]){try{let t=Buffer.from(part,'base64').toString();try{t=decodeURIComponent(t)}catch{}if(!/三级片资源|稀缺资源/.test(t))continue;for(const item of JSON.parse(t)){if(!['三级片资源','稀缺资源'].includes(item.name))continue;for(const v of [item.url,...(item.urls||[]).map(x=>x.url)]){try{candidates.push(new URL(v).origin)}catch{}}}}catch{}}}catch{}}
for(const h of [...new Set(candidates)]){try{if(/id=["']videos["']/.test(await get(h+'/p/1'))){HOST=h;hostExpiry=Date.now()+30*60000;return h}}catch{}}return HOST||DEFAULT}
function cards(html,host){let v=m1(html,/<(?:div|section)[^>]+id=["']videos["'][^>]*>([\s\S]+)/i)||html;let chunks=v.split(/<div[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>/i).slice(1),list=[],seen=new Set();for(const x of chunks){let part=x.slice(0,4500),href=m1(part,/<a[^>]*href=["']([^"']+)/i),id=m1(href,/\/(\d+)(?:\/|$)/);if(!id||seen.has(id))continue;let img=part.match(/<img\b[^>]*>/i)?.[0]||'',name=m1(img,/alt=["']([^"']+)/i)||m1(part,/<div[^>]*class=["'][^"']*lines[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);if(!name)continue;seen.add(id);list.push({vod_id:id,vod_name:clean(name),vod_pic:aurl(m1(img,/data-src=["']([^"']+)/i)||m1(img,/src=["']([^"']+)/i),host),vod_remarks:clean(m1(part,/imagelabel-bottom-left[^>]*>([\s\S]*?)<\//i)+' '+m1(part,/imagelabel-bottom-right[^>]*>([\s\S]*?)<\//i))})}return list}
const classes=[['1','电影'],['3','电视剧'],['4','动漫'],['2','综艺'],['66','短剧'],['53','体育']].map(([type_id,type_name])=>({type_id,type_name}));
export default function createSpider() {
  return {meta:{key:'py_hudie_yingyuan',name:'🦋蝴蝶 - 影院',type:3,searchable:0,quickSearch:0,filterable:0},api:async f=>mount(f,{
init:async()=>({}),home:async()=>{const h=await hostNow();return {class:classes,list:cards(await get(h+'/p/1'),h).slice(0,36)}},
category:async r=>{const h=await hostNow(),p=page(r),id=ids(r)||'1';return listing(cards(await get(h+'/p/'+encodeURIComponent(id)+(p>1?'?page='+p:'')),h),p,24)},
search:async()=>({list:[]}),
detail:async r=>{const h=await hostNow(),id=m1(ids(r),/(\d+)/);if(!id)return {list:[]};const html=await get(h+'/'+id);const name=clean(m1(html,/<title>([\s\S]*?)<\/title>/i)).split(' - ')[0];let pic=aurl(m1(html,/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i)||m1(html,/<img[^>]*src=["']([^"']*\/images\/node\/[^"']+)/i),h);if(pic.startsWith(h+'/images/node/'))pic=pic.replace(h+'/images/node/','https://pttimg.7132p.cc/images/node/');
let nums=[...html.matchAll(/<a[^>]*class=["'][^"']*\bseq\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map(x=>m1(x[1],new RegExp('/'+id+'/(\\d+)'))).filter(Boolean);nums=[...new Set(nums)];if(!nums.length)nums=['1'];
let tabPart=m1(html,/<[^>]*id=["']w1["'][^>]*>([\s\S]*?)<\/div>/i),tabs=[...tabPart.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];const from=[],urls=[];for(const t of tabs){let code=m1(t[1],/\/(\d+)\/?$/);if(!code)continue;from.push(clean(t[2])||'线路'+(from.length+1));urls.push(nums.map(n=>'第'+n+'集$/'+id+'/'+n+'/'+code).join('#'))}if(!from.length){from.push('蝴蝶直连');urls.push(nums.map(n=>'第'+n+'集$/'+id+'/'+n).join('#'))}
return {list:[{vod_id:id,vod_name:name||id,vod_pic:pic,vod_content:clean(m1(html,/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)),vod_play_from:from.join('$$$'),vod_play_url:urls.join('$$$')}]}},
play:async r=>{const h=await hostNow(),id=ids(r);if(/^https?:\/\//.test(id)&&/\.(mp4|m3u8)(\?|$)/.test(id))return {parse:0,url:id};const u=aurl(id,h),html=await get(u);let media=m1(html,/<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)/i)||m1(html,/["']contentUrl["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i)||m1(html,/["']url["']\s*:\s*["'](https?:[^"']+\.(?:m3u8|mp4)[^"']*)/i);return media?{parse:0,url:aurl(media.replace(/\\\//g,'/'),u),header:{'User-Agent':UA,Referer:u}}:{parse:1,url:u}}
})};
}
