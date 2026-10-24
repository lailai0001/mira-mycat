import req from '../../util/req.js';
async function reqTextAx(url, opt = {}) {
  const method = (opt.method || 'GET').toUpperCase();
  const headers = Object.assign({}, opt.headers || {});
  const timeout = opt.timeout || 20000;
  const body = opt.body !== undefined ? opt.body : opt.data;
  const data = (body != null && typeof body === 'object' && !Buffer.isBuffer(body)) ? JSON.stringify(body) : body;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: 'text', maxRedirects: 5 });
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: data, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

'use strict';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';
async function siteReq(url, opts = {}) {
  const headers = Object.assign({ 'User-Agent': UA }, opts.headers || {});
  return reqTextAx(url, { ...opts, headers });
}
async function json(u,opt){try{return JSON.parse(await siteReq(u,opt))}catch{return {}}}
const text=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const m=(s,r)=>((String(s||'').match(r)||[])[1]||'');
const abs=(base,u)=>{try{return new URL(u,base).href}catch{return ''}};
const pg=b=>Math.max(1,parseInt(b?.page||b?.pg||1,10)||1);
const id=b=>String(Array.isArray(b?.id)?b.id[0]:(b?.id||b?.ids||''));
const list=(data,page=1,size=20)=>({list:data,page,pagecount:page+(data.length>=size?1:0),limit:size,total:data.length>=size?9999:data.length});
function plugin(key,name,classes,impl,filterable=0){return {meta:{key,name,type:3,searchable:1,quickSearch:1,filterable},api:async f=>{f.post('/init',async()=>({}));f.post('/home',async r=>({class:classes,filters:filterable?(impl.filters||{}):{},list:await impl.home(r.body||{})}));f.post('/category',async r=>impl.category(r.body||{}));f.post('/search',async r=>impl.search(r.body||{}));f.post('/detail',async r=>({list:await impl.detail(r.body||{})}));f.post('/play',async r=>impl.play(r.body||{}))}}}

const H='https://m.ximalaya.com';
const C=['youshengshu:有声书','ertong:儿童','yinyue:音乐','xiangsheng:相声','yule:娱乐','guangbojv:广播剧','lishi:历史','waiyu:外语','qinggan:情感','keji:科技','caijing:财经','jiaoyu:教育','jiankang:健康','qiche:汽车','lvxing:旅行','youxi:游戏','erciyuan:二次元','toutiao:头条','dianying:电影','dianshiju:电视剧','3d:3D沉浸','xiuxian:播客','xiangsheng2:相声评书','tuokouxiu:脱口秀'].map(v=>({type_id:v.split(':')[0],type_name:v.split(':')[1]}));
const detailUrl=v=>'http://mobile.ximalaya.com/mobile/others/ca/album/track/'+v+'/true/0/200?albumId='+v;
async function search(b){let n=pg(b),j=await json('https://www.ximalaya.com/revision/search?'+new URLSearchParams({kw:b.wd||b.keyword||'',core:'album',page:n,rows:20}));let docs=j?.data?.result?.response?.docs||[],out=[];for(const x of docs){let aid=m(String(x.url||''),/\/album\/(\d+)/);if(!aid)continue;out.push({vod_id:detailUrl(aid),vod_name:text(x.title||''),vod_pic:x.cover_path?('https:'+x.cover_path):''})}return list(out,n)}
async function category(b){let n=pg(b),ext=b.extend||b.filters||{},u=H+'/m-revision/page/category/queryCategoryAlbumsByPage?'+new URLSearchParams({sort:ext.sort||'0',pageSize:50,page:n,categoryCode:b.id||'youshengshu',...(ext.class?{secondCategoryCode:ext.class}:{})});let data=(await json(u)).data||{},items=data.albumBriefDetailInfos||[];let out=items.map(x=>{let a=x.albumInfo||{},aid=x.id||a.id;return {vod_id:detailUrl(aid),vod_name:a.title||'',vod_pic:abs('http://imagev2.xmcdn.com/',a.cover||''),vod_remarks:['免费','VIP','付费'][a.albumVipPayType||0]||''}}).filter(x=>x.vod_name);return {list:out,page:n,pagecount:Math.max(1,Math.ceil((+data.totalCount||0)/50)),limit:50,total:+data.totalCount||0}}
export default function createSpider() {
  const s = plugin('ximalaya','喜马拉雅',C,{home:async()=> (await category({id:'youshengshu',page:1})).list,category,search,detail:async b=>{let v=id(b),aid=m(v,/albumId=(\d+)/)||m(v,/track\/(\d+)/);if(!aid)return [];let h=await json(detailUrl(aid));let tracks=h.tracks||{},eps=[...(tracks.list||[])];for(let p=2;p<=Math.min(+tracks.maxPageId||1,20);p++){let j=await json(detailUrl(aid).replace('/0/200','/'+p+'/200'));eps.push(...j.tracks?.list||[])}return [{vod_id:v,vod_name:h.album?.title||aid,vod_pic:h.album?.coverLarge||'',vod_content:h.album?.intro||'',vod_play_from:'喜马拉雅',vod_play_url:eps.filter(x=>x.playPathAacv164).map(x=>String(x.title).replace(/[$#]/g,' ')+'$'+x.playPathAacv164).join('#')}]},play:async b=>({parse:0,url:id(b)})});
  s.meta.key = 'py_ximalaya';
  s.meta.name = '🏔喜马拉雅-听书';
  return s;
}
