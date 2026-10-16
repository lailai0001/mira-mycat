import req from '../../util/req.js';
import crypto from 'crypto';

const KEY = 'py_juzi';
const NAME = '橘汁';

// 黑盒提取自 Yswag/xptv-extensions jstv 分支混淆包 (juzhi 模块)
// 协议: RSA 握手 -> AES-192-ECB + 自定义 protobuf
// 服务器: https://juziapp.hzhcbkj.cn

// ===== Shims =====
const M = (t,e)=>()=>(t&&(e=t(t=0)),e);
function st() {}

// Z: HTTP 客户端 (axios 风格, 基于框架 req)
// 双通道: 优先 req, 超时或失败时用 fetch 兜底 (MiraPlayer App 内无原生 fetch, 但 Node 环境有)
const Z = {
  async post(url, data, config) {
    config = config || {};
    const headers = Object.assign({}, config.headers || {});
    const timeout = config.timeout || 25000;
    // 先试 req (axios)
    try {
      const resp = await req.post(url, data, {
        headers: headers,
        timeout: timeout,
        responseType: 'arraybuffer',
      });
      let d = resp.data;
      if (d && typeof Buffer !== 'undefined' && !(d instanceof Buffer) && d instanceof ArrayBuffer) {
        d = Buffer.from(d);
      }
      return { data: d, status: resp.status, headers: resp.headers || {} };
    } catch(e) {
      // req 失败, 试 fetch (如果可用)
      if (typeof fetch !== 'undefined') {
        const resp = await fetch(url, {
          method: 'POST', headers: headers, body: data,
          signal: AbortSignal.timeout(timeout),
        });
        const buf = typeof Buffer !== 'undefined' ? Buffer.from(await resp.arrayBuffer()) : await resp.arrayBuffer();
        return { data: buf, status: resp.status, headers: {} };
      }
      throw e;
    }
  },
  async get(url, config) {
    config = config || {};
    const timeout = config.timeout || 25000;
    try {
      const resp = await req.get(url, {
        headers: config.headers || {},
        timeout: timeout,
      });
      let data = resp.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) {}
      }
      return { data: data, status: resp.status, headers: resp.headers || {} };
    } catch(e) {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch(url, {
          method: 'GET', headers: config.headers || {},
          signal: AbortSignal.timeout(timeout),
        });
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch(e2) { data = text; }
        return { data: data, status: resp.status, headers: {} };
      }
      throw e;
    }
  }
};

// require shim (提取代码内 wa=require("node:crypto"))
function require(name) {
  if (name === 'node:crypto' || name === 'crypto') return crypto;
  throw new Error('Cannot find module: ' + name);
}
// wa 由提取代码内的 require("node:crypto") 赋值

