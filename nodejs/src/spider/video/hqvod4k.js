'use strict';
import req from '../../util/req.js';
import crypto from 'crypto';
import cheerio from 'cheerio';
/*
 * 高清点播4K —— 采集源 (spider)
 * 站点：https://hqvod.com  （示例分类页：https://hqvod.com/fenlei/1.html）
 * 引擎：迷mini / drpy-node 兼容
 * 接口：meta + api(fastify)  => /init /home /category /detail /search /play
 */
const __spider = {
  meta: {
    key: 'py_hqvod4k',
    name: '📺点播 - 4K',
    type: 3,
    searchable: 1,
    quickSearch: 1,
    filterable: 1,
  },

  api: async (fastify) => {
    const HOST = 'https://hqvod.com';
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';

    const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
    const pageOf = (body) => Math.max(1, Number.parseInt(String(body?.page || '1'), 10) || 1);
    const loadHtml = (s) => cheerio.load(String(s || ''));

    // ---------------- 网络请求 ----------------
    async function get(url) {
      const r = await req.get(url, { timeout: 15000, headers: { 'User-Agent': UA, 'Referer': HOST + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' }, responseType: 'text', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ' ' + url);
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    }

    // ---------------- 卡片解析 ----------------
    // 首页/分类/搜索列表都用 .public-list-box 块
    function cards(html) {
      const $ = loadHtml(html);
      const seen = new Set();
      const list = [];
      $('.public-list-box').each((_, element) => {
        const box = $(element);
        const link = box.find('a[href^="/xiangqing/"]').first();
        const id = /\/xiangqing\/(\d+)\.html/.exec(link.attr('href') || '')?.[1];
        if (!id || seen.has(id)) return;
        seen.add(id);
        const img = link.find('img').first();
        list.push({
          vod_id: id,
          vod_name: String(link.attr('title') || img.attr('alt') || '').trim(),
          vod_pic: String(img.attr('data-src') || img.attr('src') || '').trim(),
          vod_remarks: box.find('.public-list-prb').first().text().trim(),
          vod_score: box.find('.public-prt').first().text().trim(),
        });
      });
      return list;
    }

    // ---------------- 分类 ----------------
    const categories = [
      { type_id: '1', type_name: '电影' },
      { type_id: '2', type_name: '电视剧' },
      { type_id: '3', type_name: '动漫' },
      { type_id: '4', type_name: '综艺' },
    ];

    // ---------------- 路由 ----------------
    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      try { const list = cards(await get(HOST + '/')); return { class: categories, filters: {}, list }; }
      catch (e) { return { class: categories, filters: {}, list: [] }; }
    });

    fastify.post('/category', async (request) => {
      const id = String(request.body?.id || '1');
      const page = pageOf(request.body);
      const ext = request.body?.extend || {};

      const params = new URLSearchParams();
      const kind = String(ext.class || ext['类型'] || '');
      const year = String(ext.year || ext['年份'] || '');
      if (kind && kind !== '全部') params.set('class', kind);
      if (year && year !== '全部') params.set('year', year);
      if (String(ext.by || '') === 'hits') params.set('sort', 'hits');

      const query = params.toString();
      const path = `/fenlei/${id}-${page}.html${query ? '?' + query : ''}`;
      let list = [];
      try { list = cards(await get(HOST + path)); } catch (e) { list = []; }
      return {
        list,
        page,
        pagecount: page + Number(list.length > 0),
        limit: list.length || 24,
        total: list.length ? 9999 : 0,
      };
    });

    fastify.post('/detail', async (request) => {
      const id = one(request.body?.id);
      if (!id) return { list: [] };

      let html = '';
      try { html = await get(`${HOST}/xiangqing/${id}.html`); } catch (e) { return { list: [] }; }
      const $ = loadHtml(html);
      const title = $('.this-desc-title').first().text().trim();
      if (!title) return { list: [] };

      const info = $('.this-desc-info span').toArray().map((el) => $(el).text().trim());
      const poster = $('.this-pic-bj').first().attr('style') || '';
      const pic = /background-image:\s*url\(['"]?([^)'" ]+)/.exec(poster)?.[1] || '';

      // 播放线路名（带 fa 图标的 swiper-slide）
      const names = $('a.swiper-slide').toArray()
        .filter((el) => $(el).find('i.fa').length)
        .map((el) => $(el).text().trim().replace(/\d+$/, '').trim());

      // 各线路剧集
      const groups = [];
      $('.anthology-list-box.none').each((_, element) => {
        const episodes = [];
        $(element).find('a.hide[href^="/bofang/"]').each((_, link) => {
          const a = $(link);
          const name = a.text().trim();
          const epName = /^\d{1,4}$/.test(name) ? `第${Number(name)}集` : name.replace(/[$#]/g, '_');
          episodes.push(`${epName}$${a.attr('href')}`);
        });
        if (episodes.length && groups.length < names.length) groups.push(episodes.join('#'));
      });

      const mediaKind = groups.some((group) => group.split('#').length > 1) ? 'series' : 'movie';
      if (pageLine.size > 5000) pageLine.clear();
      groups.forEach((group, index) => {
        const key = mediaKind + ':' + normalizeLineName(names[index]);
        for (const match of group.matchAll(/\/bofang\/\d+-\d+-\d+\.html/g)) pageLine.set(match[0], key);
      });

      // 4K 固定优先；其余线路按实测基础等级，并结合本进程最近的播放
      // 成功率和解密耗时动态调整。这里不并发测速，避免详情页触发限流。
      const order = groups.map((_, index) => index).sort((a, b) =>
        lineSortScore(names[a], mediaKind, a) - lineSortScore(names[b], mediaKind, b));
      const sortedNames = order.map((index) => names[index]);
      const sortedGroups = order.map((index) => groups[index]);

      let remarks = info[3] || '';
      if (remarks.includes('完结') && sortedGroups.length) {
        remarks = `已完结·全${sortedGroups[0].split('#').length}集`;
      }

      return {
        list: [{
          vod_id: id,
          vod_name: title,
          vod_pic: pic,
          vod_score: info[0] || '',
          vod_year: info[1] || '',
          vod_area: info[2] || '',
          vod_remarks: remarks,
          vod_content: $('meta[name="description"]').first().attr('content') || '',
          vod_play_from: sortedNames.join('$$$'),
          vod_play_url: sortedGroups.join('$$$'),
        }],
      };
    });

    fastify.post('/search', async (request) => {
      const page = pageOf(request.body);
      const word = encodeURIComponent(String(request.body?.wd || ''));
      if (!word) return { list: [], page, pagecount: page };
      let list = [];
      try { list = cards(await get(`${HOST}/sousuo/-------------.html?wd=${word}&page=${page}`)); } catch (e) { list = []; }
      return {
        list,
        page,
        pagecount: page + Number(list.length > 0),
        limit: list.length || 15,
        total: list.length ? 9999 : 0,
      };
    });

    // 播放：播放页里的 player_aaaa.url 是播放器 token，真正的 m3u8 由播放器前端解密。
    // 这里只负责把 token 拼成官方播放器地址（parse:1），让壳子的网页播放器去跑。
    const challenge = { cookie: '', at: 0 };
    const tokenCache = new Map();
    const lineHealth = new Map();
    const pageLine = new Map();
    const PLAYER_HOST = 'xn--2p1a.bfapi.cyou';
    const PLAYER_BASE = `https://${PLAYER_HOST}/player/`;

    const normalizeLineName = (name) => String(name || '').replace(/\s+/g, '').toUpperCase();

    function baseLineRank(name, kind) {
      const n = normalizeLineName(name);
      if (/4K|2160/.test(n)) return -10000;
      if (/推荐K/.test(n)) return 0;
      if (/②蓝光|2蓝光/.test(n)) return 100;
      if (kind === 'movie' && /[YQI]弹/.test(n)) return 200;
      if (/稳定[②③23]?/.test(n)) return kind === 'movie' ? 300 : 200;
      if (/[YQI]弹/.test(n)) return 300;
      if (/推荐L/.test(n)) return kind === 'movie' ? 950 : 400;
      if (/蓝光⑤|5蓝光|③蓝光|3蓝光/.test(n)) return kind === 'movie' ? 1000 : 500;
      if (/推荐/.test(n)) return 1000;
      if (/④蓝光|4蓝光/.test(n)) return 1200;
      if (/蓝光/.test(n)) return 1100;
      if (/全球/.test(n)) return 1400;
      return 800;
    }

    function lineSortScore(name, kind, originalIndex) {
      const base = baseLineRank(name, kind);
      if (base <= -10000) return base + originalIndex;
      const state = lineHealth.get(kind + ':' + normalizeLineName(name));
      if (!state) return base + originalIndex;
      const age = Date.now() - state.at;
      if (age > 30 * 60 * 1000) return base + originalIndex;
      // 最近失败先沉底，5分钟内逐步恢复；成功线路按耗时小幅提前。
      const failPenalty = state.ok ? 0 : Math.max(0, 3500 * (1 - age / (5 * 60 * 1000)));
      const successBonus = state.ok ? Math.max(250, 900 - Math.min(650, state.ms / 8)) : 0;
      return base + failPenalty - successBonus + originalIndex;
    }

    async function rawGet(url, headers) {
      try {
        const r = await req.get(url, { timeout: 20000, headers, responseType: 'text', validateStatus: () => true });
        return { status: r.status, body: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''), cookies: r.headers['set-cookie'] || [] };
      } catch (e) { return { status: 0, body: '', cookies: [] }; }
    }

    async function postForm(url, data, headers = {}) {
      try {
        const body = new URLSearchParams(data).toString();
        const r = await req.post(url, body, { timeout: 20000, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Content-Length': Buffer.byteLength(body), 'X-Requested-With': 'XMLHttpRequest', Referer: PLAYER_BASE, ...headers }, responseType: 'text', validateStatus: () => true });
        return { status: r.status, body: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '') };
      } catch (e) { return { status: 0, body: '' }; }
    }

    const md5 = (text) => crypto.createHash('md5').update(String(text)).digest('hex');
    const tokenKey = (token) => (md5(token) + ' P').slice(-22);

    // 播放器的 aesplay 实际是 RC4。Buffer 输入可同时覆盖签名明文和 base64 密钥字节。
    function rc4(key, input) {
      const keyBytes = Buffer.from(String(key));
      const data = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
      const box = Array.from({ length: 256 }, (_, index) => index);
      let j = 0;
      for (let i = 0; i < 256; i += 1) {
        j = (j + box[i] + keyBytes[i % keyBytes.length]) & 255;
        [box[i], box[j]] = [box[j], box[i]];
      }
      const out = Buffer.alloc(data.length);
      let i = 0;
      j = 0;
      for (let n = 0; n < data.length; n += 1) {
        i = (i + 1) & 255;
        j = (j + box[i]) & 255;
        [box[i], box[j]] = [box[j], box[i]];
        out[n] = data[n] ^ box[(box[i] + box[j]) & 255];
      }
      return out;
    }

    async function tokenToMedia(token) {
      const secret = tokenKey(token);
      const sign = (value) => rc4(secret, value).toString('base64');
      const now = Math.floor(Date.now() / 1000);
      const response = await postForm(PLAYER_BASE + 'api.php', {
        url: token,
        key: sign(md5(token + 'stray')),
        vkey: sign(String(now) + md5(secret + 'stray')),
        ckey: sign(md5(PLAYER_HOST + 'stray')),
      });
      if (response.status !== 200 || !response.body) return '';

      let data;
      try { data = JSON.parse(response.body); } catch (e) { return ''; }
      if (Number(data.code) !== 200 || !data.url || !data.aes_key || !data.aes_iv) return '';

      try {
        const key = rc4(secret, Buffer.from(String(data.aes_key), 'base64'));
        const iv = rc4(secret, Buffer.from(String(data.aes_iv), 'base64'));
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        const direct = Buffer.concat([
          decipher.update(Buffer.from(String(data.url), 'base64')),
          decipher.final(),
        ]).toString('utf8').trim();
        // 部分线路是无扩展名的 CDN 地址（例如路径以 / 结尾，仅通过
        // mime_type=video_mp4 表示格式），不能只用 .m3u8/.mp4 后缀判断。
        // 接口 code=200 且完成 AES 解密后，只接受 http(s) 直链即可。
        return /^https?:\/\/[^\s]+$/i.test(direct) ? direct : '';
      } catch (e) {
        return '';
      }
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function playPage(url) {
      const base = { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: HOST + '/' };
      let cookie = challenge.cookie && Date.now() - challenge.at < 10 * 60 * 1000 ? challenge.cookie : '';
      let r = await rawGet(url, cookie ? { ...base, Cookie: cookie } : base);
      if (r.status !== 200) {
        // 验证页会分两次下发 Cookie；合并旧 Cookie，避免第二次响应把
        // 第一次的挑战值覆盖掉。最多再试两次，仍控制在插件时限内。
        const jar = {};
        for (const part of String(cookie || '').split(';')) {
          const kv = part.trim(); const i = kv.indexOf('=');
          if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
        }
        for (let attempt = 0; attempt < 2 && r.status !== 200; attempt += 1) {
          for (const one of r.cookies) {
            const kv = String(one).split(';')[0]; const i = kv.indexOf('=');
            if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
          }
          cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
          if (cookie) { challenge.cookie = cookie; challenge.at = Date.now(); }
          await sleep(attempt ? 550 : (cookie ? 250 : 650));
          r = await rawGet(url, cookie ? { ...base, Cookie: cookie, Referer: url } : base);
        }
      }
      return r.status === 200 ? r.body : '';
    }

    function playerToken(html) {
      const i = html.indexOf('player_aaaa=');
      if (i < 0) return null;
      const tail = html.slice(i + 12);
      let depth = 0; let end = -1; let inStr = false; let esc = false;
      for (let k = 0; k < tail.length; k += 1) {
        const ch = tail[k];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) { end = k + 1; break; } }
      }
      if (end < 0) return null;
      try { return JSON.parse(tail.slice(0, end)); } catch (e) { return null; }
    }

    fastify.post('/play', async (request) => {
      const id = one(request.body?.id);
      if (!id) return { parse: 0, url: '' };
      const page = id.startsWith('http') ? id : HOST + id;
      const hit = tokenCache.get(page);
      if (hit && Date.now() - hit.at < (hit.ttl || 10 * 60 * 1000)) return hit.value;

      const startedAt = Date.now();
      const pathKey = (() => { try { return new URL(page).pathname; } catch (e) { return page; } })();
      const currentLine = pageLine.get(pathKey) || '';
      const rememberLine = (ok) => {
        if (currentLine) lineHealth.set(currentLine, { ok, ms: Date.now() - startedAt, at: Date.now() });
      };
      const html = await playPage(page);
      const fallback = { parse: 1, url: page, header: { 'User-Agent': UA, 'Referer': HOST + '/' } };
      if (!html) { rememberLine(false); return fallback; }
      const p = playerToken(html);
      if (!p || !p.url) { rememberLine(false); return fallback; }

      // 直接复现官方播放器签名和解密流程，给不支持网页嗅探的壳返回真实媒体地址。
      let direct = await tokenToMedia(String(p.url));
      // 接口偶发瞬时空响应；短间隔重试一次，不做多线路并发轰炸。
      if (!direct) {
        await sleep(180);
        direct = await tokenToMedia(String(p.url));
      }
      if (direct) {
        rememberLine(true);
        const value = {
          parse: 0,
          url: direct,
          // CDN 直链通常不要求播放器域名 Referer；强塞 Referer 反而会让
          // 个别字节跳动/对象存储线路拒绝请求。
          header: { 'User-Agent': UA },
        };
        // m3u8 含短时 t/tk，避免10分钟旧缓存返回过期链接。
        tokenCache.set(page, { at: Date.now(), ttl: 60 * 1000, value });
        return value;
      }

      const m = /\/bofang\/(\d+)-(\d+)-(\d+)\.html/.exec(page);
      const next = m ? '//www.hqvod.com/bofang/' + m[1] + '-' + m[2] + '-' + (Number(m[3]) + 1) + '.html' : '';
      const name = (p.vod_data && p.vod_data.vod_name) || '';
      const title = '剧集《' + name + '》第' + (m ? m[3] : '1') + '集在线观看';
      rememberLine(false);
      const value = {
        parse: 1,
        url: PLAYER_BASE + '?url=' + encodeURIComponent(String(p.url)) + '&next=' + encodeURIComponent(next) + '&title=' + encodeURIComponent(title),
        header: { 'User-Agent': UA, 'Referer': page },
      };
      // 解密失败多为临时限流/验证，不把失败结果缓存十分钟。
      tokenCache.set(page, { at: Date.now(), ttl: 15 * 1000, value });
      return value;
    });
  },
};

export default function createSpider() { return __spider; }
