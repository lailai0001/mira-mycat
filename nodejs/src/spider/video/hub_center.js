import { HUB_WORKER_BASE } from '../../hub.js';

const KEY = 'py_hub_center';
const NAME = '⚙️配置·中枢';

// 管理页根地址（无尾斜杠）；HUB_WORKER_BASE 为空表示尚未部署。
function baseUrl() {
    if (!HUB_WORKER_BASE) return '';
    return String(HUB_WORKER_BASE).replace(/\/+$/, '');
}

// 管理页地址 = baseUrl + '/'。
function managerUrl() {
    const b = baseUrl();
    return b ? b + '/' : '';
}

// 已部署时详情封面为管理页二维码（Worker /qr?u= 生成）；未部署时留空。
function qrUrl() {
    const url = managerUrl();
    if (!url) return '';
    return baseUrl() + '/qr?u=' + encodeURIComponent(url);
}

function card() {
    return {
        vod_id: 'hub',
        vod_name: NAME,
        vod_pic: qrUrl(),
        vod_remarks: HUB_WORKER_BASE ? '管理页已部署' : '管理页尚未部署',
    };
}

// 地址放第一行：本 App 的详情页无集时不显示描述、且划不动，
// 必须带一个集才能让描述（含地址）显示出来；集本身不可点播，play 恒为空。
function detailContent() {
    const url = managerUrl();
    if (!url) {
        return '管理页尚未部署：请按交付说明部署 mycat-hub Worker，再把已部署域名告诉助理接线，接线后这里会显示地址与二维码';
    }
    return url + '\n点第一行地址直接在 App 里打开管理页，不要点播放按钮；若点地址没反应，再用浏览器打开该地址。改动保存后，在播放器里刷新一次订阅即生效。';
}

async function init() { return {}; }

// 与原版 baseset 一致：首页唯一分类的 type_name 就是管理页地址本身，
// App 会把这行地址渲染成带 > 的可点行，点它直接在 App 内打开管理页。
async function home() {
    return {
        class: [{ type_name: baseUrl() || '管理', type_id: 'setting' }],
        filters: {},
        list: [card()],
    };
}

async function category(reqIn) {
    const body = (reqIn && reqIn.body) || {};
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    return { page, pagecount: 1, limit: 20, total: 1, list: [card()] };
}

async function detail() {
    return {
        list: [{
            vod_id: 'hub',
            vod_name: NAME,
            vod_pic: qrUrl(),
            vod_content: detailContent(),
            vod_play_from: NAME,
            vod_play_url: '⚠️别点我，点上方地址$hub',
        }],
    };
}

// 中枢没有可播视频，play 恒为空；原版 baseset 亦是如此。
async function play() {
    return { parse: 0, url: '' };
}

async function search(reqIn) {
    const body = (reqIn && reqIn.body) || {};
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    return { page, pagecount: page, limit: 20, total: 0, list: [] };
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
