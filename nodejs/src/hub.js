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
export const SITE_ORDER = ['py_guazi', 'py_zhibo', 'py_jinpai', 'py_juzi', 'py_aikanbot', 'py_bt_two', 'py_duanju_bashi', 'py_duanju_daquan', 'py_hema_duanju', 'py_hongdou_duanju', 'py_jisu_zhuiju', 'py_rebo_fast', 'py_xin6v', 'py_duboku', 'py_duoduo_tv', 'py_hqvod4k', 'py_jianpian', 'py_kanju_ai', 'py_netflixgc', 'py_nivod_fast', 'py_wencaiyingshi', 'py_yueting', 'py_xingya_short', 'py_ximalaya', 'py_yidong_4k', 'py_juzi_4k', 'py_tiantian_4k', 'py_chabeihu', 'py_fengye4k', 'py_gulu_4k', 'py_juxiafan_4k', 'py_douban_hot', 'py_dongman_bashi', 'py_dshixiong_tv', 'py_fenzhu', 'py_linglingqi', 'py_mengtaiqi', 'py_zhuijudaren', 'py_xiaoyouzi', 'py_duse91', 'py_duoju_local_node', 'py_netflix_cat', 'py_tencent_video', 'py_zhenpin_video', 'py_guazi_2k', 'py_wanou_pan', 'py_muou_share', 'py_labi_pan', 'py_shandian_pan', 'py_zhizhen_pan', 'py_duoduo_pan', 'py_ouge_pan', 'py_erxiao_pan', 'py_huban_pan', 'py_xiaoban_pan', 'py_huajuan_pan', 'py_pianku_pan', 'py_youtube_video', 'lee_iqiyi', 'lee_mgtv', 'lee_sp360', 'lee_4kmp', 'lee_4k_yingshi', 'lee_juzi4k', 'lee_hetun4k', 'lee_duoju_wusheng', 'lee_zhenguo_xingguo', 'lee_quanju_xingxing', 'lee_quanju_weiguan', 'lee_duoju_kuwo', 'lee_duoju_damang', 'lee_duoju_haokan', 'lee_quanju_haokan', 'lee_quanju_baidu', 'lee_quanju_xingya', 'lee_zhenguo_yaguo', 'lee_quanju_hema', 'lee_quanju_xifan', 'lee_zhenguo_fanguo', 'lee_quanju_qimao', 'lee_quanju_shanhai', 'lee_quanju_yimi', 'lee_quanju_xifu', 'lee_quanju_niuniu', 'lee_duoju_qixing', 'lee_duoju_souju', 'lee_junior_school', 'py_hub_center'];

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
  { key: 'py_wanou_pan', name: '「盘」玩偶', hosts: ['https://wogg.xxooo.cf', 'https://www.wogg.net'], pattern: 'vodshow', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '动漫' }, { type_id: '44', type_name: '臻彩' }, { type_id: '4', type_name: '综艺' }, { type_id: '46', type_name: '纪录' }, { type_id: '6', type_name: '短剧' }, { type_id: '5', type_name: '音乐' }], ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKlt/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36' },
  { key: 'py_muou_share', name: '「盘」木偶', hosts: ['https://www.muou.asia', 'https://www.muou.site', 'https://666.666291.xyz'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '动漫' }, { type_id: '4', type_name: '纪录' }, { type_id: '29', type_name: '综艺' }, { type_id: '25', type_name: '115' }] },
  { key: 'py_labi_pan', name: '「盘」蜡笔', hosts: ['https://xiaocgege.shop'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '动漫' }, { type_id: '4', type_name: '综艺' }, { type_id: '24', type_name: '4K' }, { type_id: '29', type_name: '臻彩' }, { type_id: '5', type_name: '短剧' }] },
  { key: 'py_shandian_pan', name: '「盘」闪电', hosts: ['https://sd.sduc.site', 'https://shandian.blog'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '综艺' }, { type_id: '4', type_name: '动漫' }, { type_id: '30', type_name: '短剧' }] },
  { key: 'py_zhizhen_pan', name: '「盘」至臻', hosts: ['https://mihdr.top', 'https://www.mihdr.top', 'https://www.miqk.cc', 'https://zhizhen1.top'], pattern: 'maccms', classes: [{ type_id: '26', type_name: '臻彩' }, { type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '综艺' }, { type_id: '4', type_name: '动漫' }, { type_id: '5', type_name: '短剧' }] },
  { key: 'py_duoduo_pan', name: '「盘」多多', hosts: ['https://tv.yydsys.cc', 'https://tv.214521.xyz', 'https://tv.yydsys.top'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '综艺' }, { type_id: '4', type_name: '动漫' }, { type_id: '5', type_name: '短剧' }, { type_id: '20', type_name: '纪录' }] },
  { key: 'py_ouge_pan', name: '「盘」欧歌', hosts: ['https://woog.nxog.eu.org'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '动漫' }, { type_id: '5', type_name: '短剧' }, { type_id: '4', type_name: '综艺' }, { type_id: '21', type_name: '综合' }] },
  { key: 'py_erxiao_pan', name: '「盘」二小', hosts: ['https://www.2xiaopan.top', 'https://www.wexwp.cc'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '动漫' }, { type_id: '22', type_name: '真彩' }, { type_id: '21', type_name: '综艺' }] },
  { key: 'py_huban_pan', name: '「盘」虎斑', hosts: ['http://103.217.192.130:16969'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '风' }, { type_id: '2', type_name: '花' }, { type_id: '3', type_name: '雪' }, { type_id: '4', type_name: '月' }, { type_id: '5', type_name: '精' }, { type_id: '6', type_name: '短' }, { type_id: '30', type_name: '115' }] },
  { key: 'py_xiaoban_pan', name: '「盘」小斑', hosts: ['http://103.217.192.184:12512'], pattern: 'maccms', classes: [{ type_id: '1', type_name: '梅' }, { type_id: '2', type_name: '兰' }, { type_id: '3', type_name: '竹' }, { type_id: '4', type_name: '菊' }, { type_id: '6', type_name: '短' }, { type_id: '5', type_name: '精' }] },
  { key: 'py_huajuan_pan', name: '🥐花卷·4K', hosts: ['https://www.zhizhen8.click', 'https://zhizhen8.click'], pattern: 'maccms', classes: [{ type_id: '22', type_name: '花卷高帧' }, { type_id: '1', type_name: '花卷电影' }, { type_id: '2', type_name: '花卷剧集' }, { type_id: '3', type_name: '花卷动漫' }, { type_id: '23', type_name: '花卷AI短剧' }, { type_id: '21', type_name: '花卷综艺' }, { type_id: '24', type_name: '4K原盘' }] },
  { key: 'py_pianku_pan', name: '🧩片库·4K', hosts: ['https://www.qwnull.com', 'https://www.qwmkv.com', 'https://www.qnmp4.com'], pattern: 'pianku', classes: [{ type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '剧集' }, { type_id: '3', type_name: '综艺' }, { type_id: '4', type_name: '动漫' }, { type_id: '30', type_name: '短剧' }], maxLinks: 6 },
];

