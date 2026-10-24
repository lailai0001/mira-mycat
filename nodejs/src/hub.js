/**
 * mira-mycat 配置中枢（hub.js）
 *
 * 以后调顺序、开关源、加网盘，只改这一个文件，不碰任何蜘蛛文件。
 * 改完推送后由 Actions 自动构建，用户重新导入即生效。
 *
 * 三处改法（详见仓内报告 batch_HUB.md「中枢用法」一节）：
 *   1. 显示顺序 → 改 SITE_ORDER（meta.key 的数组，/config 的 video/pan.sites 只按它排）
 *   2. 开关源   → 往 DISABLED 里加 key（只停下发，蜘蛛文件与路由注册原样保留）
 *   3. 加网盘   → 往 PAN_SOURCES 里加一项（通用蜘蛛 pan_hub.js 自动承接，不用新写蜘蛛）
 */

// ---------------------------------------------------------------- 显示顺序
// /config 的 sites 顺序只由这张表决定。表中没有的新 key 不会消失，
// 兜底追加在末尾（防止新注册的站因漏填表而从配置里消失）。
export const SITE_ORDER = ['py_guazi', 'py_zhibo', 'py_jinpai', 'py_juzi', 'py_aikanbot', 'py_bt_two', 'py_duanju_bashi', 'py_duanju_daquan', 'py_hema_duanju', 'py_hongdou_duanju', 'py_huangguo_ai_local', 'py_jisu_zhuiju', 'py_rebo_fast', 'py_xin6v', 'py_duboku', 'py_duoduo_tv', 'py_hqvod4k', 'py_jianpian', 'py_kanju_ai', 'py_netflixgc', 'py_nivod_fast', 'py_wencaiyingshi', 'py_yueting', 'py_xingya_short', 'py_asmrba', 'py_xingmeng_asmr', 'py_ximalaya', 'py_yidong_4k', 'py_juzi_4k', 'py_tiantian_4k', 'py_chabeihu', 'py_fengye4k', 'py_gulu_4k', 'py_juxiafan_4k', 'py_douban_hot', 'py_dongman_bashi', 'py_dshixiong_tv', 'py_fenzhu', 'py_linglingqi', 'py_mengtaiqi', 'py_zhuijudaren', 'py_xiaoyouzi', 'py_duse91', 'py_duoju_local_node', 'py_netflix_cat', 'py_tencent_video', 'py_zhenpin_video', 'py_hudie_yingyuan', 'py_guazi_2k', 'py_duoduo_pan', 'py_muou_share', 'py_huajuan_pan', 'py_wanou_pan', 'py_pianku_pan', 'py_pomo_pan', 'py_shandian_tv', 'py_youtube_video', 'py_hub_center'];

// ---------------------------------------------------------------- 开关源
// 把源的 meta.key 加进来，该源就不再下发到 /config；删掉这一项就恢复。
// 注意：开关 ≠ 删除。被关掉的源，其蜘蛛文件和 fastify 路由注册都原样保留在仓里，
// 路由仍可响应，只是 App 的配置里看不到它。
export const DISABLED = new Set([
    // 例：'py_jinpai',
]);