// ===== 提取的橘汁代码 =====
function xC(){let t=["GbvQo","TFYhD","error","VnzZc","ouhFU","vodLang","KJWKW","OMmLa","DMLIL","timestamp","dWhpZ","aes-192","android","vGBdx","isBuffer","8201445ksKaws","3.0.2.4","[juzhi] detail error:","pVkig","14239494fVwzwl","body","IOepi","xuYxX","bigint","1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz","concat","sig2","qwPyp","mZDRt","FBdsI","JPpOq","090DA8F91D3F60CC6CB250D86F06FE12","iIBKK","ihsLs","######","WbXBv","isView","RlnMT","sig","KCObY","tgYJY","ufkrP","LPmhQ","OtIez","pagesize","test","application/json","/detail","aes-256","TSzjZ","[juzhi] GET failed:","[juzhi] category error:","mPkZF","GyoGF","hex","toString","sBWig","floor","length","/api/v5/find/app/zone","MMszY","sJQbN","nwVgA","name","UzrgJ","jsJvY","kpPBO","juzhi","ruprP","LjucF","xEZKa","vngoC","CAbTf","485760Eilkrz","[juzhi] home error:","get","AzLaG","split","397","searchKeys","substring","cxtal","from","/api/proto/v5/videoUsableUrl","hwoiw","IhhYJ","kAowT","bZcbe",">>>+++","XDpCF","VBzls","[juzhi] search error:","/api/proto/v5/drama/getDetail","iocwC","%E8%81%94%E9%80%9A","message","440","buffer","update","https://123-1349250429.cos.ap-shanghai.myqcloud.com/app.txt","class","charAt","jeHQt","42UXtRjh","AcLQY","sig3","inWZe","308yWgyMI","[juzhi] handshake failed (fallback to static key):","arraybuffer","now","xdAkR","ed5fdsgucxumegqa","YdyvL","drKKu","sLlaz","COGOW","alloc","-cbc","cjeOu","lbmDO","/api/proto/v5/drama/category","hmSrD","vpfqJ","tnMTu","[juzhi] resolve host failed:","lang","ghibm","/api/proto/v5/drama/search","domain","1188wNcEDu","1080x2272","okhttp/3.12.1","qPegk","vodYear","qWZdw","year","extend_sort","fGEss","string","Xiaomi","kLVxU","header","mSxct","filters","3023","MlNnd","parse","toUpperCase","vodOrderBy","object","final","EbUxb","push","SfkqK","HACAJ","QueZP","UCUEU","data","6901ALEpjx","Vwoyw","eWWPb","keys","filter","zrYPA","HttNe","/api/v3/drama/getCategory?orderBy=type_id","HiYnz","RSA_PKCS1_PADDING","8gxssRN","ylKuy","byteLength","jaWLB","converUrl","ApWWz","com.mxj.wylcjbxyx",`$&
`,"tdTpO","10000","[juzhi] play error:","OMiAa","/home","15075fcDwmn","02%3A00%3A00%3A00%3A00%3A00","14026276uvmmRD","utf8","qWREQ","EaLFQ","KMfVn","replace","/category","RERUw","xIFDD","IohLv","latin1","gMvYU","oWppA","VzJcX","gjzzu","area","application/x-protobuf","$$$","base64","has","dsbrm","jozoF","/init","DpUGg","[juzhi] POST failed ","DBEUR","cBWEJ","DtXbj","set","UfFTJ","nTZAy","page","post","stringify","3DADB42485B7F864E766479ADA6B1176D81D8D73","qdJRA","lbwPf","bzjYY","subarray","Tavpj","bzZKk","VfYRo","44127yHNFXg","random_str","npDII","MT6893Z%2FCZA","vodClass","application/json; charset=utf-8","eCZJh"];return xC=function(){return t},xC()}function nf(t){let e=Ye;return{VnzZc:function(n,i){return n==i}}[e(378)](t,null)?"":String(t)[e(564)](/^\s+|\s+$/g,"")}function Ukt(t,e){return(nf(t)||e||"").replace(/\$/g," ").replace(/#/g," ")}function $kt(t){let e=Ye;return nf(t)[e(564)](/<[^>]+>/g,"")}function T_e(t){let e=Ye;return String(t??"")[e(564)](/&amp;/g,"&")[e(564)](/&lt;/g,"<")[e(564)](/&gt;/g,">")[e(564)](/&quot;/g,'"')[e(564)](/&#0?39;/g,"'")[e(564)](/&#x27;/gi,"'")}function ib(t){let e=Ye,r={tdTpO:function(i,s){return i<s},MMszY:function(i,s){return i*s}},n="";for(let i=0;r[e(552)](i,t-1);i++)n+=b_e[e(476)](Math[e(432)](r[e(435)](Math.random(),b_e.length)));return n+"="}function k_e(t){let e=Ye,r={gjzzu:"5|3|1|2|4|0",ZJGkL:function(s,o){return s instanceof o},rTdxM:e(514)},n=r[e(573)][e(452)]("|"),i=0;for(;;){switch(n[i++]){case"0":return Buffer.alloc(0);case"1":if(r.ZJGkL(t,ArrayBuffer))return Buffer.from(t);continue;case"2":if(ArrayBuffer[e(411)](t))return Buffer[e(457)](t[e(472)],t.byteOffset,t[e(546)]);continue;case"3":if(Buffer[e(389)](t))return t;continue;case"4":if(typeof t===r.rTdxM)return Buffer.from(t,e(569));continue;case"5":if(!t)return Buffer[e(492)](0);continue}break}}function A_e(t){let e=Ye,r={pVkig:function(n,i){return n===i},Tavpj:"aes-128",ruprP:e(423)};return r[e(393)](t.length,16)?r[e(365)]:t[e(433)]===24?e(386):r[e(443)]}function g$(t,e){let r=Ye,n={Vwoyw:function(o,a){return o==a},jsJvY:"utf8",kLVxU:function(o,a){return o(a)}},i=Buffer[r(457)](String(n[r(535)](e,null)?"":e),n[r(440)]),s=(0,wa.createCipheriv)(n[r(516)](A_e,i)+"-ecb",i,null);return Buffer[r(400)]([s[r(473)](String(n[r(535)](t,null)?"":t),r(560)),s.final()])[r(430)](r(577))}function C_e(t,e){let r=Ye,n={TFYhD:function(o,a){return o==a},JPpOq:r(560),OSUDN:function(o,a){return o(a)},bzZKk:r(429)},i=Buffer[r(457)](String(n[r(376)](e,null)?"":e),n[r(405)]),s=(0,wa.createCipheriv)(A_e(i)+r(493),i,i);return Buffer[r(400)]([s[r(473)](n.OSUDN(String,n.TFYhD(t,null)?"":t),r(560)),s[r(526)]()]).toString(n[r(366)])}function I_e(t,e){let r=Ye,n={xdAkR:function(o,a){return o(a)},AhYjR:function(o,a){return o==a},USSyZ:function(o,a){return o+a},SfkqK:function(o,a){return o+a},VzJcX:function(o,a,c){return o(a,c)},bQMNL:function(o,a){return o(a)}},i=n[r(486)](String,n.AhYjR(e,null)?"":e)[r(564)](/\s+/g,""),s=n.USSyZ(n[r(529)](`-----BEGIN PUBLIC KEY-----
`,i[r(564)](/.{1,64}/g,r(551))),"-----END PUBLIC KEY-----");return n[r(572)](wa.publicEncrypt,{key:s,padding:wa.constants[r(543)]},Buffer[r(457)](n.bQMNL(String,n.AhYjR(t,null)?"":t),"utf8"))[r(430)]("base64")}function Hkt(){let t=Ye,e={TsadC:function(o,a){return o+a},nwVgA:function(o,a){return o+a},SlEYN:t(409),xuYxX:t(560),aFWSb:function(o,a){return o-a}},r=p$[t(564)](/\./g,""),n=e.TsadC(e[t(437)](e.TsadC(Nkt,e.SlEYN)+Rkt+"~~~~~~"+w_e,t(463)),r),i=g$(n,Okt),s=Buffer[t(457)](i,e[t(397)])[t(430)](t(577));return(s.substring(0,16)+s.substring(e.aFWSb(s[t(433)],16)))[t(523)]()}function b$(t,e){let r=Ye,n={YdyvL:function(s,o){return s===o},xIFDD:function(s,o){return s(o)},DpUGg:function(s,o){return s&o}},i=n[r(488)](typeof e,r(398))?e:BigInt(Math[r(432)](Number(e)||0));for(;;){let s=n[r(567)](Number,n[r(582)](i,0x7fn));if(i>>=0x7n,i===0x0n){t[r(528)](s);break}t[r(528)](s|128)}}function P_e(t,e,r){({bzjYY:function(s,o,a){return s(o,a)}})[Ye(363)](b$,t,BigInt(e*8+r))}function rf(t,e,r){let n=Ye,i={EaLFQ:n(560),AzLaG:function(o,a,c,u){return o(a,c,u)}},s=Buffer[n(457)](String(r??""),i[n(562)]);i[n(451)](P_e,t,e,2),b$(t,s.length);for(let o of s)t[n(528)](o)}function N_e(t,e,r){let n=Ye,i={OtIez:function(s,o,a,c){return s(o,a,c)},eCZJh:function(s,o,a){return s(o,a)}};i[n(418)](P_e,t,e,0),i[n(374)](b$,t,r)}function h$(t,e){let r={wzQfh:function(s,o){return s<<o},DZbFu:function(s,o){return s(o)},ggtpG:function(s,o){return s&o}},n=0x0n,i=0x0n;for(;;){let s=t[e++];if(n|=r.wzQfh(r.DZbFu(BigInt,s&127),i),!r.ggtpG(s,128))break;i+=0x7n}return[n,e]}function js(t){let e=Ye,r={drKKu:function(o,a){return o(a)},hmSrD:function(o,a){return o>>a},PfsLO:function(o,a){return o&a},qPegk:function(o,a,c){return o(a,c)},HSWen:function(o,a){return o(a)},AcLQY:function(o,a){return o>a},cxtal:function(o,a){return o+a},oWppA:function(o,a){return o===a},DMLIL:function(o,a){return o===a}},n=new Map;if(!t||!t[e(433)])return n;let i=0,s=t[e(433)];for(;i<s;){let o;[o,i]=h$(t,i);let a=r[e(489)](Number,r[e(497)](o,0x3n)),c=Number(r.PfsLO(o,0x7n));if(!a)break;let u;if(c===0)[u,i]=r[e(508)](h$,t,i);else if(c===2){let l;[l,i]=r[e(508)](h$,t,i);let d=r.HSWen(Number,l);if(d<0||r[e(479)](r[e(456)](i,d),s))break;u=t[e(364)](i,r[e(456)](i,d)),i+=d}else if(r[e(571)](c,5))i+=4,u=0x0n;else if(r[e(383)](c,1))i+=8,u=0x0n;else break;n[e(578)](a)||n.set(a,[]),n[e(450)](a)[e(528)](u)}return n}function Ch(t,e){let r=Ye,n={FBdsI:function(s,o){return s-o},dsbrm:function(s,o){return s>=o}},i=t.get(e);if(!i||!i[r(433)])return null;for(let s=n[r(404)](i.length,1);n[r(579)](s,0);s--)if(Buffer[r(389)](i[s]))return i[s];return null}function lr(t,e){let r=Ye,n={UzrgJ:function(s,o,a){return s(o,a)},tgYJY:r(560)},i=n[r(439)](Ch,t,e);return i?i.toString(n[r(415)]):""}function R_e(t,e){return t=t-351,xC()[t]}function O_e(t,e){let r=Ye,n={HttNe:function(o,a){return o(a)}},i=t[r(450)](e);if(!i||!i.length)return 0;let s=i[i[r(433)]-1];return typeof s===r(398)?n[r(540)](Number,s):0}function y$(t,e){let r=Ye,n=t[r(450)](e);return n?n[r(538)](i=>Buffer.isBuffer(i)):[]}function B_e(){let t=Ye,e={HiYnz:t(558),lbwPf:"2.75",jWpSJ:"hex"},r=(0,wa.randomUUID)()[t(564)](/-/g,"").toUpperCase();return{country:"CN",vName:p$,cpuId:t(371),young:0,facturer:t(515),pkg:w_e,uuid:r,resolution:t(506),mac:e[t(542)],abid:t(453),model:"M2012K11AC",plat:t(387),udid:r,dpi:t(471),net:"1",lang:"zh",brand:"Xiaomi",density:e[t(362)],appName:Dkt,cpu:"arm64-v8a",chid:t(553),carrier:t(469),_vOsCode:33,vOs:"13",v:1,tenantId:"",vApp:p$[t(564)](/\./g,""),device:0,androidID:(0,wa.randomBytes)(8)[t(430)](e.jWpSJ)}}function D_e(){let t=Ye,e={IhhYJ:function(a){return a()},mSxct:function(a,c){return a(c)},TruJb:function(a,c){return a+c},gMvYU:function(a,c,u){return a(c,u)},iocwC:t(575)},r=E_e||y_e,n=e[t(460)](B_e),i=Date[t(485)](),s=e[t(518)](ib,16);n[t(413)]=I_e(e.TruJb(e.mSxct(String,i)+s,n.vApp||t(520)),r),n[t(369)]=s,n[t(384)]=i;let o=e[t(570)](g$,String(i)+s,Bkt);return n[t(401)]=o.substring(0,8),n[t(480)]=o[t(455)](8),{"User-Agent":__e,Accept:e[t(468)],"Content-Type":t(575),publicParams:JSON[t(359)]({paramsData:e[t(570)](C_e,JSON.stringify(n),v_e)})}}function jkt(){let t=Ye,e={RlnMT:function(r,n,i){return r(n,i)},CAbTf:function(r){return r()}};return{"User-Agent":__e,Accept:t(421),"Content-Type":t(373),publicParams:JSON[t(359)]({paramsData:e[t(412)](C_e,JSON[t(359)](e[t(447)](B_e)),v_e)})}}function wC(t){let e=Ye,r={paOEQ:function(c,u){return c(u)},RERUw:function(c,u){return c==u},sJQbN:function(c,u){return c+u},sLlaz:function(c,u){return c+u},COGOW:function(c,u,l,d){return c(u,l,d)},UfFTJ:function(c,u,l,d){return c(u,l,d)}},n=Date[e(485)](),i=r.paOEQ(ib,8),s=[];for(let[c,u]of t)r[e(566)](u,null)||u===""||s.push(r.sJQbN(c,"=")+u);let o=r[e(436)](i,g$(r[e(490)](s.join("&"),n),x_e)),a=[];return rf(a,1,o[e(455)](0,20)),r[e(491)](rf,a,2,o[e(455)](20)),r[e(491)](rf,a,3,ib(20)),r[e(355)](N_e,a,4,n),rf(a,5,i),Buffer[e(457)](a)}function qkt(t,e){let r=Ye,n={cBWEJ:function(s,o,a,c){return s(o,a,c)},ikECd:function(s,o){return s+o},GyoGF:function(s,o){return s(o)}},i=[];return N_e(i,1,t),n[r(352)](rf,i,2,I_e(n.ikECd(String(t),e),y_e)),n.cBWEJ(rf,i,3,n[r(428)](ib,16)),rf(i,4,e),rf(i,5,n.GyoGF(ib,16)),Buffer[r(457)](i)}async function x$(){let t=Ye,e={kAowT:function(r,n){return r(n)},vGBdx:function(r,n,i){return r(n,i)},ouhFU:function(r,n){return r(n)},hwoiw:function(r,n){return r(n)},KMfVn:function(r,n){return r+n},qWREQ:function(r,n,i){return r(n,i)},jeHQt:t(483)};if(!g_e){g_e=!0;try{let r=await Z[t(450)](Ikt,{timeout:8e3}),n=typeof r[t(533)]=="string"?JSON[t(522)](r.data):r[t(533)];n&&n[t(504)]&&(tf=e[t(461)](String,n[t(504)]).replace(/\/+$/,""))}catch(r){console[t(377)](t(500),r[t(470)])}tf||(tf=Pkt);try{let r=Date[t(485)](),n=ib(16),i=await Z[t(358)](tf+t(434),e[t(388)](qkt,r,n),{headers:D_e(),timeout:m$,responseType:t(484)}),s=e[t(388)](Ch,e[t(379)](js,e.ouhFU(k_e,i[t(533)])),3);if(s){let o=e[t(459)](js,s);E_e=e[t(563)](e[t(388)](lr,o,2),e[t(561)](lr,o,3))+lr(o,4)+lr(o,5)}}catch(r){console[t(377)](e[t(477)],r[t(470)])}}}async function zkt(t){let e=Ye,r={qwPyp:function(n){return n()},sBWig:function(n,i){return n===i},koErK:e(514),mZDRt:function(n,i){return n||i}};try{let n=await Z[e(450)](t,{headers:r[e(402)](jkt),timeout:m$}),i=n.data;if(r[e(431)](typeof i,r.koErK))try{return JSON[e(522)](i)}catch{return{}}return r[e(403)](i,{})}catch(n){return console[e(377)](e(425),n.message),{}}}async function _C(t,e){let r=Ye,n={ApWWz:function(i){return i()},npDII:r(484)};try{if(await n[r(549)](x$),!tf)return Buffer[r(492)](0);let i=await Z[r(358)](tf+t,e,{headers:n[r(549)](D_e),timeout:m$,responseType:n[r(370)]});return k_e(i[r(533)])}catch(i){return console[r(377)](r(583)+t+":",i[r(470)]),Buffer[r(492)](0)}}function L_e(t){let e=Ye,r={lbmDO:function(s,o){return s(o)},tnMTu:function(s,o,a){return s(o,a)},UCUEU:function(s,o){return s||o},ihsLs:function(s,o,a){return s(o,a)},TSzjZ:function(s,o,a){return s(o,a)}},n=[];if(!t||!t[e(433)])return n;let i=Ch(js(t),3);if(!i)return n;for(let s of y$(js(i),1)){let o=r[e(495)](js,s),a=r[e(499)](O_e,o,3),c=lr(o,5);if(r[e(532)](!a,!c))continue;let u="",l=r[e(408)](Ch,o,2);if(l){let d=js(l);u=r[e(499)](lr,d,2)||r[e(499)](lr,d,1)}n.push({vod_id:r[e(495)](String,a),vod_name:c,vod_pic:T_e(u),vod_remarks:r[e(424)](lr,o,13)})}return n}function Vkt(t){let e=Ye,r={IohLv:function(o,a){return o(a)},KJWKW:function(o,a){return o>a}},n=nf(t);if(!n)return[];let i=null;try{i=JSON[e(522)](n)}catch{return[]}if(!i||typeof i!==e(525))return[];let s=[];for(let o of Lkt){let a=r.IohLv(nf,i[o]);if(!a)continue;let c=[{n:"\u5168\u90E8",v:""}];for(let u of r[e(568)](String,a)[e(452)](/[|,]/)){let l=r[e(568)](nf,u);l&&c[e(528)]({n:l,v:l})}r[e(381)](c[e(433)],1)&&s[e(528)]({key:o,name:Mkt[o]||o,value:c})}return s}async function Wkt(){let t=Ye,e={IOepi:function(r,n){return r+n},GbvQo:function(r,n){return r(n)},mPkZF:function(r,n){return r===n},fGEss:t(449)};try{if(await x$(),tf){let r=await zkt(e[t(396)](tf,t(541))),n=r&&r[t(533)];if(Array.isArray(n)&&n[t(433)]){let i=[],s={};for(let o of n){let a=e[t(375)](nf,o&&o[t(438)]);if(!a||e[t(427)](a,"\u516C\u544A"))continue;let c=e.GbvQo(String,o.id);i[t(528)]({type_id:c,type_name:a});let u=e[t(375)](Vkt,o[t(548)]);u.length&&(s[c]=u)}if(i[t(433)])return{class:i,filters:s}}}}catch(r){console[t(377)](e[t(513)],r.message)}return{class:Fkt,filters:{}}}async function Gkt(t){let e=Ye,r={OMmLa:function(a,c){return a==c},nTZAy:function(a,c){return a(c)},cjeOu:function(a,c){return a==c},JgIGv:function(a,c){return a(c)},MlNnd:e(357),ufkrP:function(a,c,u){return a(c,u)},eWWPb:e(512),bZcbe:e(574),EbUxb:e(501),vngoC:e(372),OMiAa:e(426)},n=t[e(395)][e(357)]||1;r[e(494)](n,0)&&(n=1);let i=r.JgIGv(String,t[e(395)].id==null?"":t.body.id),s=t[e(395)][e(519)]||{},o=(a,c)=>{let u=e,l=s[a];return r[u(382)](l,null)?c:r.nTZAy(String,l)};try{let a=new Map;a[e(354)](e(419),String(vC)),a[e(354)]("typeId1",i),a[e(354)](r[e(521)],String(n)),a[e(354)](e(524),r[e(416)](o,r[e(536)],"\u6700\u65B0")),a[e(354)]("vodArea",r[e(416)](o,r[e(462)],"")),a[e(354)](e(380),o(r[e(527)],"")),a.set(r[e(446)],r.ufkrP(o,e(475),"")),a.set(e(509),o("year",""));let c=L_e(await r[e(416)](_C,e(496),r[e(356)](wC,a)));return{page:n,pagecount:c.length>=vC?n+1:n,list:c}}catch(a){return console[e(377)](r[e(555)],a[e(470)]),{page:n,pagecount:n,list:[]}}}async function Xkt(t){let e=Ye,r={KCObY:function(i,s){return i(s)},jozoF:function(i,s,o){return i(s,o)},jaWLB:function(i,s){return i(s)},LaRwe:"utf8",ghibm:e(577),XDpCF:function(i,s,o){return i(s,o)},QueZP:function(i,s,o){return i(s,o)},dWhpZ:function(i,s,o){return i(s,o)},VfYRo:function(i,s){return i(s)},LPmhQ:function(i,s){return i(s)},xEZKa:function(i,s,o){return i(s,o)},vpfqJ:"$$$"},n=r[e(414)](nf,t[e(395)].id);if(!n)return{list:[]};try{let i=new Map;i[e(354)]("id",n);let s=await _C(e(467),r[e(414)](wC,i));if(!s[e(433)])return{list:[]};let o=Ch(r[e(414)](js,s),3);if(!o)return{list:[]};let a=js(o),c="",u=Ch(a,2);if(u){let f=js(u);c=r.KCObY(T_e,lr(f,2)||r[e(580)](lr,f,1))}let l=O_e(a,18),d=[],h=new Map;for(let f of y$(a,29)){let p=r[e(547)](js,f),m=lr(p,4);if(!m)continue;let g=r[e(580)](lr,p,9),b=lr(p,10)||"\u6A58\u6C41",v=r.jozoF(Ukt,lr(p,2)||lr(p,3),"\u6B63\u7247"),y=m;!S_e[e(420)](m)&&(y=Buffer[e(457)](JSON[e(359)]({vodPlayFrom:g,playUrl:m}),r.LaRwe)[e(430)](r[e(502)])),!h[e(578)](b)&&(h[e(354)](b,[]),d[e(528)](b)),h[e(450)](b)[e(528)](v+"$"+y)}return d[e(433)]?{list:[{vod_id:n,vod_name:r[e(464)](lr,a,9),vod_pic:c,vod_actor:lr(a,25)||r[e(531)](lr,a,16),vod_director:r[e(464)](lr,a,12)||r[e(385)](lr,a,13),vod_year:l?r[e(367)](String,l):"",vod_area:lr(a,1),vod_remarks:r[e(464)](lr,a,26),vod_content:r[e(417)]($kt,r[e(445)](lr,a,6)),vod_play_from:d.map(f=>f[e(564)](/\$/g," ")).join(e(576)),vod_play_url:d.map(f=>h[e(450)](f).join("#")).join(r[e(498)])}]}:{list:[]}}catch(i){return console[e(377)](e(392),i.message),{list:[]}}}async function Kkt(t){let e=Ye,r={ylKuy:function(s,o){return s(o)},inWZe:e(577),iIBKK:e(560),kpPBO:function(s,o){return s(o)},VBzls:function(s,o,a){return s(o,a)},UJygm:function(s,o){return s(o)},CJdMM:function(s,o,a){return s(o,a)},WbXBv:function(s,o,a){return s(o,a)},DSuuK:function(s,o,a){return s(o,a)}},n=r[e(545)](String,t[e(395)].id||"");if(!n)return{parse:0,url:""};if(S_e[e(420)](n))return{parse:0,url:n};let i=null;try{i=JSON[e(522)](Buffer[e(457)](n,r[e(481)])[e(430)](r[e(407)]))}catch{i=null}if(!i||!i.playUrl)return{parse:0,url:n};try{let s=new Map;for(let d of Object[e(537)](i))s[e(354)](d,i[d]==null?"":r[e(441)](String,i[d]));let o=await r[e(465)](_C,e(458),wC(s));if(!o[e(433)])return{parse:0,url:""};let a=r[e(545)](js,Ch(r.UJygm(js,o),3)),c=r.CJdMM(lr,a,1);if(!c)return{parse:0,url:""};let u={};for(let d of r[e(410)](y$,a,6)){let h=r.kpPBO(js,d),f=r.DSuuK(lr,h,1);f&&(u[f]=lr(h,2))}let l={parse:0,url:c};return Object[e(537)](u)[e(433)]&&(l[e(517)]=u),l}catch(s){return console[e(377)](e(554),s[e(470)]),{parse:0,url:""}}}async function Ykt(t){let e=Ye,r={LjucF:function(s,o){return s==o},DtXbj:e(419),qdJRA:function(s,o){return s(o)},HACAJ:function(s,o,a){return s(o,a)},zrYPA:e(503),DBEUR:function(s,o){return s(o)},qWZdw:function(s,o){return s+o}},n=t.body[e(357)]||1;r[e(444)](n,0)&&(n=1);let i=nf(t[e(395)].wd);if(!i)return{page:n,pagecount:n,list:[]};try{let s=new Map;s[e(354)](e(454),i),s[e(354)](e(357),String(n)),s.set(r[e(353)],r[e(361)](String,vC));let o=L_e(await r[e(530)](_C,r[e(539)],r[e(351)](wC,s)));return{page:n,pagecount:o[e(433)]>=vC?r[e(510)](n,1):n,list:o}}catch(s){return console[e(377)](e(466),s[e(470)]),{page:n,pagecount:n,list:[]}}}var wa,Ye,Ikt,Pkt,y_e,Nkt,Rkt,Okt,x_e,Bkt,v_e,w_e,p$,Dkt,__e,m$,vC,tf,E_e,g_e,Lkt,Mkt,S_e,Fkt,b_e,M_e,F_e=M(()=>{st();wa=require("node:crypto"),Ye=R_e;(function(t,e){let r=R_e,n=t();for(;;)try{if(parseInt(r(534))/1*(-parseInt(r(478))/2)+parseInt(r(368))/3*(-parseInt(r(482))/4)+-parseInt(r(557))/5*(-parseInt(r(505))/6)+parseInt(r(390))/7+-parseInt(r(544))/8*(-parseInt(r(394))/9)+parseInt(r(448))/10+-parseInt(r(559))/11===e)break;n.push(n.shift())}catch{n.push(n.shift())}})(xC,846717);Ikt=Ye(474),Pkt="https://juziapp.hzhcbkj.cn",y_e="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCr8SzZhjYy+rsya1K09t8d2K50pWFoBkgUqMpKOiW+3IEVKd4eTdvg9RSOjQ82kypL6R9BnsmrS1V8s4PVDwjQbUtYhTPPC9Hz16qY7rpD6m0d2vr09/UpWQ5uOy9PR0QTrsioveZ+DIe9jc3C+zBCu/kZSY/R8stwJoiitki3gwIDAQAB",Nkt=Ye(406),Rkt=Ye(360),Okt="11GK2we32144LO&hilUITB)FMd1khdaF";x_e="",Bkt="OC1A06E197EF10CF3F6058CA7A803B5E",v_e=Ye(487),w_e=Ye(550),p$=Ye(391),Dkt="\u6A58\u6C41",__e=Ye(507),m$=25e3,vC=21,tf="",E_e="",g_e=!1,Lkt=[Ye(475),Ye(501),Ye(574),Ye(511),Ye(512)],Mkt={class:"\u7C7B\u578B",lang:"\u8BED\u8A00",area:"\u5730\u533A",year:"\u5E74\u4EFD",extend_sort:"\u6392\u5E8F"},S_e=/.*\.(mp4|m3u8|flv|mkv|avi|ts|mov|mpd|m4a|wmv)(\?.*)?$/i,Fkt=[{type_id:"21",type_name:"\u7535\u5F71"},{type_id:"22",type_name:"\u5267\u96C6"},{type_id:"25",type_name:"\u52A8\u6F2B"},{type_id:"26",type_name:"\u7EFC\u827A"},{type_id:"27",type_name:"\u77ED\u5267"},{type_id:"28",type_name:"\u6F2B\u5267"}],b_e=Ye(399);x_e=Hkt();M_e={meta:{key:Ye(442),name:"\u6A58\u6C41",type:3},api:async t=>{let e=Ye,r={qLQEj:e(581)};t[e(358)](r.qLQEj,async()=>(await x$(),{})),t[e(358)](e(556),Wkt),t.post(e(565),Gkt),t[e(358)](e(422),Xkt),t[e(358)]("/play",Kkt),t[e(358)]("/search",Ykt)}}})
// ===== MiraPlayer 适配 =====
let _inited = false;
async function ensureInit() {
  if (!_inited) {
    F_e();
    _inited = true;
  }
}

async function init(reqIn) {
  await ensureInit();
  return {};
}

async function home(reqIn) {
  await ensureInit();
  try {
    const r = await Wkt();
    // Wkt 返回 {class: [{type_id, type_name}], filters}
    // 转为 MiraPlayer 格式
    return r;
  } catch(e) {
    return { class: [], filters: {} };
  }
}

async function category(reqIn) {
  await ensureInit();
  const body = (reqIn && reqIn.body) || {};
  try {
    // Gkt 期望 t.body = {id, page, ...}
    const r = await Gkt({ body: body });
    return r;
  } catch(e) {
    return { page: 1, pagecount: 1, list: [] };
  }
}

async function detail(reqIn) {
  await ensureInit();
  const body = (reqIn && reqIn.body) || {};
  try {
    const r = await Xkt({ body: body });
    return r;
  } catch(e) {
    return { list: [] };
  }
}

async function play(reqIn) {
  await ensureInit();
  const body = (reqIn && reqIn.body) || {};
  try {
    const r = await Kkt({ body: body });
    return r;
  } catch(e) {
    return { parse: 0, url: '' };
  }
}

async function search(reqIn) {
  await ensureInit();
  const body = (reqIn && reqIn.body) || {};
  try {
    const r = await Ykt({ body: body });
    return r;
  } catch(e) {
    return { page: 1, pagecount: 1, list: [] };
  }
}

export default function createSpider() {
  return {
    meta: { key: KEY, name: NAME, type: 3 },
    api: async (fastify) => {
      fastify.post('/init', init);
      fastify.post('/home', home);
      fastify.post('/category', category);
      fastify.post('/detail', detail);
      fastify.post('/play', play);
      fastify.post('/search', search);
    },
  };
}
