import req from '../../util/req.js';
// 河马 - 短剧：LeeCatPaw lee_zhenguo_heguo（河果）实现替换原 mycat kuaikaw.cn 规则蜘蛛。
// 同一站方（www.kuaikaw.cn，__NEXT_DATA__ 页面数据 + /browse/ /drama/ /episode/ + seo 搜索）；
// meta（key/name/flags）与注册位置保持 mycat 原值不变，仅实现换成 Lee 版。
const base = 'https://www.kuaikaw.cn';
const cats = [['462', '甜宠'], ['1102', '古装仙侠'], ['1145', '现代言情'], ['1170', '青春'], ['585', '豪门恩怨'], ['417-464', '逆袭'], ['439-465', '重生'], ['1159', '系统'], ['1147', '总裁'], ['943', '职场商战']];
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
const pick = (r, keys) => keys.map((k) => r?.[k]).find((v) => v !== undefined && v !== null && v !== '') || '';
async function getText(path) {
  const r = await req({ method: 'GET', url: base + path, headers: { 'User-Agent': 'Mozilla/5.0', Referer: base + '/' }, timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`河果 HTTP ${r.status}`);
  return typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
}
function props(html) {
  const raw = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>(.*?)<\/script>/s.exec(html)?.[1];
  if (!raw) throw new Error('河果缺少页面数据');
  return JSON.parse(raw).props?.pageProps || {};
}
function card(row) {
  const id = pick(row, ['bookId', 'book_id', 'id']);
  if (!id) return null;
  return { vod_id: String(id), vod_name: String(pick(row, ['bookName', 'title', 'name']) || id), vod_pic: pick(row, ['coverWap', 'cover', 'coverUrl']), vod_remarks: row.totalChapterNum ? `全${row.totalChapterNum}集` : '', vod_content: pick(row, ['introduction', 'intro', 'description']) };
}
function cards(data) {
  const list = [...(data.bookList || []), ...(data.bannerList || []), ...(data.recommendList || []), ...(data.seoColumnVos || []).flatMap((r) => r.bookInfos || [])];
  const seen = new Set();
  return list.map(card).filter((r) => r && !seen.has(r.vod_id) && seen.add(r.vod_id));
}
async function listing(cat, page) {
  const path = !cat && page === 1 ? '/' : `/browse/${encodeURIComponent(cat || '462')}/${page}`;
  return cards(props(await getText(path)));
}
async function search(wd) {
  if (!wd) return [];
  const r = await req({ method: 'POST', url: base + '/seo/video/6007', headers: { 'User-Agent': 'Mozilla/5.0', Referer: base + '/', pname: 'www.kuaikaw.cn', 'Content-Type': 'application/json' }, data: JSON.stringify({ sourceType: 1, keyword: wd, index: 1 }), timeout: 20000, responseType: 'text', validateStatus: () => true });
  if (r.status < 200 || r.status >= 300) throw new Error(`河果搜索 HTTP ${r.status}`);
  return cards((JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''))).data || {});
}
async function detail(id) {
  const data = props(await getText(`/drama/${encodeURIComponent(id)}`));
  const row = data.bookInfoVo || {}, chapters = (data.chapterList || []).filter((r) => pick(r, ['chapterId', 'chapter_id', 'id']));
  if (!chapters.length) return { list: [] };
  chapters.sort((a, b) => Number(pick(a, ['chapterNum', 'sort', 'index']) || 0) - Number(pick(b, ['chapterNum', 'sort', 'index']) || 0));
  return { list: [{ ...card({ ...row, bookId: id }), vod_content: pick(row, ['introduction', 'intro', 'description']), vod_remarks: `全${chapters.length}集`, vod_play_from: '河果', vod_play_url: chapters.map((r, i) => {
    const cid = pick(r, ['chapterId', 'chapter_id', 'id']);
    const name = String(pick(r, ['chapterName', 'title']) || `第${i + 1}集`).replace(/[$#]/g, '_');
    return `${name}$heguo://${id}/${cid}`;
  }).join('#') }] };
}
async function play(id) {
  const match = /^heguo:\/\/([^/]+)\/([^/]+)$/.exec(id);
  if (!match) throw new Error('河果分集 ID 无效');
  const path = `/episode/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
  const html = await getText(path), data = props(html);
  const video = data.chapterInfo?.chapterVideoVo || {};
  const url = pick(video, ['mp4', 'mp4720p', 'vodMp4Url']) || /https?:\/\/[^"'\\\s<>]+\.(?:mp4|m3u8)[^"'\\\s<>]*/.exec(html)?.[0];
  if (!/^https?:\/\//.test(url || '')) throw new Error('河果没有媒体地址');
  return { parse: 0, url, header: { Referer: base + path } };
}
const paged = (list, page) => ({ list, page, pagecount: list.length >= 10 ? page + 1 : page, limit: 20, total: list.length });
export default function createSpider() {
  return {
    meta: { key: 'py_hema_duanju', name: '🦛河马 - 短剧', type: 3, searchable: 1, quickSearch: 0, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: cats.map(([type_id, type_name]) => ({ type_id, type_name })), list: await listing('', 1) }));
      fastify.post('/category', async (request) => paged(await listing(one(request.body?.id), pageOf(request)), pageOf(request)));
      fastify.post('/search', async (request) => paged(await search(one(request.body?.wd)), pageOf(request)));
      fastify.post('/detail', async (request) => detail(one(request.body?.id)));
      fastify.post('/play', async (request) => play(one(request.body?.id)));
    },
  };
}