// ---------------------------------------------------------------- 网盘条目
// 加一个网盘 = 在数组里加一项，不用新写蜘蛛文件。通用蜘蛛
// nodejs/src/spider/video/pan_hub.js 按 pattern 驱动：
//   'maccms'  MacCMS /index.php/vod/ 系（多多、木偶、花卷同款形态）
//   'vodshow' MacCMS /vodshow/ 系（玩偶同款形态）
//   'pianku'  片库 /vt/ /mv/ 系（片库同款形态）
// 每项字段：key（meta.key，须唯一）、name（显示名）、hosts（镜像域名，
// 按顺序探活）、pattern（上列三者之一）、classes（分类，type_id 是站内 tid）、
// 可选 ua（缺省为通用移动 UA）、maxLinks（详情最多出几条分享，缺省不限）。
// E 批（hmtv 网盘全量，完全自主）：5 条由通用蜘蛛承接；第 6 条原盘
// （pomo，WordPress 异形站）不在此表，见 nodejs/src/spider/video/pomo_pan.js
// 单独立蜘蛛 + router 注册 + SITE_ORDER 末尾同名 key。
// 自主性：木偶条目已剔除 bundle 原 hosts 里的作者中转域名，只保留
// 木偶站自有域名；其余各站 hosts 均为站方自有域名，无作者中转。
export const PAN_SOURCES = [
    {
        key: 'py_duoduo_pan',
        name: '☁️多多·4K',
        hosts: ['https://tv.yydsys.cc', 'https://tv.214521.xyz'],
        pattern: 'maccms',
        classes: [
            { type_id: '1', type_name: '电影' },
            { type_id: '2', type_name: '剧集' },
            { type_id: '3', type_name: '综艺' },
            { type_id: '4', type_name: '动漫' },
            { type_id: '5', type_name: '短剧' },
            { type_id: '20', type_name: '纪录' },
        ],
    },
    {
        key: 'py_muou_share',
        name: '🎭木偶·4K',
        hosts: ['https://www.muou.asia', 'https://www.muou.site', 'https://www.muoua.top'],
        pattern: 'maccms',
        classes: [
            { type_id: '1', type_name: '电影' },
            { type_id: '2', type_name: '剧集' },
            { type_id: '3', type_name: '动漫' },
            { type_id: '4', type_name: '纪录片' },
            { type_id: '25', type_name: '115臻享' },
            { type_id: '29', type_name: '综艺' },
            { type_id: '30', type_name: '少儿频道' },
        ],
    },
    {
        key: 'py_huajuan_pan',
        name: '🥐花卷·4K',
        hosts: ['https://www.zhizhen8.click', 'https://zhizhen8.click'],
        pattern: 'maccms',
        classes: [
            { type_id: '22', type_name: '花卷高帧' },
            { type_id: '1', type_name: '花卷电影' },
            { type_id: '2', type_name: '花卷剧集' },
            { type_id: '3', type_name: '花卷动漫' },
            { type_id: '23', type_name: '花卷AI短剧' },
            { type_id: '21', type_name: '花卷综艺' },
            { type_id: '24', type_name: '4K原盘' },
        ],
    },
    {
        key: 'py_wanou_pan',
        name: '🧸玩偶·4K',
        hosts: ['http://edgeong.wogg.333232.xyz', 'https://woggpan.888484.xyz', 'https://www.wogg.live'],
        pattern: 'vodshow',
        // 玩偶站方 EdgeOne 按 UA 拦人：UA 必须与 bundle 原值完全一致
        // （"WebKlt" 拼写不可"修正"，否则站方回 567）。
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKlt/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        classes: [
            { type_id: '1', type_name: '玩偶电影' },
            { type_id: '2', type_name: '玩偶剧集' },
            { type_id: '3', type_name: '动漫' },
            { type_id: '4', type_name: '综艺' },
            { type_id: '5', type_name: '音乐' },
            { type_id: '6', type_name: '短漫剧' },
        ],
    },
    {
        key: 'py_pianku_pan',
        name: '🧩片库·4K',
        hosts: ['https://www.qwnull.com', 'https://www.qwmkv.com', 'https://www.qnmp4.com'],
        pattern: 'pianku',
        maxLinks: 6,
        classes: [
            { type_id: '1', type_name: '电影' },
            { type_id: '2', type_name: '剧集' },
            { type_id: '3', type_name: '综艺' },
            { type_id: '4', type_name: '动漫' },
            { type_id: '30', type_name: '短剧' },
        ],
    },
];

// ---------------------------------------------------------------- 远端配置
// 第一阶段占位：步骤 4 填入已部署域名，形如
// https://mycat-hub.xxx.workers.dev，不带末尾斜杠；
// 为空表示未部署，跳过远端读取（/config 行为与现在完全一致）。
export const HUB_WORKER_BASE = 'https://mycat-hub.li768435813.workers.dev';

// 成人源 key（仅此 3 个）：远端配置 hideAdult=true 时并入 disabled 下发过滤。
export const ADULT_KEYS = ['py_huangguo_ai_local', 'py_duoju_local_node', 'py_hudie_yingyuan'];

