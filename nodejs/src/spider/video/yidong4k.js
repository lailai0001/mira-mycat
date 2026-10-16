import req from '../../util/req.js';

const KEY = 'py_yidong4k';
const NAME = '移动4K';
const BASE = 'https://vidsite.cloudseekr.com';
const YN_KEY = 'PVGDwmcvfs1uV3d1';
const YN_INFO = 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getOutLinkInfoV6';
const YN_CONTENT = 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getContentInfoFromOutLink';
const HDR = {
  Origin: BASE,
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  Referer: BASE + '/vid/app/',
  'Content-Type': 'application/json; charset=utf-8'
};
const YN_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Content-Type': 'application/json;charset=UTF-8',
  Referer: 'https://yun.139.com/',
  'x-deviceinfo': '||3|12.27.0|chrome|131.0.0.0|1||windows 10|546X902|zh-CN|||',
  'hcy-cool-flag': '1',
  authorization: ''
};
const COLS = [['1','电影'],['2','电视剧'],['3','动漫']];
const VIDEO_EXT = /\.(mkv|mp4|ts|avi|rmvb|wmv|mov|webm|m3u8)$/i;

let FP = '';

// ============ 纯 JS AES-128（无外部依赖） ============
const SBOX = [
0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
const INV_SBOX = [
0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d];
const RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];
function expandKey(key){
  const w=new Array(44);
  for(let i=0;i<4;i++) w[i]=(key[4*i]<<24)|(key[4*i+1]<<16)|(key[4*i+2]<<8)|key[4*i+3];
  for(let i=4;i<44;i++){
    let t=w[i-1];
    if(i%4===0){
      t=(SBOX[(t>>>16)&0xff]<<24)|(SBOX[(t>>>8)&0xff]<<16)|(SBOX[t&0xff]<<8)|SBOX[(t>>>24)&0xff];
      t^=RCON[i/4-1]<<24;
    }
    w[i]=(w[i-4]^t)>>>0;
  }
  const rk=[];
  for(let r=0;r<11;r++){ rk[r]=[];
    for(let i=0;i<4;i++){ const x=w[r*4+i];
      rk[r].push((x>>>24)&0xff,(x>>>16)&0xff,(x>>>8)&0xff,x&0xff); } }
  return rk;
}
function xtime(a){ return ((a<<1)^((a&0x80)?0x1b:0))&0xff; }
function mixCol(s,c){
  const o=4*c,a=s[o],b=s[o+1],d=s[o+2],e=s[o+3];
  s[o]=xtime(a)^xtime(b)^b^d^e; s[o+1]=a^xtime(b)^xtime(d)^d^e;
  s[o+2]=a^b^xtime(d)^xtime(e)^e; s[o+3]=xtime(a)^a^b^d^xtime(e);
}
function gmul(a,b){ let p=0; for(let i=0;i<8;i++){ if(b&1)p^=a; const h=a&0x80; a=(a<<1)&0xff; if(h)a^=0x1b; b>>=1; } return p; }
function invMixCol(s,c){
  const o=4*c,a=s[o],b=s[o+1],d=s[o+2],e=s[o+3];
  s[o]=gmul(a,0x0e)^gmul(b,0x0b)^gmul(d,0x0d)^gmul(e,0x09);
  s[o+1]=gmul(a,0x09)^gmul(b,0x0e)^gmul(d,0x0b)^gmul(e,0x0d);
  s[o+2]=gmul(a,0x0d)^gmul(b,0x09)^gmul(d,0x0e)^gmul(e,0x0b);
  s[o+3]=gmul(a,0x0b)^gmul(b,0x0d)^gmul(d,0x09)^gmul(e,0x0e);
}
function addRK(s,rk,r){ for(let i=0;i<16;i++) s[i]^=rk[r][i]; }
function encBlock(block,rk){
  const s=block.slice(); addRK(s,rk,0);
  for(let r=1;r<=9;r++){
    for(let i=0;i<16;i++) s[i]=SBOX[s[i]];
    for(let i=1;i<4;i++){ const t=[s[i],s[i+4],s[i+8],s[i+12]];
      for(let j=0;j<4;j++) s[i+4*j]=t[(j+i)%4]; }
    for(let c=0;c<4;c++) mixCol(s,c);
    addRK(s,rk,r);
  }
  for(let i=0;i<16;i++) s[i]=SBOX[s[i]];
  for(let i=1;i<4;i++){ const t=[s[i],s[i+4],s[i+8],s[i+12]];
    for(let j=0;j<4;j++) s[i+4*j]=t[(j+i)%4]; }
  addRK(s,rk,10);
  return s;
}
function decBlock(block,rk){
  const s=block.slice(); addRK(s,rk,10);
  for(let r=9;r>=1;r--){
    for(let i=1;i<4;i++){ const t=[s[i],s[i+4],s[i+8],s[i+12]];
      for(let j=0;j<4;j++) s[i+4*j]=t[(j-i+4)%4]; }
    for(let i=0;i<16;i++) s[i]=INV_SBOX[s[i]];
    addRK(s,rk,r);
    for(let c=0;c<4;c++) invMixCol(s,c);
  }
  for(let i=1;i<4;i++){ const t=[s[i],s[i+4],s[i+8],s[i+12]];
    for(let j=0;j<4;j++) s[i+4*j]=t[(j-i+4)%4]; }
  for(let i=0;i<16;i++) s[i]=INV_SBOX[s[i]];
  addRK(s,rk,0);
  return s;
}
function utf8Enc(str){
  if(typeof TextEncoder!=='undefined') return Array.from(new TextEncoder().encode(str));
  const out=[]; let i=0;
  while(i<str.length){ let c=str.charCodeAt(i++);
    if(c<0x80) out.push(c);
    else if(c<0x800) out.push(0xc0|(c>>6),0x80|(c&0x3f));
    else if(c>=0xd800&&c<0xdc00){ const l=str.charCodeAt(i++); const cp=0x10000+((c-0xd800)<<10)+(l-0xdc00);
      out.push(0xf0|(cp>>18),0x80|((cp>>12)&0x3f),0x80|((cp>>6)&0x3f),0x80|(cp&0x3f)); }
    else out.push(0xe0|(c>>12),0x80|((c>>6)&0x3f),0x80|(c&0x3f)); }
  return out;
}
function utf8Dec(bytes){
  if(typeof TextDecoder!=='undefined') return new TextDecoder().decode(new Uint8Array(bytes));
  let s='',i=0;
  while(i<bytes.length){ const c=bytes[i++];
    if(c<0x80) s+=String.fromCharCode(c);
    else if(c<0xe0){ const d=bytes[i++]; s+=String.fromCharCode(((c&0x1f)<<6)|(d&0x3f)); }
    else if(c<0xf0){ const d=bytes[i++],e=bytes[i++]; s+=String.fromCharCode(((c&0x0f)<<12)|((d&0x3f)<<6)|(e&0x3f)); }
    else { const d=bytes[i++],e=bytes[i++],f=bytes[i++]; let cp=((c&0x07)<<18)|((d&0x3f)<<12)|((e&0x3f)<<6)|(f&0x3f);
      cp-=0x10000; s+=String.fromCharCode(0xd800+(cp>>10),0xdc00+(cp&0x3ff)); } }
  return s;
}
function b64Enc(bytes){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s='',i=0;
  while(i<bytes.length){ const a=bytes[i++],b=bytes[i++],c=bytes[i++];
    s+=chars[a>>2]+chars[((a&3)<<4)|(b===undefined?0:b>>4)];
    s+=b===undefined?'=':chars[((b&15)<<2)|(c===undefined?0:c>>6)];
    s+=c===undefined?'=':chars[c&63]; }
  return s;
}
function b64Dec(str){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean=String(str).replace(/\s+/g,''); const out=[];
  for(let i=0;i<clean.length;i+=4){
    const a=chars.indexOf(clean[i]),b=chars.indexOf(clean[i+1]);
    const c=clean[i+2]==='='?-1:chars.indexOf(clean[i+2]),d=clean[i+3]==='='?-1:chars.indexOf(clean[i+3]);
    if(a<0||b<0) break;
    out.push((a<<2)|(b>>4));
    if(c>=0) out.push(((b&15)<<4)|(c>>2));
    if(d>=0) out.push(((c&3)<<6)|d);
  }
  return out;
}
function aesCbcEncrypt(plainBytes,keyBytes){
  const rk=expandKey(keyBytes);
  const iv=[]; for(let i=0;i<16;i++) iv.push(Math.floor(Math.random()*256));
  const data=plainBytes.slice();
  const pad=16-(data.length%16); for(let i=0;i<pad;i++) data.push(pad);
  let prev=iv.slice(); const out=iv.slice();
  for(let o=0;o<data.length;o+=16){
    const blk=[]; for(let i=0;i<16;i++) blk.push(data[o+i]^prev[i]);
    const enc=encBlock(blk,rk); for(const b of enc) out.push(b); prev=enc;
  }
  return out;
}
function aesCbcDecrypt(cipherBytes,keyBytes,ivBytes){
  const rk=expandKey(keyBytes); const out=[]; let prev=ivBytes.slice();
  for(let o=0;o<cipherBytes.length;o+=16){
    const blk=cipherBytes.slice(o,o+16); if(blk.length<16) break;
    const dec=decBlock(blk,rk);
    for(let i=0;i<16;i++) out.push(dec[i]^prev[i]);
    prev=blk;
  }
  const pad=out[out.length-1];
  if(pad>0&&pad<=16) return out.slice(0,out.length-pad);
  return out;
}
// 139 AES: 加密=随机16字节IV前置+CBC加密后base64；解密=base64解后前16字节为IV
function ynEnc(text){
  return b64Enc(aesCbcEncrypt(utf8Enc(text), utf8Enc(YN_KEY)));
}
function ynDec(text){
  try{
    const raw=b64Dec(text);
    return utf8Dec(aesCbcDecrypt(raw.slice(16), utf8Enc(YN_KEY), raw.slice(0,16)));
  }catch(e){ return ''; }
}
// 139 接口响应常被截断，尝试补尾修复
function ynParse(s){
  if(!s) return null;
  try{ return JSON.parse(s); }catch(e){}
  for(const t of ['":""}}','":""}']){
    try{ return JSON.parse(s+t); }catch(e){}
  }
  return null;
}

