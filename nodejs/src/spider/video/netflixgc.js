'use strict';
import req from '../../util/req.js';
import cheerio from 'cheerio';

// 奈飞工厂：迷你引擎 Node/Fastify 猫源。
// 主域名故障时自动切换官方备用域名；播放页直接解码 player_aaaa。
const __spider = {
  meta: {
    key: 'py_netflixgc',
    name: '🛜奈飞- 极速',
    type: 3,
    searchable: 1,
    quickSearch: 1,
    filterable: 0,
  },

  api: async (fastify) => {
    const DOMAINS = [
      'https://www.netflixgc.com',
      'https://www.netflixgc.org',
      'https://www.netflixgc.net',
      'https://www.netflixgc.cc',
      'https://www.netflixgc.me',
    ];
    const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
    const CLASSES = [
      { type_id: '1', type_name: '电影' },
      { type_id: '2', type_name: '连续剧' },
      { type_id: '24', type_name: '纪录片' },
      { type_id: '3', type_name: '漫剧' },
      { type_id: '23', type_name: '综艺' },
    ];
    let activeHost = DOMAINS[0];
    let activeAt = 0;

    const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
    const pageOf = (body) => Math.max(1, Number.parseInt(String(body?.page || body?.pg || '1'), 10) || 1);
    const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const safeText = (node) => clean(node.text());

    function hostOrder() {
      if (activeHost && Date.now() - activeAt < 10 * 60 * 1000) {
        return [activeHost, ...DOMAINS.filter((host) => host !== activeHost)];
      }
      return DOMAINS.slice();
    }

    async function requestText(url, referer) {
      const r = await req.get(url, { timeout: 12000, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: referer || new URL(url).origin + '/' }, responseType: 'text', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    }

    function usableHtml(html) {
      const text = String(html || '');
      return text.length > 3000 && /(?:maccms|voddetail|vodplay|public-list|anthology)/i.test(text);
    }

    async function siteGet(input) {
      let path = String(input || '/');
      try {
        if (/^https?:\/\//i.test(path)) path = new URL(path).pathname + new URL(path).search;
      } catch (e) { path = '/'; }
      if (!path.startsWith('/')) path = '/' + path;
      let lastError;
      for (const host of hostOrder()) {
        try {
          const html = await requestText(host + path, host + '/');
          if (!usableHtml(html)) throw new Error('invalid html');
          activeHost = host;
          activeAt = Date.now();
          return { html, host };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('all domains unavailable');
    }

    function absolute(url, host = activeHost) {
      const value = String(url || '').replace(/&amp;/g, '&');
      if (!value) return '';
      try { return new URL(value, host + '/').href; } catch (e) { return value; }
    }

    function cards(html, host) {
      const $ = cheerio.load(String(html || ''));
      const list = [];
      const seen = new Set();
      $('a.public-list-exp[href*="/voddetail/"]').each((_, element) => {
        const item = $(element);
        const href = item.attr('href') || '';
        const id = /\/voddetail\/(\d+)\.html/i.exec(href)?.[1];
        if (!id || seen.has(id)) return;
        const img = item.find('img').first();
        const name = clean(item.attr('title') || img.attr('alt'));
        if (!name) return;
        seen.add(id);
        list.push({
          vod_id: id,
          vod_name: name,
          vod_pic: absolute(img.attr('data-src') || img.attr('data-original') || img.attr('src'), host),
          vod_remarks: safeText(item.find('.public-list-prb,.pic-text,.ft2').first()),
        });
      });
      return list;
    }

    // 站点分类列表是 AJAX：POST /index.php/ds_api/vod
    async function postForm(host, path, form) {
      const data = new URLSearchParams(form).toString();
      const r = await req.post(host + path, data, { timeout: 15000, headers: { 'User-Agent': UA, Accept: 'application/json, text/javascript, */*; q=0.01', 'Accept-Language': 'zh-CN,zh;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data), Referer: host + '/', 'X-Requested-With': 'XMLHttpRequest' }, responseType: 'text', validateStatus: () => true });
      if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
      return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    }

    function apiCards(payload, host) {
      const list = [];
      const seen = new Set();
      for (const item of (payload && payload.list) || []) {
        const href = String(item.url || '');
        const id = /\/voddetail\/(\d+)\.html/i.exec(href)?.[1] || String(item.vod_id || '');
        if (!id || seen.has(id)) continue;
        const name = clean(item.vod_name);
        if (!name) continue;
        seen.add(id);
        list.push({
          vod_id: id,
          vod_name: name,
          vod_pic: absolute(String(item.vod_pic || ''), host),
          vod_remarks: clean(item.vod_remarks),
        });
      }
      return list;
    }

    // 站点搜索建议接口：/index.php/ajax/suggest?mid=1&wd=xxx → {list:[{id,name,pic}]}
    async function searchSuggest(keyword) {
      for (const host of hostOrder()) {
        try {
          const text = await requestText(host + '/index.php/ajax/suggest?mid=1&wd=' + encodeURIComponent(keyword), host + '/');
          const payload = JSON.parse(text);
          if (!payload || typeof payload !== 'object') throw new Error('bad json');
          const rows = Array.isArray(payload.list) ? payload.list : [];
          // 接口正常但没结果：说明真的搜不到，不要再去试其它域名（否则要等十几秒）
          if (!rows.length) return [];
          activeHost = host;
          activeAt = Date.now();
          const seen = new Set();
          const out = [];
          for (const row of rows) {
            const id = String(row.id || '');
            if (!id || seen.has(id)) continue;
            const name = clean(row.name);
            if (!name) continue;
            seen.add(id);
            out.push({ vod_id: id, vod_name: name, vod_pic: absolute(String(row.pic || ''), host), vod_remarks: '' });
          }
          if (out.length) return out;
        } catch (e) { /* 换下一个域名 */ }
      }
      return [];
    }

    // 搜索结果是 search-list 结构，不是 public-list-exp
    function searchCards(html, host) {
      const $ = cheerio.load(String(html || ''));
      const list = [];
      const seen = new Set();
      $('.search-list a[href*="/voddetail/"], .style-detail a[href*="/voddetail/"]').each((_, element) => {
        const item = $(element);
        const href = item.attr('href') || '';
        const id = /\/voddetail\/(\d+)\.html/i.exec(href)?.[1];
        if (!id || seen.has(id)) return;
        const box = item.closest('.search-list, .style-detail');
        const name = clean(item.find('h3').first().text() || item.attr('title') || box.find('.slide-info-title').first().text());
        if (!name) return;
        const img = box.find('img').first();
        seen.add(id);
        list.push({
          vod_id: id,
          vod_name: name,
          vod_pic: absolute(img.attr('data-src') || img.attr('src'), host),
          vod_remarks: clean(box.find('.slide-info-remarks').first().text()),
        });
      });
      return list;
    }

    function categoryPath(type, page) {
      return page <= 1
        ? `/vodshow/${type}-----------.html`
        : `/vodshow/${type}--------${page}---.html`;
    }

    function playerObject(html) {
      const marker = /(?:var\s+)?player_aaaa\s*=\s*/i.exec(String(html || ''));
      if (!marker) return null;
      const text = String(html).slice(marker.index + marker[0].length);
      let depth = 0; let inString = false; let escaped = false; let start = -1;
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === '{') { if (start < 0) start = index; depth += 1; }
        else if (char === '}') {
          depth -= 1;
          if (start >= 0 && depth === 0) {
            try { return JSON.parse(text.slice(start, index + 1)); } catch (e) { return null; }
          }
        }
      }
      return null;
    }

    function decodePlayerUrl(player) {
      let url = String(player?.url || '');
      try {
        // 站内部分线路的 URL 里混有老式 %uXXXX 转义（如 HD%u56FD%u8BED），标准
        // decodeURIComponent 遇到 %u 直接抛错致整条解码为空；先把 %uXXXX 还原
        // 成字符再做标准百分号解码。
        const pct = (s) => decodeURIComponent(String(s).replace(/%u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
        if (String(player?.encrypt) === '1') url = pct(url);
        else if (String(player?.encrypt) === '2') {
          url = Buffer.from(url, 'base64').toString('utf8');
          url = pct(url);
        }
      } catch (e) { return ''; }
      return url.trim();
    }

    fastify.post('/init', async () => ({}));

    fastify.post('/home', async () => {
      let list = [];
      try {
        const response = await siteGet('/');
        list = cards(response.html, response.host).slice(0, 60);
      } catch (e) { /* 分类仍可显示 */ }
      return { class: CLASSES, filters: {}, list };
    });

    fastify.post('/category', async (request) => {
      const body = request.body || {};
      const type = one(body.id || body.tid || '1');
      const page = pageOf(body);
      const ext = body.filters || body.extend || {};
      const form = {
        type,
        class: ext['类型'] || ext.class || '',
        area: ext['地区'] || ext.area || '',
        year: ext['年份'] || ext.year || '',
        lang: ext['语言'] || ext.lang || '',
        version: '',
        state: '',
        letter: '',
        time: '',
        level: '0',
        weekday: '',
        by: ext.by || '',
        page: String(page),
      };
      let lastError;
      for (const host of hostOrder()) {
        try {
          const text = await postForm(host, '/index.php/ds_api/vod', form);
          const payload = JSON.parse(text);
          if (!payload || Number(payload.code) !== 1) throw new Error('code ' + (payload && payload.code));
          activeHost = host;
          activeAt = Date.now();
          const list = apiCards(payload, host);
          return {
            list,
            page,
            pagecount: Number(payload.pagecount) || page,
            limit: Number(payload.limit) || list.length || 40,
            total: Number(payload.total) || list.length,
          };
        } catch (error) { lastError = error; }
      }
      const response = await siteGet(categoryPath(type, page));
      const list = cards(response.html, response.host);
      return { list, page, pagecount: page + Number(list.length > 0), limit: list.length || 24, total: list.length ? 9999 : 0 };
    });

    fastify.post('/detail', async (request) => {
      const id = /\d+/.exec(one(request.body?.id || request.body?.ids))?.[0] || '';
      if (!id) return { list: [] };
      const response = await siteGet(`/voddetail/${id}.html`);
      const $ = cheerio.load(response.html);
      const title = safeText($('h3.slide-info-title,.vod-detail .this-title,h1').first());
      if (!title) return { list: [] };

      const tabs = [];
      $('.anthology-tab a.swiper-slide').each((index, element) => {
        const item = $(element).clone();
        item.find('.badge,i').remove();
        tabs.push(clean(item.text()) || `线路${index + 1}`);
      });
      const groups = [];
      $('.anthology-list-box').each((_, element) => {
        const episodes = [];
        $(element).find('a[href*="/vodplay/"]').each((__, link) => {
          const item = $(link);
          const href = item.attr('href') || '';
          if (!/\/vodplay\/\d+-\d+-\d+\.html/i.test(href)) return;
          const name = clean(item.text()).replace(/[$#]/g, '_') || `第${episodes.length + 1}集`;
          episodes.push(`${name}$${href}`);
        });
        if (episodes.length) groups.push(episodes.join('#'));
      });
      const names = groups.map((_, index) => tabs[index] || `线路${index + 1}`);
      const image = $('.vod-detail img,.detail-pic img,.this-pic img').first();
      const meta = $('.slide-info,.vod-detail-info p,.vod-detail .partition').toArray().map((element) => safeText($(element)));
      const content = safeText($('#height_limit,.vod-detail-content,.this-desc').first()) || clean($('meta[name="description"]').attr('content'));

      return {
        list: [{
          vod_id: id,
          vod_name: title,
          vod_pic: absolute(image.attr('data-src') || image.attr('data-original') || image.attr('src'), response.host),
          vod_remarks: meta.find((text) => /更新|集|完结/.test(text)) || '',
          vod_actor: clean(playerObject(response.html)?.vod_data?.vod_actor || meta.find((text) => text.startsWith('演员')) || ''),
          vod_director: clean(playerObject(response.html)?.vod_data?.vod_director || meta.find((text) => text.startsWith('导演')) || ''),
          vod_content: content,
          vod_play_from: names.join('$$$'),
          vod_play_url: groups.join('$$$'),
        }],
      };
    });

    fastify.post('/search', async (request) => {
      const body = request.body || {};
      const page = pageOf(body);
      const keyword = one(body.wd || body.keyword || body.word).trim();
      if (!keyword) return { list: [], page, pagecount: page, limit: 0, total: 0 };
      const direct = await searchSuggest(keyword);
      if (direct.length) {
        return { list: direct, page, pagecount: page, limit: direct.length, total: direct.length };
      }
      const path = `/vodsearch/-------------.html?wd=${encodeURIComponent(keyword)}&page=${page}`;
      const response = await siteGet(path);
      let list = searchCards(response.html, response.host);
      if (!list.length) list = cards(response.html, response.host);
      return { list, page, pagecount: page + Number(list.length > 0), limit: list.length || 24, total: list.length ? 9999 : 0 };
    });

    fastify.post('/play', async (request) => {
      let id = one(request.body?.id || request.body?.play);
      if (!id) return { parse: 0, url: '' };
      if (/^\d+-\d+-\d+$/.test(id)) id = `/vodplay/${id}.html`;
      const path = /^https?:\/\//i.test(id) ? new URL(id).pathname + new URL(id).search : id;
      const response = await siteGet(path);
      const player = playerObject(response.html);
      const url = decodePlayerUrl(player);
      if (/^https?:\/\/[^\s]+$/i.test(url)) {
        return { parse: 0, url, header: { 'User-Agent': UA, Referer: response.host + '/' } };
      }
      return { parse: 1, url: response.host + path, header: { 'User-Agent': UA, Referer: response.host + '/' } };
    });
  },
};

export default function createSpider() { return __spider; }