/**
 * 读远端 Worker 配置（GET HUB_WORKER_BASE + '/api/config'）。
 * 成功返回归一化对象 { order, disabled, pan, hideAdult }，其中 pan 为 null
 * 表示远端未给 pan 字段（不覆盖网盘），pan 为数组时表示全量网盘表
 * （远端省略的内置网盘 key 即删除、远端条目名覆盖下发名）。
 * 任一步失败（未部署、网络错、超时、坏 JSON、形状不对）都回 null，绝不抛错，
 * 调用方回落内置表。
 *
 * @param {Object} req 框架请求实例（util/req.js 的 axios 形态，须有 req.get）
 * @return {Promise<Object|null>}
 */
export async function fetchRemoteConfig(req) {
    try {
        if (!HUB_WORKER_BASE) return null;
        const base = String(HUB_WORKER_BASE).replace(/\/+$/, '');
        if (!base) return null;
        if (!req || typeof req.get !== 'function') return null;
        let timer = null;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('remote config timeout')), 3000);
        });
        let res;
        try {
            res = await Promise.race([
                req.get(base + '/api/config', { timeout: 3000, responseType: 'text' }),
                timeout,
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
        const raw = res && res.data !== undefined ? res.data : res;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        let order;
        if (data.order === undefined) order = [];
        else if (Array.isArray(data.order) && data.order.every((x) => typeof x === 'string')) order = data.order;
        else return null;
        let disabled;
        if (data.disabled === undefined) disabled = [];
        else if (Array.isArray(data.disabled) && data.disabled.every((x) => typeof x === 'string')) disabled = data.disabled;
        else return null;
        let hideAdult;
        if (data.hideAdult === undefined) hideAdult = false;
        else if (typeof data.hideAdult === 'boolean') hideAdult = data.hideAdult;
        else return null;
        let pan = null;
        if (data.pan !== undefined) {
            if (!Array.isArray(data.pan)) return null;
            pan = [];
            for (const entry of data.pan) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
                if (typeof entry.key !== 'string' || !entry.key) return null;
                if (entry.name !== undefined && typeof entry.name !== 'string') return null;
                if (entry.hosts !== undefined && (!Array.isArray(entry.hosts) || !entry.hosts.every((h) => typeof h === 'string'))) return null;
                if (entry.pattern !== undefined && typeof entry.pattern !== 'string') return null;
                if (entry.classes !== undefined && !Array.isArray(entry.classes)) return null;
                pan.push(Object.assign({}, entry));
            }
        }
        return { order, disabled, pan, hideAdult };
    } catch (e) {
        return null;
    }
}

/**
 * 按中枢整理待下发的 meta 列表（router.js 的 /config 每次请求都调它，
 * 所以改 SITE_ORDER / DISABLED 后不用重启服务，下次拉 /config 即生效；
 * 但 PAN_SOURCES 的新增条目要在启动时注册路由，随构建导入后生效）。
 *
 * @param {Array<{key: string}>} metas 原始 meta 列表（key 为下发前的原始 key）
 * @return {Array} 排序 + 过滤后的列表；SITE_ORDER 未列出的 key 兜底追加在末尾
 */
export function arrangeSites(metas) {
    return arrangeSitesWith(SITE_ORDER, DISABLED, metas);
}

/**
 * arrangeSites 的通用版：用给定的 order / disabled 表整理（远端配置覆盖时用）。
 * order 未列出的 key 兜底追加在末尾（与内置版行为一致）。
 */
export function arrangeSitesWith(order, disabled, metas) {
    const disabledSet = disabled instanceof Set ? disabled : new Set(disabled || []);
    const byKey = new Map();
    for (const m of metas) {
        if (m && m.key && !byKey.has(m.key)) byKey.set(m.key, m);
    }
    const out = [];
    const used = new Set();
    for (const k of order || []) {
        const m = byKey.get(k);
        if (m && !disabledSet.has(k)) {
            out.push(m);
            used.add(k);
        }
    }
    for (const [k, m] of byKey) {
        if (!used.has(k) && !disabledSet.has(k)) out.push(m);
    }
    return out;
}
