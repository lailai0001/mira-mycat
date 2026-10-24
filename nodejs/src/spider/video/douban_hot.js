import req from '../../util/req.js';
function normHeaders(h) {
  const o = {};
  try { for (const [k, v] of Object.entries(h || {})) o[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v; } catch (e) {}
  return o;
}
// Cat-contract transport: axios (req) first, typeof-guarded fetch fallback only.
// Returns engine-style { status, headers, text, content, data, buf } so the
// original hmtv call sites keep working. HTTP error statuses are returned,
// not thrown (original engine req resolved with status); network failures throw.
async function httpReq(url, opt = {}) {
  const o = opt || {};
  const headers = Object.assign({}, o.headers || {});
  delete headers['Accept-Encoding']; delete headers['accept-encoding'];
  const timeout = o.timeout || 20000;
  const binary = !!o.binary;
  const method = (o.method || (o.body != null ? 'POST' : 'GET')).toUpperCase();
  const data = o.body !== undefined ? o.body : o.data;
  try {
    const r = await req({ method, url, headers, data, timeout, responseType: binary ? 'arraybuffer' : 'text', maxRedirects: 5 });
    const buf = binary ? Buffer.from(r.data || []) : undefined;
    const text = binary ? '' : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
    return { status: r.status || 200, headers: normHeaders(r.headers), text, content: text, data: r.data, buf };
  } catch (e) {
    if (e && e.response) {
      const d = e.response.data;
      const buf = binary ? Buffer.from(d || []) : undefined;
      const text = binary ? '' : (typeof d === 'string' ? d : JSON.stringify(d ?? ''));
      return { status: e.response.status || 0, headers: normHeaders(e.response.headers), text, content: text, data: d, buf };
    }
    if (typeof fetch !== 'undefined') {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      try {
        const r = await fetch(url, { method, headers, body: (method === 'GET' || method === 'HEAD') ? undefined : data, signal: ctl.signal, redirect: 'follow' });
        const headers2 = {}; try { r.headers.forEach((v, k) => { headers2[String(k).toLowerCase()] = v; }); } catch (e2) {}
        if (binary) { const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, headers: headers2, text: '', content: '', data: buf, buf }; }
        const text = await r.text(); return { status: r.status, headers: headers2, text, content: text, data: text };
      } finally { clearTimeout(t); }
    }
    throw e;
  }
}

/*
 * 豆瓣热门（douban_hot）· 站点层
 * ---------------------------------------------------------------------------
 * 数据源：豆瓣 frodo API（微信小程序接口）
 *   推荐   /subject_collection/subject_real_time_hotest/items
 *   分类   /movie/hot_gaia、/movie/recommend、/tv/recommend、/subject_collection/<id>/items
 *   搜索   /search/subjects?q=
 *   详情   /subject/<id>
 *
 * 豆瓣没有播放源：播放返回 parse:1（交给壳子做聚合搜索）。
 * 封面地址带上 @Referer=... 后缀，壳子会据此带请求头取图。
 */
const API_KEY = '0ac44ae016490db2204ce0a042db2916';
const BASE = 'https://frodo.douban.com/api/v2';

const HEADERS = {
  Referer: 'https://servicewechat.com/wx2f9b06c1de1ccfca/84/page-frame.html',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.143 Safari/537.36 MicroMessenger/7.0.9.501 NetType/WIFI MiniProgramEnv/Windows WindowsWechat',
  Accept: 'application/json',
};


const CLASSES = [
  { type_id: 'hot_gaia', type_name: '热门电影' },
  { type_id: 'tv_hot', type_name: '热播剧集' },
  { type_id: 'anime_hot', type_name: '热门动漫' },
  { type_id: 'show_hot', type_name: '热播综艺' },
  { type_id: 'movie', type_name: '电影筛选' },
  { type_id: 'tv', type_name: '电视筛选' },
  { type_id: 'rank_list_movie', type_name: '电影榜单' },
  { type_id: 'rank_list_tv', type_name: '电视剧榜单' },
];

const CATEGORY_CONFIG = {
  hot_gaia: { path: '/movie/hot_gaia', sort: 'recommend', area: '全部' },
  tv_hot: { collection: 'type', default: 'tv_hot' },
  show_hot: { collection: 'type', default: 'show_hot' },
  rank_list_movie: { collection: '榜单', default: 'movie_real_time_hotest' },
  rank_list_tv: { collection: '榜单', default: 'tv_real_time_hotest' },
  anime_hot: { recommend: 'tv', tags: 'anime', noPicFilter: true },
  tv: { recommend: 'tv', tags: 'tv' },
  movie: { recommend: 'movie', tags: 'movie' },
};

