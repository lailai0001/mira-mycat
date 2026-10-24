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

// 详情只剩一张图片（二维码）+ 一行说明，不带任何可播集：
// 既没有播放按钮可误触，也不会因空播放地址弹“视频信息获取失败”。
function detailContent() {
    const url = managerUrl();
    if (!url) {
        return '管理页尚未部署：请按交付说明部署 mycat-hub Worker，再把已部署域名告诉助理接线，接线后这里会显示地址与二维码';
    }
    return url + '\n点卡片直接在 App 里打开管理页；若没打开，再用浏览器打开该地址。改动保存后，在播放器里刷新一次订阅即生效。';
}

async function init() { return {}; }

async function home() {
    return {
        class: [{ type_name: '管理', type_id: 'setting' }],
        filters: {},
        list: [card()],
    };
}

async function category(reqIn) {
    const body = (reqIn && reqIn.body) || {};
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    return { page, pagecount: 1, limit: 20, total: 1, list: [card()] };
}

// 让 App 打开内置网页窗口（与其他猫源的配置源同款机制）：
// 框架的 server.messageToDart({action:'openInternalWebview', opt:{url}}) 会把消息
// 发给 App 内 Dart 侧的本地服务，由 App 打开内置 webview。
// 发消息失败时静默回落，不影响返回结果。
async function openManager(reqIn) {
    const url = managerUrl();
    if (!url) return;
    try {
        const srv = reqIn && reqIn.server;
        if (srv && typeof srv.messageToDart === 'function') {
            await srv.messageToDart({ action: 'openInternalWebview', opt: { url } }, reqIn);
        }
    } catch (e) { /* ignore */ }
}

// 点卡片进详情即开管理页。
async function detail(reqIn) {
    await openManager(reqIn);
    return {
        list: [{
            vod_id: 'hub',
            vod_name: NAME,
            vod_pic: qrUrl(),
            vod_content: detailContent(),
        }],
    };
}

// 中枢没有可播视频；但播放入口（旧详情残留的播放按钮、
// “视频信息获取失败”后的重试）点进来也一律打开管理页，
// 不再弹失败提示后无路可走。
async function play(reqIn) {
    await openManager(reqIn);
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
