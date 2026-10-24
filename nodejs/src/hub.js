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
export const SITE_ORDER = ['py_guazi', 'py_zhibo', 'py_jinpai', 'py_juzi', 'py_aikanbot', 'py_bt_two', 'py_duanju_bashi', 'py_duanju_daquan', 'py_hema_duanju', 'py_hongdou_duanju', 'py_huangguo_ai_local', 'py_jisu_zhuiju', 'py_rebo_fast', 'py_xin6v'];

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
// 默认不带任何网盘条目：pan.sites 为空，不给用户多加一个没点名的源。
// 下面是已验证形态的示例（多多网盘，maccms 形态），取消注释即启用。
export const PAN_SOURCES = [
    // {
    //     key: 'py_duoduo_pan',
    //     name: '多多网盘',
    //     hosts: ['https://tv.yydsys.cc', 'https://tv.214521.xyz'],
    //     pattern: 'maccms',
    //     classes: [
    //         { type_id: '1', type_name: '电影' },
    //         { type_id: '2', type_name: '剧集' },
    //         { type_id: '3', type_name: '综艺' },
    //         { type_id: '4', type_name: '动漫' },
    //         { type_id: '5', type_name: '短剧' },
    //         { type_id: '20', type_name: '纪录' },
    //     ],
    // },
];

/**
 * 按中枢整理待下发的 meta 列表（router.js 的 /config 每次请求都调它，
 * 所以改 SITE_ORDER / DISABLED 后不用重启服务，下次拉 /config 即生效；
 * 但 PAN_SOURCES 的新增条目要在启动时注册路由，随构建导入后生效）。
 *
 * @param {Array<{key: string}>} metas 原始 meta 列表（key 为下发前的原始 key）
 * @return {Array} 排序 + 过滤后的列表；SITE_ORDER 未列出的 key 兜底追加在末尾
 */
export function arrangeSites(metas) {
    const byKey = new Map();
    for (const m of metas) {
        if (m && m.key && !byKey.has(m.key)) byKey.set(m.key, m);
    }
    const out = [];
    const used = new Set();
    for (const k of SITE_ORDER) {
        const m = byKey.get(k);
        if (m && !DISABLED.has(k)) {
            out.push(m);
            used.add(k);
        }
    }
    for (const [k, m] of byKey) {
        if (!used.has(k) && !DISABLED.has(k)) out.push(m);
    }
    return out;
}