// ---------------------------------------------------------------- 远端配置
// 第一阶段占位：步骤 4 填入已部署域名，形如
// https://mycat-hub.xxx.workers.dev，不带末尾斜杠；
// 为空表示未部署，跳过远端读取（/config 行为与现在完全一致）。
export const HUB_WORKER_BASE = 'https://mycat-hub.li768435813.workers.dev';

// 成人源 key（仅此 3 个）：远端配置 hideAdult=true 时并入 disabled 下发过滤。
export const ADULT_KEYS = ['py_duoju_local_node'];

/**
 * 读远端 Worker 配置（GET HUB_WORKER_BASE + '/api/config'）。
 * 成功返回归一化对象 { order, disabled, pan, hideAdult, names }，其中 pan 为 null
 * 表示远端未给 pan 字段；pan 为数组时原样返回远端网盘表，消费方（router.js
 * 的 mergePanSources 与 /config）按齐全与否自适应：齐全（含全部内置网盘 key）
 * 时远端为准（远端省略的内置网盘 key 即删除、远端条目名覆盖下发名），缺内置
 * key 时视为陈旧、网盘以包内 PAN_SOURCES 为准；names 为源显示名
 * 覆盖表（key → 自定义名，空对象表示无改名），形状不对时只忽略它。
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
        let names = {};
        if (data.names !== undefined) {
            if (data.names && typeof data.names === 'object' && !Array.isArray(data.names)) {
                for (const [k, v] of Object.entries(data.names)) {
                    if (typeof v === 'string') {
                        const t = v.trim();
                        if (t !== '') names[k] = t.slice(0, 30);
                    }
                }
            }
            // names 形状不对时只忽略它，不让整个远端配置失败
        }
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
        return { order, disabled, pan, hideAdult, names };
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