// ============ 双通道请求 ============
async function postJson(url, data, headers){
  try{
    const r = await req.post(url, data, { headers: headers || {}, timeout: 22000, responseType: 'json' });
    const d = (r && r.data !== undefined) ? r.data : r;
    if(d !== undefined && d !== null) return d;
    throw new Error('empty');
  }catch(e){
    const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(), 22000);
    try{
      const r = await fetch(url, { method: 'POST', headers: headers || {}, body: JSON.stringify(data), signal: ctl.signal });
      return await r.json();
    }finally{ clearTimeout(timer); }
  }
}
// 139 接口：body 为 base64 文本，返回 base64 文本
async function ynPostRaw(url, bodyText){
  try{
    const r = await req.post(url, bodyText, { headers: YN_HDR, timeout: 45000, responseType: 'text' });
    const d = (r && r.data !== undefined) ? r.data : r;
    if(typeof d === 'string' && d) return d;
    throw new Error('empty');
  }catch(e){
    const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(), 45000);
    try{
      const r = await fetch(url, { method: 'POST', headers: YN_HDR, body: bodyText, signal: ctl.signal });
      return await r.text();
    }catch(e2){ return ''; }finally{ clearTimeout(timer); }
  }
}
async function ynCall(url, payloadObj){
  const raw = await ynPostRaw(url, ynEnc(JSON.stringify(payloadObj)));
  if(!raw) return {};
  return ynParse(ynDec(raw)) || {};
}

