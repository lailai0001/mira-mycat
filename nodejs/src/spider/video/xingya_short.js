// 滴源 Node 环境通用兼容层。原始站点代码完整保留在下方。
'use strict';
import req from '../../util/req.js';
const log = (...args) => console.log(...args);
const setResult = function(items) {
  if (!Array.isArray(items)) return items || [];
  return items.map(i => ({
    vod_id: String(i.vod_id || i.url || i.id || ''),
    vod_name: String(i.vod_name || i.title || i.name || ''),
    vod_pic: String(i.vod_pic || i.pic_url || i.img || i.pic || ''),
    vod_remarks: String(i.vod_remarks || i.desc || i.remarks || '')
  }));
};
async function request(url, opt) {
  const o = opt || {};
  const method = String(o.method || 'GET').toUpperCase();
  const r = await req({ method, url, headers: o.headers || {}, data: o.body || o.data || undefined, timeout: o.timeout || 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ' ' + url);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
async function post(url, opt = {}) { return request(url, { ...opt, method: 'POST' }); }

const HOST='https://app.whjzjx.cn';const AUTH='https://u.shytkjgs.com';const device='24250683a3bdb3f118dff25ba4b1cba1a';
const hdr={'User-Agent':'okhttp/4.10.0','x-app-id':'7',platform:'1',manufacturer:'realme',version_name:'3.3.1',device_id:device,app_version:'3.3.1',device_platform:'android','Accept':'application/json'};
let token='',tokenAt=0;
const query=async (url,opt={})=>{let t=await request(url,{...opt,headers:{...hdr,...(token?{authorization:token}:{}),...(opt.headers||{})}});return JSON.parse(t).data||{}};
async function login(){if(token&&Date.now()-tokenAt<3600000)return;try{let t=await request(AUTH+'/user/v1/account/login',{method:'POST',headers:{...hdr,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({device,install_first_open:'false',first_install_time:'1723214205125',last_update_time:'1723214205125',report_link_url:''}).toString()});let j=JSON.parse(t);token=j?.data?.token||j?.data?.data?.token||'';tokenAt=Date.now()}catch(e){console.warn('星芽 login:',e.message)}}
const cls=[['1','剧场'],['2','热播剧'],['8','会员专享'],['7','星选好剧'],['3','新剧'],['5','阳光剧场']].map(([type_id,type_name])=>({type_id,type_name}));
const item=x=>{let i=x.theater||x;return {vod_id:String(i.id||i.theater_parent_id||''),vod_name:i.title||i.son_title||'',vod_pic:i.cover_url||'',vod_remarks:String(i.theme||i.total||'')}};
const pg=b=>Math.max(1,parseInt(b.page||b.pg||1)||1);const rows=d=>(d.list||d?.theater?.search_data||[]).map(item).filter(x=>x.vod_id);
const __spider={meta:{key:'py_xingya_short',name:'🌱星芽 - 短剧',type:3,searchable:1,quickSearch:1,filterable:0},api:async f=>{
f.post('/init',async()=>{await login();return {}});
f.post('/home',async()=>({class:cls,list:[]}));
f.post('/category',async r=>{await login();let b=r.body||{},n=pg(b),u=HOST+'/cloud/v2/theater/home_page?'+new URLSearchParams({theater_class_id:String(b.id||'1'),type:1,class2_ids:0,page_num:n,page_size:24});let d=await query(u);return {list:rows(d),page:n,pagecount:n+1,limit:24,total:9999}});
f.post('/search',async r=>{await login();let b=r.body||{};let d=await query(HOST+'/v3/search',{method:'POST',body:JSON.stringify({text:b.wd||b.keyword||''}),headers:{'Content-Type':'application/json'}});return {list:rows(d),page:pg(b),pagecount:pg(b)+1}});
f.post('/detail',async r=>{await login();let v=r.body?.id||r.body?.ids||'';if(Array.isArray(v))v=v[0];let n=String(v).match(/theater_parent_id=(\d+)/)?.[1]||String(v);let d=await query(HOST+'/v2/theater_parent/detail?theater_parent_id='+encodeURIComponent(n)),eps=Array.isArray(d.theaters)?d.theaters:[];return {list:[{vod_id:n,vod_name:d.son_title||d.title||d.theaters?.son_title||n,vod_pic:d.cover_url||'',vod_play_from:'星芽短剧',vod_play_url:eps.filter(e=>e.son_video_url).map((e,i)=>(e.num||i+1)+'$'+e.son_video_url).join('#')}]}});
f.post('/play',async r=>({parse:0,url:decodeURIComponent(String(r.body?.id||'')),header:{'User-Agent':'okhttp/4.10.0'}}));
}};

export default function createSpider() { return __spider; }