const SORTS = [{ n: '近期热度', v: 'T' }, { n: '首播时间', v: 'R' }, { n: '高分优先', v: 'S' }];
const YEARS = [{ n: '全部', v: '' }, { n: '2026', v: '2026' }, { n: '2025', v: '2025' }, { n: '2024', v: '2024' }, { n: '2023', v: '2023' }, { n: '2022', v: '2022' }, { n: '2021', v: '2021' }, { n: '2020', v: '2020' }, { n: '2019', v: '2019' }, { n: '2010年代', v: '2010年代' }, { n: '2000年代', v: '2000年代' }, { n: '90年代', v: '90年代' }, { n: '更早', v: '更早' }];
const AREAS = ['华语', '欧美', '中国', '美国', '中国香港', '中国台湾', '韩国', '日本', '英国', '法国'];

const FILTERS = {
  hot_gaia: [
    { key: 'sort', name: '排序', value: [{ n: '热度', v: 'recommend' }, { n: '最新', v: 'time' }, { n: '评分', v: 'rank' }] },
    { key: 'area', name: '地区', value: [{ n: '全部', v: '全部' }, { n: '华语', v: '华语' }, { n: '欧美', v: '欧美' }, { n: '韩国', v: '韩国' }, { n: '日本', v: '日本' }] },
  ],
  tv_hot: [
    { key: 'type', name: '分类', value: [{ n: '综合', v: 'tv_hot' }, { n: '国产剧', v: 'tv_domestic' }, { n: '欧美剧', v: 'tv_american' }, { n: '日剧', v: 'tv_japanese' }, { n: '韩剧', v: 'tv_korean' }, { n: '动画', v: 'tv_animation' }] },
  ],
  show_hot: [
    { key: 'type', name: '分类', value: [{ n: '综合', v: 'show_hot' }, { n: '国内', v: 'show_domestic' }, { n: '国外', v: 'show_foreign' }] },
  ],
  rank_list_movie: [
    { key: '榜单', name: '榜单', value: [{ n: '实时热门电影', v: 'movie_real_time_hotest' }, { n: '一周口碑电影榜', v: 'movie_weekly_best' }, { n: '豆瓣电影Top250', v: 'movie_top250' }] },
  ],
  rank_list_tv: [
    { key: '榜单', name: '榜单', value: [{ n: '实时热门电视', v: 'tv_real_time_hotest' }, { n: '华语口碑剧集榜', v: 'tv_chinese_best_weekly' }, { n: '全球口碑剧集榜', v: 'tv_global_best_weekly' }, { n: '国内口碑综艺榜', v: 'show_chinese_best_weekly' }, { n: '国外口碑综艺榜', v: 'show_global_best_weekly' }] },
  ],
  anime_hot: [
    { key: '类型', name: '类型', value: [{ n: '全部', v: '' }, { n: '热血', v: '热血' }, { n: '搞笑', v: '搞笑' }, { n: '恋爱', v: '恋爱' }, { n: '校园', v: '校园' }, { n: '科幻', v: '科幻' }, { n: '奇幻', v: '奇幻' }, { n: '悬疑', v: '悬疑' }, { n: '治愈', v: '治愈' }, { n: '运动', v: '运动' }, { n: '机甲', v: '机甲' }, { n: '少女', v: '少女' }, { n: '少年', v: '少年' }] },
    { key: '地区', name: '地区', value: [{ n: '全部', v: '' }, { n: '日本', v: '日本' }, { n: '中国大陆', v: '中国大陆' }, { n: '美国', v: '美国' }, { n: '韩国', v: '韩国' }, { n: '英国', v: '英国' }, { n: '法国', v: '法国' }] },
    { key: 'sort', name: '排序', value: SORTS },
    { key: '年代', name: '年代', value: YEARS },
  ],
  movie: [
    { key: '类型', name: '类型', value: [{ n: '全部类型', v: '' }, { n: '喜剧', v: '喜剧' }, { n: '爱情', v: '爱情' }, { n: '动作', v: '动作' }, { n: '科幻', v: '科幻' }, { n: '动画', v: '动画' }, { n: '悬疑', v: '悬疑' }, { n: '犯罪', v: '犯罪' }, { n: '惊悚', v: '惊悚' }, { n: '冒险', v: '冒险' }, { n: '音乐', v: '音乐' }, { n: '历史', v: '历史' }, { n: '奇幻', v: '奇幻' }, { n: '恐怖', v: '恐怖' }, { n: '战争', v: '战争' }, { n: '传记', v: '传记' }, { n: '歌舞', v: '歌舞' }, { n: '武侠', v: '武侠' }, { n: '灾难', v: '灾难' }, { n: '西部', v: '西部' }, { n: '纪录片', v: '纪录片' }, { n: '短片', v: '短片' }] },
    { key: '地区', name: '地区', value: [{ n: '全部地区', v: '' }].concat(AREAS.map((v) => ({ n: v, v }))) },
    { key: 'sort', name: '排序', value: SORTS },
    { key: '年代', name: '年代', value: YEARS },
  ],
  tv: [
    { key: '类型', name: '类型', value: [{ n: '不限', v: '' }, { n: '电视剧', v: '电视剧' }, { n: '综艺', v: '综艺' }] },
    { key: '电视剧形式', name: '电视剧形式', value: [{ n: '不限', v: '' }, { n: '喜剧', v: '喜剧' }, { n: '爱情', v: '爱情' }, { n: '悬疑', v: '悬疑' }, { n: '动画', v: '动画' }, { n: '武侠', v: '武侠' }, { n: '古装', v: '古装' }, { n: '家庭', v: '家庭' }, { n: '犯罪', v: '犯罪' }, { n: '科幻', v: '科幻' }, { n: '恐怖', v: '恐怖' }, { n: '历史', v: '历史' }, { n: '战争', v: '战争' }, { n: '动作', v: '动作' }, { n: '冒险', v: '冒险' }, { n: '传记', v: '传记' }, { n: '剧情', v: '剧情' }, { n: '奇幻', v: '奇幻' }, { n: '惊悚', v: '惊悚' }, { n: '灾难', v: '灾难' }, { n: '歌舞', v: '歌舞' }, { n: '音乐', v: '音乐' }] },
    { key: '综艺形式', name: '综艺形式', value: [{ n: '不限', v: '' }, { n: '真人秀', v: '真人秀' }, { n: '脱口秀', v: '脱口秀' }, { n: '音乐', v: '音乐' }, { n: '歌舞', v: '歌舞' }] },
    { key: '地区', name: '地区', value: [{ n: '全部地区', v: '' }].concat(AREAS.map((v) => ({ n: v, v }))) },
    { key: 'sort', name: '排序', value: SORTS },
    { key: '年代', name: '年代', value: YEARS },
    { key: '平台', name: '平台', value: [{ n: '全部', v: '' }, { n: '腾讯视频', v: '腾讯视频' }, { n: '爱奇艺', v: '爱奇艺' }, { n: '优酷', v: '优酷' }, { n: '湖南卫视', v: '湖南卫视' }, { n: 'Netflix', v: 'Netflix' }, { n: 'HBO', v: 'HBO' }, { n: 'BBC', v: 'BBC' }, { n: 'NHK', v: 'NHK' }, { n: 'CBS', v: 'CBS' }, { n: 'NBC', v: 'NBC' }, { n: 'tvN', v: 'tvN' }] },
  ],
};

