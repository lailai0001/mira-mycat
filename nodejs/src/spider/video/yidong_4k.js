import req from '../../util/req.js';
import crypto from 'crypto';
// 移动 - 4K：LeeCatPaw lee_yidong4k（移动 • 4K）实现替换原 mycat 移动云盘蜘蛛。
// 同一站方（vidsite.cloudseekr.com + 移动云盘分享）；meta（key/name/flags）与注册位置保持 mycat 原值不变，仅实现换成 Lee 版。
// ⚠️ 回退说明（真机必验）：mycat 旧版会把云盘分享一路解析到可播的 139 文件直链（getContentInfoFromOutLink + 清晰度挑选）；
// Lee 版详情只出分享链接本身（网盘分享一集、play 透传），App 内点播仍需网盘解析层——旧版能播的分享在新版里可能播不了。
// 若真机确认回退，由用户定夺是否恢复旧版实现。
const headers = { Origin: 'https://vidsite.cloudseekr.com', Referer: 'https://vidsite.cloudseekr.com/vid/app/', 'Content-Type': 'application/json; charset=utf-8' };
const endpoint = 'https://vidsite.cloudseekr.com/vidsite/vs/';
const deviceId = crypto.createHash('md5').update(`AiNewYiDong4K_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`).digest('hex');
const one = (value) => String(Array.isArray(value) ? value[0] : value ?? '');
const pageOf = (request) => Math.max(1, Number.parseInt(request.body?.page, 10) || 1);
async function postJson(path, body) {
  const r = await req({ method: 'POST', url: `${endpoint}${path}`, headers, data: JSON.stringify(body), timeout: 12000, responseType: 'text', validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Search HTTP ${r.status}`);
  return JSON.parse(typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
}
function yidongList(items) {
  return (items || []).map((item) => ({ vod_id: String(item.id || ''), vod_name: String(item.title || ''), vod_remarks: '', vod_pic: String(item.appCoverUrl || '') }));
}
async function yidongPage(categoryId, page, keyword = '') {
  const result = await postJson('qryPageColumnVideo', { columnId: Number(categoryId), cateIdList: [0, 0, 0], pageIndex: page, pageSize: 9, ...(keyword ? { searchKey: keyword } : {}) });
  if (result.code !== '000000') return { page, pagecount: page, list: [] };
  return { page, pagecount: result.data?.pages || page, limit: 9, total: result.data?.total || 0, list: yidongList(result.data?.list) };
}
export default function createSpider() {
  return {
    meta: { key: 'py_yidong_4k', name: '♨️移动 - 4K', type: 3, searchable: 1, quickSearch: 1, filterable: 0 },
    api: async (fastify) => {
      fastify.post('/init', async () => ({}));
      fastify.post('/home', async () => ({ class: [['1', '电影'], ['2', '电视剧'], ['3', '动漫']].map(([type_id, type_name]) => ({ type_id, type_name })) }));
      fastify.post('/category', async (request) => {
        const id = String(request.body?.id || '');
        const page = pageOf(request);
        if (!['1', '2', '3'].includes(id)) return { page, pagecount: page, list: [] };
        return yidongPage(id, page);
      });
      fastify.post('/search', async (request) => {
        const keyword = String(request.body?.wd || '').trim();
        const page = pageOf(request);
        if (!keyword) return { page, pagecount: page, list: [] };
        return yidongPage('0', page, keyword);
      });
      fastify.post('/detail', async (request) => {
        const id = one(request.body?.id);
        if (!/^\d+$/.test(id)) return { list: [] };
        const params = { videoId: Number(id), fprint: deviceId };
        const access = await postJson('addAccessRecord', params);
        if (access.code !== '000000') return { list: [] };
        const result = await postJson('qryVideoDetail', params);
        if (result.code !== '000000') return { list: [] };
        const item = result.data || {};
        const links = item.resUrl ? [item.resUrl] : [];
        return { list: [{ vod_id: id, vod_name: item.title || '', vod_pic: item.appCoverUrl || '', vod_content: item.remark || '', type_name: (item.cateNameList || []).join(','), vod_play_from: '网盘分享', vod_play_url: links.map((url, i) => `分享${i + 1}$${url}`).join('#') }] };
      });
      fastify.post('/play', async (request) => ({ parse: 0, url: one(request.body?.id) }));
    },
  };
}