// 递归展开 139 分享目录
async function ynWalk(link, caID, dirName, out, depth, seen){
  if(out.length >= 300) return;
  const r = await ynCall(YN_INFO, { getOutLinkInfoReq: {
    account: '', linkID: link, passwd: '', caSrt: 1, coSrt: 1, srtDr: 0,
    bNum: 1, pCaID: caID, eNum: 200 } });
  const d = (r && r.data) || {};
  for(const co of d.coLst || []){
    const nm = co.coName || '';
    if(!VIDEO_EXT.test(nm)) continue;
    if(out.length >= 300) return;
    out.push({ name: nm, url: co.presentURL || '', parent: dirName });
  }
  if(depth >= 3) return;
  let n = 0;
  for(const ca of d.caLst || []){
    if(n++ >= 12 || out.length >= 300) break;
    const cid = ca.caID || '';
    if(!cid || seen.has(cid)) continue;
    seen.add(cid);
    await ynWalk(link, cid, ca.caName || '', out, depth + 1, seen);
  }
}
// 分享链接 -> 第一个可播直链（兜底）
async function ynResolveFirst(shareUrl){
  const m = /\/i\/([A-Za-z0-9]+)/.exec(shareUrl || '');
  if(!m) return '';
  const link = m[1];
  const r = await ynCall(YN_INFO, { getOutLinkInfoReq: {
    account: '', linkID: link, passwd: '', caSrt: 0, coSrt: 0, srtDr: 1,
    bNum: 1, pCaID: 'root', eNum: 200 } });
  const d = (r && r.data) || {};
  for(const co of d.coLst || []){
    const u = co.presentURL || '';
    if(/^https?:\/\//i.test(u)) return u;
  }
  let n = 0;
  for(const ca of d.caLst || []){
    if(n++ >= 6) break;
    const cid = ca.caID; if(!cid) continue;
    const r2 = await ynCall(YN_INFO, { getOutLinkInfoReq: {
      account: '', linkID: link, passwd: '', caSrt: 1, coSrt: 1, srtDr: 0,
      bNum: 1, pCaID: cid, eNum: 200 } });
    const d2 = (r2 && r2.data) || {};
    for(const co of d2.coLst || []){
      const u = co.presentURL || '';
      if(/^https?:\/\//i.test(u)) return u;
    }
  }
  return '';
}

function epName(name){
  const base = String(name).replace(/\.\w+$/, '');
  let m = /[Ee](\d{1,3})(?!\d)/.exec(name);
  if(m) return '第' + parseInt(m[1], 10) + '集';
  const nums = []; const re = /\d+/g; let mm;
  while((mm = re.exec(base))){
    const before = mm.index > 0 ? base[mm.index - 1] : '';
    if(mm[0].length <= 3 && !/\d/.test(before)) nums.push(parseInt(mm[0], 10));
  }
  if(nums.length) return '第' + nums[nums.length - 1] + '集';
  return base;
}
function card(x){
  return {
    vod_id: String(x.id ?? ''),
    vod_name: x.title || '',
    vod_pic: x.appCoverUrl || '',
    vod_remarks: ''
  };
}
function randHex(n){
  let s = '';
  const h = '0123456789abcdef';
  for(let i = 0; i < n; i++) s += h[Math.floor(Math.random() * 16)];
  return s;
}

async function init(){
  FP = randHex(32);
  try{ await postJson(BASE + '/vidsite/vs/addAccessRecord', { fprint: FP, deviceType: 1 }, HDR); }catch(e){}
  return {};
}

async function home(){
  const cls = COLS.map(([id, name]) => ({ type_id: id, type_name: name }));
  let list = [];
  try{
    const d = await postJson(BASE + '/vidsite/vs/qryPageColumnVideo',
      { columnId: 1, cateIdList: [0,0,0], pageIndex: 1, pageSize: 12 }, HDR);
    list = (((d && d.data) || {}).list || []).map(card);
  }catch(e){}
  return { class: cls, filters: {}, list };
}

async function category(reqIn){
  const body = (reqIn && reqIn.body) || {};
  const tid = parseInt(body.tid ?? body.type_id ?? 1, 10) || 1;
  const pg = parseInt(body.pg ?? body.page ?? 1, 10) || 1;
  let d = {};
  try{
    d = await postJson(BASE + '/vidsite/vs/qryPageColumnVideo',
      { columnId: tid, cateIdList: [0,0,0], pageIndex: pg, pageSize: 9 }, HDR);
  }catch(e){}
  const data = (d && d.data) || {};
  const list = (data.list || []).map(card);
  return {
    page: pg,
    pagecount: Math.max(1, parseInt(data.pages, 10) || 1),
    limit: 9,
    total: parseInt(data.total, 10) || list.length,
    list
  };
}

async function detail(reqIn){
  const body = (reqIn && reqIn.body) || {};
  const vid = String(body.id ?? body.vod_id ?? '').split(',')[0];
  if(!FP) await init();
  let d = {};
  try{
    d = await postJson(BASE + '/vidsite/vs/qryVideoDetail',
      { videoId: parseInt(vid, 10) || 0, fprint: FP }, HDR);
  }catch(e){}
  const data = (d && d.data) || {};
  if(!data || !data.title) return { list: [] };
  const resUrl = data.resUrl || '';
  const m = /\/i\/([A-Za-z0-9]+)/.exec(resUrl);
  let episodes = '';
  if(m){
    const files = [];
    try{ await ynWalk(m[1], 'root', '', files, 0, new Set()); }catch(e){}
    const parents = new Set(files.map(f => f.parent).filter(Boolean));
    const needPre = parents.size > 1;
    const lines = [];
    for(const f of files){
      let nm = epName(f.name);
      if(needPre && f.parent){
        const pm = /^.*?([\u4e00-\u9fa5\w·\s]{2,20})$/.exec(f.parent || '');
        const pre = pm ? pm[1].trim() : (f.parent || '');
        nm = pre + '·' + nm;
      }
      if(f.url) lines.push(nm + '$' + f.url);
      else if(resUrl) lines.push(nm + '$url:' + resUrl);
    }
    episodes = lines.join('#');
  }
  return { list: [{
    vod_id: vid,
    vod_name: data.title || vid,
    vod_pic: data.appCoverUrl || '',
    vod_year: '',
    vod_actor: data.actor || '',
    vod_director: data.director || '',
    vod_content: data.remark || '',
    vod_play_from: '移动云盘',
    vod_play_url: episodes || ('正片$url:' + resUrl)
  }] };
}

async function play(reqIn){
  const body = (reqIn && reqIn.body) || {};
  const raw = String(body.id ?? body.url ?? '');
  let u = raw;
  if(raw.indexOf('url:') === 0){
    const share = raw.slice(4);
    u = await ynResolveFirst(share) || share;
  }
  return {
    parse: 0,
    url: u,
    header: { 'User-Agent': YN_HDR['User-Agent'], Referer: 'https://yun.139.com/' }
  };
}

async function search(reqIn){
  const body = (reqIn && reqIn.body) || {};
  const wd = body.wd ?? body.key ?? '';
  const pg = parseInt(body.pg ?? body.page ?? 1, 10) || 1;
  let d = {};
  try{
    d = await postJson(BASE + '/vidsite/vs/qryPageColumnVideo',
      { columnId: 0, cateIdList: [0,0,0], pageIndex: pg, pageSize: 9, searchKey: wd }, HDR);
  }catch(e){}
  const data = (d && d.data) || {};
  const list = (data.list || []).map(card);
  return {
    page: pg,
    pagecount: Math.max(1, parseInt(data.pages, 10) || 1),
    limit: 9,
    total: parseInt(data.total, 10) || list.length,
    list
  };
}

export default function createSpider(){
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    }
  };
}