let cookie = '';

async function api(path) {
  const headers = Object.assign({}, HEADERS);
  if (cookie) headers.Cookie = cookie;
  try {
    const r = await httpReq(BASE + path, { headers, timeout: 12000 });
    const sc = r && r.headers && r.headers['set-cookie'];
    if (sc) cookie = Array.isArray(sc) ? String(sc[0]).split(';')[0] : String(sc).split(';')[0];
    const text = String((r && (r.content || r.text || r.data)) || '');
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

let picBase = '';

// 走引擎图片代理：苹果壳子不认 @Referer= 后缀，豆瓣图床无 Referer 会 418
const picOf = (p) => {
  const u = p && (p.normal || p.large || p);
  if (!u) return '';
  const url = String(u);
  return picBase ? picBase + '/img?u=' + encodeURIComponent(url) : url;
};

function convert(item) {
  if (!item || !item.id) return null;
  const rating = item.rating && item.rating.value != null ? item.rating.value : 0;
  return {
    vod_id: 'msearch:' + String(item.id),
    vod_name: String(item.title || item.name || ''),
    vod_pic: picOf(item.pic || { normal: item.cover_url || item.cover }),
    vod_remarks: rating ? '评分：' + rating : item.year ? String(item.year) : '评分：0',
  };
}

const uniq = (arr) => {
  const seen = new Set();
  return arr.filter((x) => x && x.vod_name && !seen.has(x.vod_id) && seen.add(x.vod_id));
};

function buildTags(mode, ext) {
  const tags = mode === 'anime' ? ['动画'] : [];
  if (ext['类型']) tags.push(ext['类型']);
  if (mode === 'tv') {
    if (ext['电视剧形式']) tags.push(ext['电视剧形式']);
    if (ext['综艺形式']) tags.push(ext['综艺形式']);
  }
  if (ext['地区']) tags.push(ext['地区']);
  if (mode === 'tv' && ext['平台']) tags.push(ext['平台']);
  if (ext['年代']) tags.push(ext['年代']);
  return tags.filter(Boolean).join(',');
}

export default function createSpider() {
  return {
  meta: { key: 'py_douban_hot', name: '🔥热门·推荐', type: 3, searchable: 1, quickSearch: 1, filterable: 1 },

  api: async (fastify) => {
    fastify.post('/init', async () => ({}));
    fastify.post('/home', async (request) => {
      picBase = ''; // NOTE(D批): 猫源无 /img 路由，封面直出豆瓣原地址
      const data = await api('/subject_collection/subject_real_time_hotest/items?apikey=' + API_KEY + '&start=0&count=50');
      let list = uniq(((data && data.subject_collection_items) || []).map(convert).filter((v) => v && v.vod_pic));
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return { class: CLASSES, filters: FILTERS, list: list.slice(0, 20) };
    });

    fastify.post('/category', async (request) => {
      picBase = ''; // NOTE(D批): 猫源无 /img 路由，封面直出豆瓣原地址
      const body = request.body || {};
      const tid = String(body.id || body.type_id || 'movie').trim();
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      const start = (page - 1) * 20;
      const ext = Object.assign({}, body.filters || {}, body.extend || {});
      const cfg = CATEGORY_CONFIG[tid] || CATEGORY_CONFIG.movie;

      let path;
      let itemsKey = 'items';
      if (cfg.collection) {
        const cid = ext[cfg.collection] || cfg.default;
        path = '/subject_collection/' + encodeURIComponent(cid) + '/items?apikey=' + API_KEY + '&start=' + start + '&count=20';
        itemsKey = 'subject_collection_items';
      } else if (cfg.recommend) {
        const tags = buildTags(cfg.tags, ext);
        path = '/' + cfg.recommend + '/recommend?apikey=' + API_KEY + '&sort=' + encodeURIComponent(ext.sort || 'T') + '&tags=' + encodeURIComponent(tags) + '&start=' + start + '&count=20';
      } else {
        path = cfg.path + '?apikey=' + API_KEY + '&sort=' + encodeURIComponent(ext.sort || cfg.sort) + '&area=' + encodeURIComponent(ext.area || cfg.area) + '&start=' + start + '&count=20';
      }

      const data = await api(path);
      let list = uniq(((data && data[itemsKey]) || []).map(convert));
      if (!cfg.noPicFilter) list = list.filter((v) => v.vod_pic);
      return { page, pagecount: list.length >= 20 ? page + 1 : page, limit: 20, total: list.length ? 9999 : 0, list };
    });

    fastify.post('/search', async (request) => {
      picBase = ''; // NOTE(D批): 猫源无 /img 路由，封面直出豆瓣原地址
      const body = request.body || {};
      const wd = String(body.wd || body.keyword || '').trim();
      const page = Math.max(1, parseInt(body.page, 10) || 1);
      if (!wd) return { page, pagecount: page, limit: 20, total: 0, list: [] };
      const start = (page - 1) * 20;
      const data = await api('/search/subjects?apikey=' + API_KEY + '&q=' + encodeURIComponent(wd) + '&start=' + start + '&count=20');
      const container = (data && (data.subjects || data)) || {};
      const rows = Array.isArray(container.items) ? container.items : (data && Array.isArray(data.items) ? data.items : []);
      const list = uniq(
        rows.map((row) => convert(row.target || row.subject || row))
      );
      return { page, pagecount: page, limit: 20, total: list.length, list };
    });

    fastify.post('/detail', async (request) => {
      picBase = ''; // NOTE(D批): 猫源无 /img 路由，封面直出豆瓣原地址
      const body = request.body || {};
      const raw = Array.isArray(body.id) ? body.id[0] : body.id || body.ids;
      const id = String(raw || '').replace(/^msearch:/, '').replace(/[^0-9A-Za-z]/g, '');
      if (!id) return { list: [] };
      const d = await api('/subject/' + id + '?apikey=' + API_KEY);
      if (!d) return { list: [] };
      const join = (arr) => (Array.isArray(arr) ? arr.map((x) => x && x.name).filter(Boolean).join(' / ') : '');
      const rating = d.rating && d.rating.value != null ? d.rating.value : 0;
      return {
        list: [
          {
            vod_id: raw,
            vod_name: String(d.title || ''),
            vod_pic: picOf(d.pic),
            vod_remarks: rating ? '评分：' + rating : '评分：0',
            vod_actor: join(d.actors),
            vod_director: join(d.directors),
            vod_content: String(d.intro || ''),
            vod_year: d.year ? String(d.year) : '',
            vod_area: Array.isArray(d.countries) ? d.countries.join(' / ') : '',
            vod_play_from: '豆瓣详情',
            vod_play_url: '暂无播放源$noop',
          },
        ],
      };
    });

    // 豆瓣没有播放源：交给壳子做聚合搜索
    fastify.post('/play', async () => ({ parse: 1, jx: 1, url: '' }));
  },
};
}
