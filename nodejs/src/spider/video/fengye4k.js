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
// 枫叶4K：滴源客户端 Node 插件，单文件、零第三方依赖。
// GitHub 只托管文件；HTTP 请求由加载此文件的客户端 Node 环境执行。
const HOST = 'https://maihaolian.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1';
const CLASSES = [['/label/qq','腾讯VIP精选'],['/label/bli','B站VIP精选'],['/label/youku','优酷VIP精选'],['5','红果短剧'],['2','电视剧'],['1','电影'],['4','动漫'],['3','综艺']].map(([type_id,type_name])=>({type_id,type_name}));
const val = x => String(Array.isArray(x)? x[0]||'' : x||'');
const pageNum = b => Math.max(1,parseInt(b.page||b.pg,10)||1);
const attr = (tag,key) => (String(tag).match(new RegExp('\\b'+key+'\\s*=\\s*["\\\']([^"\\\']*)["\\\']','i'))||[])[1]||'';
const text = s => String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
const absolute = s => {s=String(s||'').replace(/&amp;/g,'&');return s.startsWith('//')?'https:'+s:s.startsWith('/')?HOST+s:s;};
function match(s,re){return (String(s||'').match(re)||[])[1]||'';}
// 无需 cheerio：取指定标签中 class 匹配的完整节点（含嵌套的同名标签）。
function blocks(html,tag,cls){
  const out=[];const tags=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');let m;
  while((m=tags.exec(html))){
    if(m[0].startsWith('</') || !new RegExp('\\bclass\\s*=\\s*["\\\'][^"\\\']*\\b'+cls+'\\b','i').test(m[0])) continue;
    const start=m.index;const t=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');t.lastIndex=tags.lastIndex;
    let depth=1,n;while((n=t.exec(html))){if(n[0].startsWith('</'))depth--;else if(!/\/\s*>$/.test(n[0]))depth++;if(!depth){out.push(html.slice(start,t.lastIndex));tags.lastIndex=t.lastIndex;break;}}
    if(depth)break;
  }
  return out;
}
async function httpText(url, postBody, depth = 0) {
  const headers = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', 'Referer': HOST + '/' };
  if (postBody !== undefined) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers.Referer = 'https://www.ht10010.com/'; }
  return reqTextAx(url, { method: postBody === undefined ? 'GET' : 'POST', headers, body: postBody });
}
const get = path => httpText(/^https?:\/\//.test(path)?path:HOST+path);
function cards(html){
  const result=[];const seen=new Set();
  for(const a of blocks(html,'a','public-list-exp')){
    const head=(a.match(/^<a\b[^>]*>/i)||[])[0]||'',href=attr(head,'href');
    const id=match(href,/\/detail\/(\d+)\.html/i);if(!id||seen.has(id))continue;
    const img=(a.match(/<img\b[^>]*>/i)||[])[0]||'',name=text(attr(head,'title')||attr(img,'alt'));
    if(!name)continue;seen.add(id);
    const remarks=text(match(a,/<[^>]+class=["'][^"']*(?:ft2|public-list-prb)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i));
    const tags=[...a.matchAll(/<span\b[^>]*class=["'][^"']*public-prt[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map(x=>text(x[1]));
    result.push({vod_id:id,vod_name:name,vod_pic:absolute(attr(img,'data-src')||attr(img,'src')),vod_remarks:remarks,vod_year:tags.join(',')});
  }
  return result;
}
function categoryPath(b){
  const id=val(b.id||b.tid||'2'),p=pageNum(b),ext=b.extend||b.filters||b.ext||{};
  if(id.startsWith('/label/'))return id+'/page/'+p+'.html';
  const type=val(ext.class||id),area=val(ext.area),genre=val(ext.genre),year=val(ext.year),lang=val(ext.lang),letter=val(ext.letter),sort=val(ext.sort);
  return !(area+genre+year+lang+letter+sort)?'/cupfox-list/'+type+'--------'+p+'---.html':'/cupfox-list/'+[type,area,sort,genre,lang,letter,'','',p,'','',year].join('-')+'.html';
}
async function detail(id){
  id=match(val(id),/(\d+)/);if(!id)return {list:[]};
  const html=await get('/detail/'+id+'.html');
  const meta=[...html.matchAll(/<[^>]+class=["'][^"']*slide-info[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi)].map(m=>text(m[1]));
  const director=meta.find(x=>x.startsWith('导演：'))?.slice(3)||'';
  const actor=meta.find(x=>x.startsWith('演员：'))?.slice(3)||'';
  const tabs=blocks(html,'a','swiper-slide').map(text).filter(Boolean);
  const groups=[];
  for(const box of blocks(html,'div','anthology-list-box')){
    const eps=[...box.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>{
      const play=match(m[1],/\/play\/(.*?)\.html/);return play?text(m[2]).replace(/[$#]/g,'_')+'$'+play:'';
    }).filter(Boolean);
    if(eps.length)groups.push(eps.reverse().join('#'));
  }
  const title=text(match(html,/<h3\b[^>]*class=["'][^"']*slide-info-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i));
  const img=(html.match(/<img\b[^>]*class=["'][^"']*lazy[^"']*["'][^>]*>/i)||[])[0]||'';
  const intro=text(match(html,/<[^>]+id=["']height_limit["'][^>]*>([\s\S]*?)<\/[^>]+>/i));
  const names=groups.map((_,i)=>tabs[i]||'线路'+(i+1));
  return {list:[{vod_id:id,vod_name:title||id,vod_pic:absolute(attr(img,'data-src')||attr(img,'src')),vod_director:director,vod_actor:actor,vod_content:intro,vod_play_from:names.join('$$$'),vod_play_url:groups.join('$$$')}]};
}
async function play(id){
  id=val(id);
  // 壳子若把详情 id / 详情页当播放 id 传进来，先换成第一条播放页链接
  if(/^\d+$/.test(id)||/\/detail\/\d+\.html/i.test(id)){
    try{
      const dh=await get(/^\d+$/.test(id)?'/detail/'+id+'.html':id);
      const links=[...String(dh).matchAll(/href=["']([^"']*\/play\/[^"']+\.html)/gi)];
      const p=links.length?links[links.length-1][1]:match(dh,/href=["'](\/play\/[^"']+\.html)/i);
      if(p)id=p;
    }catch(e){/* 保持原 id */}
  }
  const first=/^https?:\/\//.test(id)?id:(id.startsWith('/')?HOST+id:HOST+'/play/'+id+'.html');
  const pages=[first];
  // 蓝光2k(sid4)/至臻4k(sid5) 现在返回的是 co/JD- 混淆码，本站解析器已失效；
  // 同一集在 sid1/2/3 仍是自营直链，按顺序回退，避免首条线路整站播不了。
  const m=String(id).match(/^(\d+)-(\d+)-(\d+)$/);
  if(m) for(const sid of [1,2,3]) if(String(sid)!==m[2]) pages.push(HOST+'/play/'+m[1]+'-'+sid+'-'+m[3]+'.html');
  for(const page of pages){
    try{
      const html=await get(page);
      const raw=match(html,/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i)||match(html,/player_aaaa\s*=\s*(\{[^\n]+?\})\s*;/i);
      if(!raw)continue;
      let player={};try{player=JSON.parse(raw);}catch(e){continue}
      let url=String(player.url||'');const from=String(player.from||'');
      if(String(player.encrypt)==='1'){try{url=decodeURIComponent(url);}catch(e){}}
      if(String(player.encrypt)==='2'){try{url=decodeURIComponent(Buffer.from(url,'base64').toString('utf8'));}catch(e){}}
      if(/^https?:\/\//i.test(url)&&/\.(m3u8|mp4)(?:$|[?#])/i.test(url))return {parse:0,url,header:{'User-Agent':UA,'Referer':HOST+'/'}};
      const endpoint=from==='YYNB'?'https://zzrs.mfdyvip.com/player/mplayer.php':from==='JD4K'?'https://fgsrg.hzqingshan.com/player/mplayer.php':'';
      if(endpoint&&url){
        const challenge=await get((from==='JD4K'?'https://fgsrg.hzqingshan.com':'https://zzrs.mfdyvip.com')+'/player/?url='+encodeURIComponent(url));
        const token=match(challenge,/data-te=["']([^"']+)["']/i);
        if(token){try{
          const obj=JSON.parse(await httpText(endpoint,new URLSearchParams({url,token}).toString()));
          if((obj.code===200||obj.code==='200')&&obj.url)return {parse:0,url:obj.url,header:{'User-Agent':UA,'Referer':HOST+'/'}};
        }catch(e){/* 交给下一条线路 */}}
      }
    }catch(e){/* 继续下一条线路 */}
  }
  return {parse:1,url:first};
}
export default function createSpider() {
  return {
  meta:{key:'py_fengye4k',name:'🍁枫叶 - 4K',type:3,searchable:0,quickSearch:0,filterable:0},
  api:async function(fastify){
    fastify.post('/init',async()=>({}));
    fastify.post('/home',async()=>{
      let list=[];
      try{list=cards(await get('/')).slice(0,60)}catch(e){/* 首页失败了也不挡分类 */}
      return {class:CLASSES,filters:{},list};
    });
    fastify.post('/category',async req=>{
      const b=req.body||{},p=pageNum(b);
      const cid=val(b.id||b.tid||'2');
      let list=[],pagecount=p+1;
      // 列表页现在会跳「系统安全验证」（图片验证码）；站点自带的 ajax 数据接口不受影响，优先走它。
      if(!cid.startsWith('/label/')){
        try{
          const j=JSON.parse(await get('/index.php/ajax/data?mid=1&tid='+encodeURIComponent(cid)+'&page='+p));
          list=(j.list||[]).map(x=>({vod_id:String(x.vod_id),vod_name:text(x.vod_name),vod_pic:absolute(x.vod_pic||''),vod_remarks:text(x.vod_remarks||''),vod_year:text(x.vod_year||'')}));
          pagecount=Math.max(p,Number(j.pagecount)||p);
        }catch(e){/* 回退 HTML 列表 */}
      }
      if(!list.length){
        list=cards(await get(categoryPath(b)));
        pagecount=p+(list.length>=24?1:0);
      }
      return {list,page:p,pagecount,limit:36,total:list.length?9999:0};
    });
    fastify.post('/detail',async req=>detail((req.body||{}).id||(req.body||{}).ids));
    fastify.post('/search',async req=>{
      const b=req.body||{},p=pageNum(b),wd=val(b.wd||b.keyword||b.word).trim();
      if(!wd)return {list:[],page:p,pagecount:p,limit:36,total:0};
      const list=cards(await get('/cupfox-search/'+encodeURIComponent(wd)+'----------'+p+'---.html'));
      return {list,page:p,pagecount:p+(list.length>=24?1:0),limit:36,total:list.length?9999:0};
    });
    fastify.post('/play',async req=>play((req.body||{}).id||(req.body||{}).play));
  }
};
}
