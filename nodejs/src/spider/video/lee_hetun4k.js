import req from '../../util/req.js';
import crypto from 'crypto';
// 河豚4K（LeeCatPaw lee_hetun4k 移植）：直连站方 protobuf API（域名由 COS 上的 az1.txt 发现）；
// RSA 握手 + AES 会话，与 bundle 原实现一致。randomUUID 改为等价的 randomBytes hex（猫端稳妥）。
const cfg={appName:'河豚',publicKey:'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCr8SzZhjYy+rsya1K09t8d2K50pWFoBkgUqMpKOiW+3IEVKd4eTdvg9RSOjQ82kypL6R9BnsmrS1V8s4PVDwjQbUtYhTPPC9Hz16qY7rpD6m0d2vr09/UpWQ5uOy9PR0QTrsioveZ+DIe9jc3C+zBCu/kZSY/R8stwJoiitki3gwIDAQAB',mSafeCode:'V04XQZNYRWN6T0JODZFIAG5CTZB3PT0=',dataIv:'OC1A06E197EF10CF3F6058CA7A803B5E',pkg:'com.djlxxl.xcydzkj',host:'https://az1-1456692500.cos.ap-guangzhou.myqcloud.com/az1.txt',vName:'7.0.0.2'};
let host='',dynamicKey='',loading=null;
const cat=(...a)=>Buffer.concat(a.map(x=>Buffer.isBuffer(x)?x:Buffer.from(x)));
function vi(n){let v=BigInt(n),out=[];do{let b=Number(v&127n);v>>=7n;out.push(b|(v?128:0));}while(v);return Buffer.from(out);}
const pi=(f,v)=>cat(vi(f*8),vi(v));
const pb=(f,v)=>{const b=Buffer.isBuffer(v)?v:Buffer.from(String(v));return cat(vi(f*8+2),vi(b.length),b);};
function fields(b){const o={};let p=0;const read=()=>{let n=0n,s=0n;while(p<b.length){const x=b[p++];n|=BigInt(x&127)<<s;if(!(x&128))return Number(n);s+=7n;}throw Error('bad varint');};while(p<b.length){const tag=read(),f=tag>>3,w=tag&7;let v;if(w===0)v=read();else if(w===2){const len=read();v=b.subarray(p,p+len);p+=len;}else if(w===1){v=b.subarray(p,p+8);p+=8;}else if(w===5){v=b.subarray(p,p+4);p+=4;}else throw Error('bad wire');(o[f]??=[]).push(v);}return o;}
const one=(o,f,d='')=>o?.[f]?.[0]??d;
const str=v=>Buffer.isBuffer(v)?v.toString('utf8'):String(v??'');
const random=n=>crypto.randomBytes(n).toString('base64').replace(/[^a-zA-Z0-9]/g,'').padEnd(n-1,'A').slice(0,n-1)+'=';
function aes(text,key,mode='ecb',decrypt=false,encoding='base64'){const alg=`aes-${Buffer.byteLength(key)*8}-${mode}`,k=Buffer.from(key),iv=mode==='cbc'?k:null,c=decrypt?crypto.createDecipheriv(alg,k,iv):crypto.createCipheriv(alg,k,iv),data=decrypt?Buffer.from(text,encoding):Buffer.from(text);return cat(c.update(data),c.final());}
function rsa(text,key){const pk=crypto.createPublicKey({key:Buffer.from(key,'base64'),format:'der',type:'spki'});return crypto.publicEncrypt({key:pk,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(text)).toString('base64');}
async function request(url,method='GET',body,headers={}){
  try {
    const r = await req({ method, url, headers, data: body, timeout: 18000, responseType: 'arraybuffer', maxRedirects: 5 });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(r.data || []);
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    throw e;
  }
}
async function init(){if(host)return; if(loading)return loading;loading=(async()=>{const data=JSON.parse((await request(cfg.host)).toString('utf8'));host=String(data.domain||'').replace(/\/$/,'');if(!host)throw Error('missing host');try{const ts=Date.now(),r=random(16),body=cat(pi(1,ts),pb(2,rsa(String(ts)+r,cfg.publicKey)),pb(3,random(16)),pb(4,r),pb(5,random(16)));const f=fields(one(fields(await post('/api/v5/find/app/zone',body)),3,Buffer.alloc(0)));dynamicKey=[2,3,4,5].map(x=>str(one(f,x))).join('');}catch{dynamicKey='';}})().finally(()=>loading=null);return loading;}
function headers(protobuf=true){const ts=Date.now(),r=random(16),uid=crypto.randomBytes(16).toString('hex').toUpperCase(),vapp=cfg.vName.replace(/\./g,'');const device={country:'CN',vName:cfg.vName,cpuId:'MT6893Z%2FCZA',young:0,facturer:'Xiaomi',pkg:cfg.pkg,uuid:uid,resolution:'1080x2272',mac:'02%3A00%3A00%3A00%3A00%3A00',abid:'397',model:'M2012K11AC',plat:'android',udid:uid,dpi:'440',net:'1',lang:'zh',brand:'Xiaomi',density:'2.75',appName:cfg.appName,cpu:'arm64-v8a',chid:'10000',carrier:'%E8%81%94%E9%80%9A',_vOsCode:30,vOs:'11',v:1,tenantId:'',vApp:vapp,device:0,androidID:uid.toLowerCase().slice(0,16)};device.sig=rsa(String(ts)+r+vapp,dynamicKey||cfg.publicKey);device.random_str=r;device.timestamp=ts;const sig=aes(String(ts)+r,cfg.dataIv).toString('base64');device.sig2=sig.slice(0,8);device.sig3=sig.slice(8);const params=aes(JSON.stringify(device),'ed5fdsgucxumegqa','cbc').toString('hex');return {'User-Agent':'okhttp/3.12.1',Accept:protobuf?'application/x-protobuf':'application/json','Content-Type':protobuf?'application/x-protobuf':'application/json; charset=utf-8',publicParams:JSON.stringify({paramsData:params})};}
function secure(params){const ts=Date.now(),r=random(8),fake=random(20),query=Object.entries(params).filter(([,v])=>v!==null&&v!==undefined&&String(v)!=='').map(([k,v])=>`${k}=${v}`).join('&'),encrypted=r+aes(query+ts,cfg.mSafeCode).toString('base64');return cat(pb(1,encrypted.slice(0,20)),pb(2,encrypted.slice(20)),pb(3,fake),pi(4,ts),pb(5,r));}
async function post(path,body){if(!host)throw Error('host unavailable');return request(host+path,'POST',body,headers());}
async function api(path,params){await init();return fields(one(fields(await post(path,secure(params))),3,Buffer.alloc(0)));}
async function json(path){await init();return JSON.parse((await request(host+path,'GET',undefined,headers(false))).toString('utf8'));}
function cover(raw){if(!Buffer.isBuffer(raw)||!raw.length)return '';const f=fields(raw);return str(one(f,2)||one(f,1));}
function drama(raw){const f=fields(raw);return {vod_id:String(one(f,3,0)),vod_name:str(one(f,5)),vod_pic:cover(one(f,2)),vod_remarks:str(one(f,13)),vod_year:String(one(f,14,'')),vod_area:str(one(f,1))};}
const idOf=b=>String(Array.isArray(b?.id)?b.id[0]:b?.id||'');
const pageOf=b=>Math.max(1,parseInt(b?.page,10)||1);
export default function createSpider() {
  return {
  meta: { key: 'lee_hetun4k', name: '河豚4K', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => { const d = await json('/api/v3/drama/getCategory?orderBy=type_id'); return { class: (d.data || []).filter(x => x.name !== '公告' && x.id).map(x => ({ type_id: String(x.id), type_name: String(x.name || '') })) }; });
    fastify.post('/category', async (req) => { const b = req.body || {}, page = pageOf(b), e = b.extend || {}, f = await api('/api/proto/v5/drama/category', { pagesize: '21', typeId1: String(b.id || ''), page: String(page), vodOrderBy: e['排序'] || '最新', vodArea: e['地区'] || '', vodLang: e['语言'] || '', vodClass: e['类型'] || '', vodYear: e['年份'] || '' }); const list = (f[1] || []).map(drama); return { list, page, pagecount: list.length ? 9999 : page, limit: 21, total: list.length ? 9999 : 0 }; });
    fastify.post('/detail', async (req) => { const id = idOf(req.body), f = await api('/api/proto/v5/drama/getDetail', { id }); const grouped = new Map(); for (const raw of f[29] || []) { const x = fields(raw), title = str(one(x, 2)) || '播放', path = str(one(x, 4)), source = str(one(x, 9)), quality = str(one(x, 10)) || source || '未知', name = source && quality !== source ? `${quality} (${source})` : quality, stream = /\.(?:mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(?:\?.*)?$/i.test(path), token = stream ? path : Buffer.from(JSON.stringify({ vodPlayFrom: source, playUrl: path })).toString('base64'); if (!grouped.has(name)) grouped.set(name, []); grouped.get(name).push(`${title}$${token}`); } const order = ['蓝光4k', '蓝光'], names = [...grouped.keys()].sort((a, b) => { const ai = order.findIndex(x => a.toLowerCase().includes(x.toLowerCase())), bi = order.findIndex(x => b.toLowerCase().includes(x.toLowerCase())); return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi); }); const vod = { vod_id: id, vod_name: str(one(f, 9)), vod_pic: cover(one(f, 2)), vod_actor: str(one(f, 25)), vod_director: str(one(f, 12)), vod_area: str(one(f, 1)), vod_year: String(one(f, 18, '')), vod_remarks: str(one(f, 26)), vod_content: str(one(f, 6)), vod_play_from: names.join('$$$'), vod_play_url: names.map(x => grouped.get(x).join('#')).join('$$$') }; return { list: [vod] }; });
    fastify.post('/search', async (req) => { const f = await api('/api/proto/v5/drama/search', { searchKeys: String(req.body?.wd || ''), page: String(pageOf(req.body)), pagesize: '21' }); return { list: (f[1] || []).slice(0, 1).map(drama) }; });
    fastify.post('/play', async (req) => { const id = idOf(req.body); if (/\.(?:mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(?:\?.*)?$/i.test(id)) return { parse: 0, url: id, header: {} }; let params; try { params = JSON.parse(Buffer.from(id, 'base64').toString('utf8')); } catch { return { parse: 1, url: id, header: {} }; } const f = await api('/api/proto/v5/videoUsableUrl', params), header = {}; for (const raw of f[6] || []) { const x = fields(raw), key = str(one(x, 1)); if (key) header[key] = str(one(x, 2)); } return { parse: 0, url: str(one(f, 1)), header }; });
  }
};
}
