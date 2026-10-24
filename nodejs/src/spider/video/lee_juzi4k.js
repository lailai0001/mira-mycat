import req from '../../util/req.js';
import crypto from 'crypto';
import zlib from 'zlib';
// 橘汁4K（LeeCatPaw lee_juzi4k 移植，新增）。注意：这是咕噜 protobuf 后端的 orange 目录，与 mycat 现有 py_juzi_4k（juziapp 后端）不是同一站，显示名撞名见批报告。
// 直连咕噜 protobuf 后端（http://103.45.132.22:19987/app/bn/v2）；播放伪直链经站方自用解析接口还原，与 bundle 原实现一致。
// 注意与旧版的差异（见批报告）：旧版另有模块级会话缓存（3 小时）与“咕噜4K”解析键 e1234a…，Lee 版无缓存、解析键为 96963…；
// Lee 版多 JD-（鲸澜解析）前缀处理，旧版无。
const BASE = 'http://103.45.132.22:19987/app/bn/v2';
const UA = 'Dalvik/2.1.0 (Linux; U; Android 11; Pixel 4)';
const cat = [['movie','电影',8],['tv','电视剧',9],['variety','综艺',10],['anime','动漫',11],['short','短剧',12],['doc','纪录片',6],['cn','大陆剧',34],['hk','港剧',41],['tw','台剧',42],['us','美剧',35],['kr','韩剧',36],['jp','日剧',38],['th','泰剧',39],['uk','英剧',37],['ru','俄剧',45]];
const orange = { '1':['推荐',48], '2':['电影',2], '3':['剧集',3], '5':['短剧',61], '6':['动漫',59], '7':['综艺',57] };
const orangeRanks = { '2':[['2','全部'],['50','今日热门'],['79','海外上升榜'],['65','豆瓣Top250']], '3':[['3','全部'],['55','今日热门'],['67','美剧人气榜'],['68','韩剧热播榜'],['69','日剧热度榜']], '6':[['59','今日热门'],['72','日漫人气榜'],['73','少儿必看榜']], '7':[['57','今日热门'],['75','海外综艺榜']] };
const lines = {dyttm3u8:'电影天堂',bfzym3u8:'暴风资源',lzm3u8:'量子资源',ffm3u8:'非凡资源',qq:'腾讯视频',qiyi:'爱奇艺',youku:'优酷',mgtv:'芒果TV',newxfyun:'咕噜4K',xfyun:'咕噜4K二线',CO4K:'咖啡4K超清',jplink:'金牌极速',rose:'玫瑰4K',NBY:'蚂蚁资源',qsvip:'旋风VIP',qingshan:'青山资源',JD4K:'鲸宝4K',iyf4k:'爱壹帆4K'};
const cipherNames = {'CO4K_':'咖啡4K','rose_':'咖啡4K','NBY-':'蚂蚁','qsvip-':'熊出没','qingshan-':'熊出没','JP-':'旋风金牌','xfy-':'新咕噜4K','JD-':'鲸澜解析'};
const flagNames = {'咕噜4K':'新咕噜4K','咕噜4K二线':'咕噜4K总接口','玫瑰4K':'咖啡4K','咖啡4K':'咖啡4K','金牌极速':'旋风金牌','蚂蚁资源':'蚂蚁','旋风VIP':'熊出没','青山资源':'熊出没','鲸宝4K':'鲸澜解析'};
const fallback = {'咖啡4K':'https://co4k.1ljx.com:32010/api/?key=6db7285d-c228-4cee-918e-67a01ef7c3f8&url=','蚂蚁':'https://api.nbyjson.top:7788/api/?key=8LJohkjTZHC2F9ct48&url=','熊出没':'https://jf.hxx2023.cc/api?key=Uw5rZokFSAywqcLN&url=','旋风金牌':'http://111.170.58.215:4470/api.php?id=','鲸澜解析':'https://jiexi.jdyx.pro/api/?key=8a94da668d980bae94fbc8dd3fd115ce&url=','咕噜4K总接口':'https://xfyvideochandi.online/p.php?id=','新咕噜4K':'http://172.247.189.48:7788/dsxt/api.php?user=xt&key=969632c8da19b3ef8c56e5b51011d5e0&j=19227eae77225a30&url='};
const concat = (...parts) => Buffer.concat(parts.map(x => Buffer.isBuffer(x) ? x : Buffer.from(x)));
function varint(value) { let n=BigInt(value), out=[]; do {let b=Number(n&127n); n>>=7n; out.push(b|(n?128:0));} while(n); return Buffer.from(out); }
const pv=(f,v)=>concat(varint(f*8),varint(v));
const pb=(f,v)=>{const b=Buffer.isBuffer(v)?v:Buffer.from(String(v)); return concat(varint(f*8+2),varint(b.length),b);};
function decode(buf) { const out=[]; let p=0; const read=()=>{let n=0n,s=0n; while(p<buf.length){const b=buf[p++];n|=BigInt(b&127)<<s;if(!(b&128))return Number(n);s+=7n;}throw Error('bad protobuf');}; while(p<buf.length){const tag=read(), f=tag>>3, w=tag&7; if(w===0)out.push([f,w,read()]);else if(w===2){const len=read();if(len<0||p+len>buf.length)throw Error('bad protobuf length');out.push([f,w,buf.subarray(p,p+len)]);p+=len;}else if(w===1)p+=8;else if(w===5)p+=4;else throw Error('bad protobuf wire');}return out; }
const first=(fields,f,w)=>fields.find(x=>x[0]===f&&(w===undefined||x[1]===w))?.[2];
const str=x=>Buffer.isBuffer(x)?x.toString('utf8'):String(x??'');
async function postBin(url, body, headers = {}) {
  try {
    const r = await req({ method: 'POST', url, data: body, timeout: 25000, responseType: 'arraybuffer',
      headers: { 'Content-Type': 'application/x-protobuf', 'User-Agent': UA, 'X-Player-Page-Protection': '1', ...headers }, maxRedirects: 5 });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(r.data || []);
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    throw e;
  }
}
async function getText(url) {
  try {
    const r = await req({ method: 'GET', url, headers: { 'User-Agent': UA }, timeout: 20000, responseType: 'text', maxRedirects: 5 });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.text();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
class Client {
  constructor(){this.ecdh=crypto.createECDH('prime256v1');this.ecdh.generateKeys();this.androidId=crypto.randomBytes(8).toString('hex');this.session='';this.key=null;this.booted=false;this.apis={};this.apiIds={};this.lastSearch=0;this.pending=null;}
  async ensure(){if(this.key&&this.booted)return; if(this.pending)return this.pending;this.pending=(async()=>{await this.handshake();await this.boot();})().finally(()=>{this.pending=null;});return this.pending;}
  async handshake(){const key=crypto.randomBytes(16).toString('hex');const iv=crypto.randomBytes(16);const inner=concat(pv(1,1),pv(2,1),pv(3,1));const outer=concat(pb(1,this.ecdh.getPublicKey(undefined,'uncompressed')),pb(2,'1.0.0'),pb(3,inner));const enc=crypto.createCipheriv('aes-256-cbc',Buffer.from(key),iv);const body=concat(iv,enc.update(zlib.deflateSync(outer,{level:5})),enc.final()).toString('base64');const resp=Buffer.from((await postBin(BASE,Buffer.from(body),{'X-Handshake-Key':key})).toString(),'base64');const dec=crypto.createDecipheriv('aes-256-cbc',Buffer.from(key),resp.subarray(0,16));const fields=decode(zlib.inflateSync(concat(dec.update(resp.subarray(16)),dec.final())));this.session=str(first(fields,1,2));const pub=first(fields,2,2);if(!this.session||!pub)throw Error('handshake failed');const shared=this.ecdh.computeSecret(pub);const prk=crypto.createHmac('sha256',this.session).update(shared).digest();this.key=crypto.createHmac('sha256',prk).update(concat('v2-session',Buffer.from([1]))).digest();}
  async boot(){const a=this.androidId;const info=concat(pb(1,'咕噜咕噜'),pb(2,'2.1.2'),pb(3,'com.jymqfh.xee'),pb(4,a),pb(5,'212'));const state=concat(pb(1,a),pv(2,0),pb(3,'11'),pb(4,'Pixel 4'),pb(5,'google/redfin/redfin:11/RQ3A.211001.001'),pb(6,'google'),pb(7,'redfin'),pv(8,0),pb(9,'unknown'),pb(10,'unknown'),pv(11,0),pv(12,30));const result=await this.api(1,0,concat(pb(1,'v1'),pb(2,'Android 11'),pb(3,'gulu'),pb(4,info),pb(5,state)));if(!result)throw Error('boot failed');this.booted=true;for(const [f,w,v] of decode(result.payload||Buffer.alloc(0))){if(f!==7||w!==2)continue;const x=decode(v),name=str(first(x,2,2)),url=str(first(x,3,2));if(name&&url){this.apis[name]=url;this.apiIds[name]=first(x,1,0);}}}
  async api(service,method,body=Buffer.alloc(0)){if(!this.key)throw Error('no key');if(method===61){const delay=2800-(Date.now()-this.lastSearch);if(this.lastSearch&&delay>0)await new Promise(r=>setTimeout(r,delay));this.lastSearch=Date.now();}const ts=Date.now();const inner=concat(pv(1,ts),pv(2,service),pv(3,method),pb(4,this.androidId),pb(5,Buffer.alloc(0)),pb(6,body),pv(7,ts));const nonce=crypto.randomBytes(12),enc=crypto.createCipheriv('aes-256-gcm',this.key,nonce);const blob=concat(nonce,enc.update(zlib.deflateRawSync(inner)),enc.final(),enc.getAuthTag());const raw=await postBin(BASE,concat(pv(1,ts),pb(2,blob)),{'X-Session-Id':this.session});const value=first(decode(raw),2,2);if(!value||value.length<28)throw Error('empty encrypted response');const decr=crypto.createDecipheriv('aes-256-gcm',this.key,value.subarray(0,12));decr.setAuthTag(value.subarray(value.length-16));const fields=decode(zlib.inflateRawSync(concat(decr.update(value.subarray(12,-16)),decr.final())));return {code:first(fields,2,0),payload:first(fields,4,2)};}
}
function item(raw){const f=decode(raw);return {vod_id:String(first(f,1,0)||''),vod_name:str(first(f,3,2)),vod_pic:str(first(f,6,2)),vod_remarks:str(first(f,11,2)||first(f,9,2))};}
function items(payload){const result=[];if(!payload)return result;for(const [,w,v] of decode(payload)){if(w!==2||v.length<30)continue;let sub;try{sub=decode(v);}catch{continue;}const nested=sub.filter(x=>x[0]===66&&x[1]===2);if(nested.length){for(const x of nested){const d=item(x[2]);if(d.vod_id&&d.vod_name)result.push(d);}continue;}if(first(sub,2,0)!==undefined){const d=item(v);if(d.vod_id&&d.vod_name)result.push(d);}else for(const x of sub.filter(x=>x[0]===3&&x[1]===2&&x[2].length>30)){const d=item(x[2]);if(d.vod_id&&d.vod_name)result.push(d);}}return result;}
function m66(id,page,isOrange,year='',sort=''){if(isOrange)return concat(pv(1,id),pv(2,page));let out=concat(pv(1,id),pb(2,varint(page)));if(year)out=concat(out,pb(3,year));if(sort)out=concat(out,pb(5,concat(pv(1,1),pb(2,varint(0)),pb(3,sort))));return out;}
const IS_ORANGE = true;
export default function createSpider() {
  const isOrange = IS_ORANGE;
  let client = new Client();
  const ensure = async () => { try { await client.ensure(); } catch { client = new Client(); await client.ensure(); } return client; };
  const pageOf = (b) => Math.max(1, parseInt(b?.page, 10) || 1);
  const idOf = (b) => String(Array.isArray(b?.id) ? b.id[0] : b?.id || '');
  const channel = async (id, page, year = '', sort = '') => { const c = await ensure(); const result = await c.api(3, 66, m66(id, page, isOrange, year, sort)); const list = items(result.payload); let pagecount = page + (list.length >= 2 ? 1 : 0), limit = Math.max(1, list.length), total = list.length; if (isOrange && result.payload) { const meta = first(decode(result.payload), 65, 2); if (meta) { const f = decode(meta); pagecount = first(f, 3, 0) || pagecount; limit = first(f, 2, 0) || limit; total = first(f, 4, 0) || total; } } else { const threshold = [8, 9, 10, 11, 12].includes(id) ? 10 : id === 6 ? 3 : 2; pagecount = page + (list.length >= threshold ? 1 : 0); limit = Math.max(list.length, threshold); } return { list, page, pagecount, limit, total }; };
  return {
  meta: { key: 'lee_juzi4k', name: '橘汁4K', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => { const classes = isOrange ? Object.entries(orange).map(([type_id, [type_name]]) => ({ type_id, type_name })) : cat.map(([type_id, type_name]) => ({ type_id, type_name })); const filters = {}; for (const c of classes) { if (isOrange) { const ranks = orangeRanks[c.type_id]; if (ranks) filters[c.type_id] = [{ key: 'by', name: '榜单', value: ranks.map(([v, n]) => ({ v, n })) }]; } else filters[c.type_id] = [{ key: 'year', name: '年份', value: [{ n: '全部', v: '' }, ...Array.from({ length: 12 }, (_, i) => { const v = String(2026 - i); return { n: v, v }; })] }, { key: 'by', name: '排序', value: [{ n: '最热', v: 'vod_hits_week' }, { n: '最新', v: 'vod_time' }, { n: '评分', v: 'vod_score' }] }]; } let list = []; try { list = (await channel(isOrange ? 48 : 9, 1)).list.slice(0, 24); } catch {} return { class: classes, filters, list }; });
    fastify.post('/category', async (request) => { const body = request.body || {}, page = pageOf(body), tid = String(body.id || ''), ext = body.extend || {}; let id; if (isOrange) { const entry = orange[tid]; id = entry ? Number(entry[1]) : Number(tid); const by = String(ext.by || ext.sort || ''); if (entry && orangeRanks[tid]?.some(([x]) => x === by)) id = Number(by); } else id = cat.find(([x]) => x === tid)?.[2] || Number(tid); if (!Number.isFinite(id)) return { list: [] }; return channel(id, page, String(ext.year || ''), String(ext.by || ext.sort || '')); });
    fastify.post('/detail', async (request) => { const id = Number(idOf(request.body)); if (!Number.isFinite(id)) return { list: [] }; const c = await ensure(); const r = await c.api(3, 62, concat(pv(1, id), pb(4, 'APP_PLATFORM_ANDROID_TV'), pv(5, 0))); if (!r.payload) return { list: [] }; const f = decode(r.payload), vod = { vod_id: String(id), vod_name: str(first(f, 5, 2)), vod_pic: str(first(f, 13, 2)), vod_actor: f.filter(x => x[0] === 17 && x[1] === 2).map(x => str(x[2])).slice(0, 12).join('、'), vod_director: f.filter(x => x[0] === 18 && x[1] === 2).map(x => str(x[2])).join('、'), type_name: f.filter(x => x[0] === 12 && x[1] === 2).map(x => str(x[2])).slice(0, 4).join('/'), vod_content: str(first(f, 21, 2)), vod_remarks: str(first(f, 22, 2)), vod_area: str(first(f, 28, 2)), vod_year: str(first(f, 30, 2)) }; const from = [], urls = []; for (const [, w, v] of f.filter(x => x[0] === 75 && x[1] === 2)) { const src = decode(v), name = str(first(src, 1, 2)); let episodes = []; for (const e of src.filter(x => x[0] === 2 && x[1] === 2)) { const ep = decode(e[2]), url = str(first(ep, 3, 2)); if (!url.startsWith('http') && !Object.keys(cipherNames).some(prefix => url.startsWith(prefix))) continue; episodes.push(`${str(first(ep, 4, 2)) || `第${first(ep, 1, 0) || ''}集`}$${url}`); } if (episodes.length) { from.push(lines[name] || name || '线路'); urls.push(episodes.join('#')); } } vod.vod_play_from = from.join('$$$'); vod.vod_play_url = urls.join('$$$'); return { list: [vod] }; });
    fastify.post('/search', async (request) => { const key = String(request.body?.wd || '').trim(), page = pageOf(request.body); if (!key) return { list: [] }; const c = await ensure(), sort = concat(pv(1, 1), pv(2, 0), pb(3, 'vod_hits_week')), body = concat(pb(1, key), pv(2, page), pb(5, sort)); let r = await c.api(3, 61, body); if (!r.payload || r.payload.length < 200) { await new Promise(resolve => setTimeout(resolve, 5500)); r = await c.api(3, 61, body); } const list = items(r.payload); return { list, page, pagecount: page + (list.length >= 20 ? 1 : 0), limit: Math.max(20, list.length), total: list.length }; });
    fastify.post('/play', async (request) => { let id = idOf(request.body), flag = String(request.body?.flag || ''); const header = { 'User-Agent': UA }; if (!id) return { parse: 0, url: '', header }; if (/^https?:/i.test(id)) return { parse: /\.m3u8|m\.php/.test(id) ? 0 : 1, url: id, header }; if (/^(CO4K_|rose_)/.test(id)) id = id.replace(/ /g, '+'); const name = flagNames[flag] || cipherNames[Object.keys(cipherNames).find(x => id.startsWith(x))], c = await ensure(), url = (c.apis[name] || fallback[name] || '') + encodeURIComponent(id); if (!name || !url) return { parse: 0, url: '', header }; for (let i = 0; i < 2; i++) { try { const txt = await getText(url), got = JSON.parse(txt).url || txt.match(/"url"\s*:\s*"([^"]+)/)?.[1]; if (got) return { parse: 0, url: String(got).replace(/\\\//g, '/'), header }; } catch {} } return { parse: 0, url: '', header }; });
  }
};
}
