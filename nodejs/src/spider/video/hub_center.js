import { HUB_WORKER_BASE } from '../../hub.js';

const KEY = 'py_hub_center';
const NAME = '⚙️配置·中枢';

// 管理页地址 = HUB_WORKER_BASE + '/'；HUB_WORKER_BASE 为空表示尚未部署。
function managerUrl() {
    if (!HUB_WORKER_BASE) return '';
    return String(HUB_WORKER_BASE).replace(/\/+$/, '') + '/';
}

// 已部署时详情封面为管理页二维码（Worker /qr?u= 生成）；未部署时留空。
function qrUrl() {
    const url = managerUrl();
    if (!url) return '';
    return String(HUB_WORKER_BASE).replace(/\/+$/, '') + '/qr?u=' + encodeURIComponent(url);
}

function card() {
    return {
        vod_id: 'hub',
        vod_name: NAME,
        vod_pic: qrUrl(),
        vod_remarks: HUB_WORKER_BASE ? '管理页已部署' : '管理页尚未部署',
    };
}

function detailContent() {
    const url = managerUrl();
    if (!url) {
        return '管理页尚未部署：请按交付说明部署 mycat-hub Worker，再把已部署域名告诉助理接线，接线后这里会显示地址与二维码';
    }
    return '管理页地址：' + url + '\n用法：点一下管理页地址直接打开（或扫描上方二维码）进入管理页；若点地址无反应，再用浏览器打开该地址。改动保存后，在播放器里刷新一次订阅即生效。';
}

async function init() { return {}; }

async function home() {
    return {
        class: [{ type_name: '管理', type_id: 'hub' }],
        filters: {},
        list: [card()],
    };
}

async function category(reqIn) {
    const body = (reqIn && reqIn.body) || {};
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    return { page, pagecount: 1, limit: 20, total: 1, list: [card()] };
}

// 与原版中枢一致：详情只有二维码与地址文字，不设播放入口。
// 原版 baseset 的 play 直接返回空（parse:0, url:''），详情无 vod_play_from/vod_play_url。
async function detail() {
    return {
        list: [{
            vod_id: 'hub',
            vod_name: NAME,
            vod_pic: qrUrl(),
            vod_content: detailContent(),
        }],
    };
}

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
