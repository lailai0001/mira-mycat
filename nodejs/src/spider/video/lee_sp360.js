import req from '../../util/req.js';
// 360影视（LeeCatPaw lee_sp360 移植）：直连 360kan 官方 API；播放为嗅探（parse:1, jx:1），与 bundle 原实现一致。
// 筛选表取自 bundle 开头的 leeLegacyFilters.sp360（逐字）。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/91.0.4472.114 Safari/537.36';
async function getJson(url, headers = {}) {
  try {
    const r = await req({ method: 'GET', url, headers: Object.assign({ 'User-Agent': UA }, headers), timeout: 15000, responseType: 'text', maxRedirects: 5 });
    const text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    return JSON.parse(text);
  } catch (e) {
    if (e && e.response) throw new Error('HTTP ' + e.response.status + ' ' + url);
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, headers), signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
        return await r.json();
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}
const asVideo = (name, id, pic = '', remarks = '') => ({ vod_id: String(id || ''), vod_name: String(name || ''), vod_pic: String(pic || ''), vod_remarks: String(remarks || '') });
const one = (value) => String(Array.isArray(value) ? value[0] : value || '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const spCategories = [['1', '电影'], ['2', '电视剧'], ['3', '综艺'], ['4', '动漫']]
  .map(([type_id, type_name]) => ({ type_id, type_name }));
const spHeaders = { Referer: 'https://api.web.360kan.com' };
const spFilters = {"1": [{"key": "class", "name": "类型", "value": [{"n": "全部类型", "v": ""}, {"n": "喜剧", "v": "喜剧"}, {"n": "爱情", "v": "爱情"}, {"n": "动作", "v": "动作"}, {"n": "恐怖", "v": "恐怖"}, {"n": "科幻", "v": "科幻"}, {"n": "剧情", "v": "剧情"}, {"n": "犯罪", "v": "犯罪"}, {"n": "奇幻", "v": "奇幻"}, {"n": "战争", "v": "战争"}, {"n": "悬疑", "v": "悬疑"}, {"n": "动画", "v": "动画"}, {"n": "文艺", "v": "文艺"}, {"n": "记录", "v": "记录"}, {"n": "传记", "v": "传记"}, {"n": "歌舞", "v": "歌舞"}, {"n": "古装", "v": "古装"}, {"n": "历史", "v": "历史"}, {"n": "惊悚", "v": "惊悚"}, {"n": "伦理", "v": "伦理"}, {"n": "其他", "v": "其他"}]}, {"key": "year", "name": "年代", "value": [{"n": "全部年代", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}, {"n": "2014", "v": "2014"}, {"n": "2013", "v": "2013"}, {"n": "2012", "v": "2012"}, {"n": "2011", "v": "2011"}, {"n": "2010", "v": "2010"}, {"n": "2009", "v": "2009"}, {"n": "2008", "v": "2008"}, {"n": "2007", "v": "2007"}, {"n": "更早", "v": "更早"}]}, {"key": "area", "name": "地区", "value": [{"n": "全部地区", "v": ""}, {"n": "内地", "v": "大陆"}, {"n": "中国香港", "v": "香港"}, {"n": "中国台湾", "v": "台湾"}, {"n": "泰国", "v": "泰国"}, {"n": "美国", "v": "美国"}, {"n": "韩国", "v": "韩国"}, {"n": "日本", "v": "日本"}, {"n": "法国", "v": "法国"}, {"n": "英国", "v": "英国"}, {"n": "德国", "v": "德国"}, {"n": "印度", "v": "印度"}, {"n": "其他", "v": "其他"}]}, {"key": "actor", "name": "明星", "value": [{"n": "全部明星", "v": ""}, {"n": "成龙", "v": "成龙"}, {"n": "周星驰", "v": "周星驰"}, {"n": "李连杰", "v": "李连杰"}, {"n": "林正英", "v": "林正英"}, {"n": "吴京", "v": "吴京"}, {"n": "徐峥", "v": "徐峥"}, {"n": "黄渤", "v": "黄渤"}, {"n": "王宝强", "v": "王宝强"}, {"n": "李小龙", "v": "李小龙"}, {"n": "张国荣", "v": "张国荣"}, {"n": "洪金宝", "v": "洪金宝"}, {"n": "姜文", "v": "姜文"}, {"n": "沈腾", "v": "沈腾"}, {"n": "邓超", "v": "邓超"}, {"n": "巩俐", "v": "巩俐"}, {"n": "马丽", "v": "马丽"}, {"n": "闫妮", "v": "闫妮"}, {"n": "周冬雨", "v": "周冬雨"}, {"n": "刘昊然", "v": "刘昊然"}, {"n": "汤唯", "v": "汤唯"}, {"n": "舒淇", "v": "舒淇"}, {"n": "白百何", "v": "白百何"}]}, {"key": "by", "name": "排序", "value": [{"n": "最近热映", "v": "rankhot"}, {"n": "最近上映", "v": "ranklatest"}, {"n": "最受好评", "v": "rankpoint"}]}], "2": [{"key": "class", "name": "类型", "value": [{"n": "全部类型", "v": ""}, {"n": "言情", "v": "言情"}, {"n": "剧情", "v": "剧情"}, {"n": "伦理", "v": "伦理"}, {"n": "喜剧", "v": "喜剧"}, {"n": "悬疑", "v": "悬疑"}, {"n": "都市", "v": "都市"}, {"n": "偶像", "v": "偶像"}, {"n": "古装", "v": "古装"}, {"n": "军事", "v": "军事"}, {"n": "警匪", "v": "警匪"}, {"n": "历史", "v": "历史"}, {"n": "励志", "v": "励志"}, {"n": "神话", "v": "神话"}, {"n": "谍战", "v": "谍战"}, {"n": "青春", "v": "青春"}, {"n": "家庭", "v": "家庭"}, {"n": "动作", "v": "动作"}, {"n": "情景", "v": "情景"}, {"n": "武侠", "v": "武侠"}, {"n": "科幻", "v": "科幻"}, {"n": "其他", "v": "其他"}]}, {"key": "year", "name": "年代", "value": [{"n": "全部年代", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}, {"n": "2014", "v": "2014"}, {"n": "2013", "v": "2013"}, {"n": "2012", "v": "2012"}, {"n": "2011", "v": "2011"}, {"n": "2010", "v": "2010"}, {"n": "2009", "v": "2009"}, {"n": "2008", "v": "2008"}, {"n": "2007", "v": "2007"}, {"n": "更早", "v": "更早"}]}, {"key": "area", "name": "地区", "value": [{"n": "全部地区", "v": ""}, {"n": "内地", "v": "内地"}, {"n": "中国香港", "v": "香港"}, {"n": "中国台湾", "v": "台湾"}, {"n": "泰国", "v": "泰国"}, {"n": "日本", "v": "日本"}, {"n": "韩国", "v": "韩国"}, {"n": "美国", "v": "美国"}, {"n": "英国", "v": "英国"}, {"n": "新加坡", "v": "新加坡"}]}, {"key": "actor", "name": "明星", "value": [{"n": "全部明星", "v": ""}, {"n": "杨幂", "v": "杨幂"}, {"n": "热巴", "v": "迪丽热巴"}, {"n": "张嘉译", "v": "张嘉译"}, {"n": "赵丽颖", "v": "赵丽颖"}, {"n": "赵又廷", "v": "赵又廷"}, {"n": "胡歌", "v": "胡歌"}, {"n": "孙俪", "v": "孙俪"}, {"n": "韩东君", "v": "韩东君"}, {"n": "周迅", "v": "周迅"}, {"n": "张一山", "v": "张一山"}, {"n": "李小璐", "v": "李小璐"}, {"n": "李沁", "v": "李沁"}, {"n": "陈坤", "v": "陈坤"}, {"n": "刘亦菲", "v": "刘亦菲"}, {"n": "唐嫣", "v": "唐嫣"}, {"n": "李小冉", "v": "李小冉"}, {"n": "周冬雨", "v": "周冬雨"}, {"n": "于和伟", "v": "于和伟"}, {"n": "李易峰", "v": "李易峰"}, {"n": "雷佳音", "v": "雷佳音"}, {"n": "何冰", "v": "何冰"}, {"n": "阮经天", "v": "阮经天"}, {"n": "梅婷", "v": "梅婷"}, {"n": "徐峥", "v": "徐峥"}, {"n": "祖峰", "v": "祖峰"}, {"n": "秦海璐", "v": "秦海璐"}, {"n": "杨紫", "v": "杨紫"}, {"n": "任嘉伦", "v": "任嘉伦"}, {"n": "贾乃亮", "v": "贾乃亮"}, {"n": "罗晋", "v": "罗晋"}]}, {"key": "by", "name": "排序", "value": [{"n": "最近热映", "v": "rankhot"}, {"n": "最近上映", "v": "ranklatest"}, {"n": "最受好评", "v": "rankpoint"}]}], "3": [{"key": "class", "name": "类型", "value": [{"n": "全部类型", "v": ""}, {"n": "脱口秀", "v": "脱口秀"}, {"n": "真人秀", "v": "真人秀"}, {"n": "搞笑", "v": "搞笑"}, {"n": "选秀", "v": "选秀"}, {"n": "八卦", "v": "八卦"}, {"n": "访谈", "v": "访谈"}, {"n": "情感", "v": "情感"}, {"n": "生活", "v": "生活"}, {"n": "晚会", "v": "晚会"}, {"n": "音乐", "v": "音乐"}, {"n": "职场", "v": "职场"}, {"n": "美食", "v": "美食"}, {"n": "时尚", "v": "时尚"}, {"n": "游戏", "v": "游戏"}, {"n": "少儿", "v": "少儿"}, {"n": "体育", "v": "体育"}, {"n": "纪实", "v": "纪实"}, {"n": "科教", "v": "科教"}, {"n": "曲艺", "v": "曲艺"}, {"n": "歌舞", "v": "歌舞"}, {"n": "财经", "v": "财经"}, {"n": "汽车", "v": "汽车"}, {"n": "播报", "v": "播报"}, {"n": "其他", "v": "其他"}]}, {"key": "area", "name": "地区", "value": [{"n": "全部地区", "v": ""}, {"n": "中国大陆", "v": "中国大陆"}, {"n": "美国", "v": "美国"}, {"n": "日本", "v": "日本"}, {"n": "中国香港", "v": "中国香港"}, {"n": "中国台湾", "v": "中国台湾"}, {"n": "韩国", "v": "韩国"}, {"n": "欧洲", "v": "欧洲"}, {"n": "其他", "v": "泰国"}]}, {"key": "actor", "name": "明星", "value": [{"n": "全部明星", "v": ""}, {"n": "邓超", "v": "邓超"}, {"n": "陈赫", "v": "陈赫"}, {"n": "何炅", "v": "何炅"}, {"n": "汪涵", "v": "汪涵"}, {"n": "王俊凯", "v": "王俊凯"}, {"n": "黄磊", "v": "黄磊"}, {"n": "谢娜", "v": "谢娜"}, {"n": "黄渤", "v": "黄渤"}, {"n": "周杰伦", "v": "周杰伦"}, {"n": "薛之谦", "v": "薛之谦"}, {"n": "Angelababy", "v": "Angelababy"}, {"n": "易烊千玺", "v": "易烊千玺"}, {"n": "岳云鹏", "v": "岳云鹏"}, {"n": "王嘉尔", "v": "王嘉尔"}, {"n": "鹿晗", "v": "鹿晗"}, {"n": "杨幂", "v": "杨幂"}, {"n": "沈腾", "v": "沈腾"}, {"n": "张艺兴", "v": "张艺兴"}, {"n": "潘玮柏", "v": "潘玮柏"}, {"n": "华晨宇", "v": "华晨宇"}, {"n": "李维嘉", "v": "李维嘉"}, {"n": "宋小宝", "v": "宋小宝"}, {"n": "贾玲", "v": "贾玲"}, {"n": "沙溢", "v": "沙溢"}, {"n": "撒贝宁", "v": "撒贝宁"}, {"n": "涂磊", "v": "涂磊"}]}, {"key": "by", "name": "排序", "value": [{"n": "最近热映", "v": "rankhot"}, {"n": "最近上映", "v": "ranklatest"}]}], "4": [{"key": "class", "name": "类型", "value": [{"n": "全部类型", "v": ""}, {"n": "热血", "v": "热血"}, {"n": "科幻", "v": "科幻"}, {"n": "美少女", "v": "美少女"}, {"n": "魔幻", "v": "魔幻"}, {"n": "经典", "v": "经典"}, {"n": "励志", "v": "励志"}, {"n": "少儿", "v": "少儿"}, {"n": "冒险", "v": "冒险"}, {"n": "搞笑", "v": "搞笑"}, {"n": "推理", "v": "推理"}, {"n": "恋爱", "v": "恋爱"}, {"n": "治愈", "v": "治愈"}, {"n": "幻想", "v": "幻想"}, {"n": "校园", "v": "校园"}, {"n": "动物", "v": "动物"}, {"n": "机战", "v": "机战"}, {"n": "亲子", "v": "亲子"}, {"n": "儿歌", "v": "儿歌"}, {"n": "运动", "v": "运动"}, {"n": "悬疑", "v": "悬疑"}, {"n": "怪物", "v": "怪物"}, {"n": "战争", "v": "战争"}, {"n": "益智", "v": "益智"}, {"n": "青春", "v": "青春"}, {"n": "童话", "v": "童话"}, {"n": "竞技", "v": "竞技"}, {"n": "动作", "v": "动作"}, {"n": "社会", "v": "社会"}, {"n": "友情", "v": "友情"}, {"n": "真人版", "v": "真人版"}, {"n": "电影版", "v": "电影版"}, {"n": "OVA版", "v": "OVA版"}]}, {"key": "year", "name": "年代", "value": [{"n": "全部年代", "v": ""}, {"n": "2024", "v": "2024"}, {"n": "2023", "v": "2023"}, {"n": "2022", "v": "2022"}, {"n": "2021", "v": "2021"}, {"n": "2020", "v": "2020"}, {"n": "2019", "v": "2019"}, {"n": "2018", "v": "2018"}, {"n": "2017", "v": "2017"}, {"n": "2016", "v": "2016"}, {"n": "2015", "v": "2015"}, {"n": "2014", "v": "2014"}, {"n": "2013", "v": "2013"}, {"n": "2012", "v": "2012"}, {"n": "2011", "v": "2011"}, {"n": "2010", "v": "2010"}, {"n": "2009", "v": "2009"}, {"n": "2008", "v": "2008"}, {"n": "2007", "v": "2007"}, {"n": "2006", "v": "2006"}, {"n": "2005", "v": "2005"}, {"n": "2004", "v": "2004"}, {"n": "更早", "v": "更早"}]}, {"key": "area", "name": "地区", "value": [{"n": "全部地区", "v": ""}, {"n": "内地", "v": "大陆"}, {"n": "美国", "v": "美国"}, {"n": "日本", "v": "日本"}]}, {"key": "by", "name": "排序", "value": [{"n": "最近热映", "v": "rankhot"}, {"n": "最近上映", "v": "ranklatest"}]}]};
function spId(category, id) {
  return JSON.stringify({ detailUrl: `https://api.web.360kan.com/v1/detail?cat=${category}&id=${encodeURIComponent(id)}&callback=` });
}
export default function createSpider() {
  return {
  meta: { key: 'lee_sp360', name: '360影视', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },
  api: async function (fastify) {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async () => ({ class: spCategories, filters: spFilters }));
    fastify.post('/category', async (request) => {
      const id = String(request.body?.id || '');
      const page = pageOf(request);
      if (!spCategories.some((item) => item.type_id === id)) return { page, pagecount: page, list: [] };
      const filters = request.body?.extend || {};
      const query = new URLSearchParams({ catid: id, rank: String(filters.by || 'ranklatest'), cat: String(filters.class || ''),
        year: String(filters.year || ''), area: String(filters.area || ''), act: String(filters.actor || ''), size: '35', callback: '' });
      if (page > 1) query.set('pageno', String(page));
      const result = await getJson(`https://api.web.360kan.com/v1/filter/list?${query}`, spHeaders);
      const list = (result.data?.movies || []).filter((item) => item.id && item.title)
        .map((item) => asVideo(item.title, spId(id, item.id), item.cdncover?.startsWith('//') ? `https:${item.cdncover}` : item.cdncover,
          id === '2' || id === '4' ? item.upinfo === item.total ? '已完结' : `更新至${item.upinfo || ''}集` : id === '3' ? `更新至${item.tag || ''}` : ''));
      return { page, pagecount: list.length ? page + 1 : page, list };
    });
    fastify.post('/search', async (request) => {
      const wd = String(request.body?.wd || '').trim();
      const page = pageOf(request);
      if (!wd) return { page, pagecount: page, list: [] };
      const result = await getJson(`https://api.so.360kan.com/index?force_v=1&kw=${encodeURIComponent(wd)}&from=&pageno=${page}&v_ap=1&tab=all`, { Referer: `https://so.360kan.com/?kw=${encodeURIComponent(wd)}` });
      const list = (result.data?.longData?.rows || []).filter((item) => item.en_id && item.cat_id)
        .map((item) => asVideo(item.titleTxt, spId(item.cat_id, item.en_id), item.cover, item.cat_name));
      return { page, pagecount: list.length ? page + 1 : page, list };
    });
    fastify.post('/detail', async (request) => {
      let info;
      try { info = JSON.parse(one(request.body?.id)); } catch { return { list: [] }; }
      if (!/^https:\/\/api\.web\.360kan\.com\/v1\/detail\?/.test(info?.detailUrl || '')) return { list: [] };
      const result = await getJson(info.detailUrl, spHeaders);
      const data = result.data || {};
      const lines = [];
      const sites = (data.playlink_sites || []).slice(0, 15);
      const base = info.detailUrl.replace(/&callback=$/, '');
      for (const site of sites) {
        let episodes = [];
        if (data.allepidetail) {
          const more = await getJson(`${base}&site=${encodeURIComponent(site)}&callback=`, spHeaders);
          const count = Math.min(1000, Number(more.data?.allupinfo?.[site]) || 0);
          for (let start = 1; start <= count; start += 200) {
            const detail = await getJson(`${base}&start=${start}&end=${Math.min(count, start + 199)}&site=${encodeURIComponent(site)}&callback=`, spHeaders);
            episodes.push(...(detail.data?.allepidetail?.[site] || []).map((entry) => ({ name: `第${entry.playlink_num}集`, url: entry.url })));
          }
        } else if (data.defaultepisode) {
          const years = Object.keys(data.tag || { '': true });
          for (const year of years) {
            const detail = await getJson(`${base}&site=${encodeURIComponent(site)}&year=${encodeURIComponent(year)}&callback=`, spHeaders);
            episodes.push(...(detail.data?.defaultepisode || []).map((entry) => ({ name: `${entry.period || ''} ${entry.name || ''}`.trim(), url: entry.url })));
          }
        } else {
          const url = data.playlinksdetail?.[site]?.default_url;
          if (url) episodes = [{ name: '正片', url }];
        }
        if (episodes.length) lines.push({ site, episodes });
      }
      return { list: [{ vod_id: one(request.body?.id), vod_name: data.title || '', vod_pic: data.cdncover || '',
        vod_content: data.description || '', vod_year: data.pubdate || '', vod_area: (data.area || []).join(','),
        vod_actor: (data.actor || []).join(','), vod_director: (data.director || []).join(','),
        vod_play_from: lines.map((line) => line.site).join('$$$'),
        vod_play_url: lines.map((line) => line.episodes.map((episode) => `${episode.name.replace(/[$#]/g, '_')}$${episode.url}`).join('#')).join('$$$') }] };
    });
    fastify.post('/play', async (request) => ({ parse: 1, jx: 1, url: one(request.body?.id) }));
  }
};
}
