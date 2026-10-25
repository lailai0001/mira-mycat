import guazi from './spider/video/guazi.js';
import zhibo from './spider/video/zhibo.js';
import jinpai from './spider/video/jinpai.js';
import juzi from './spider/video/juzi.js';
import aikanbot from './spider/video/aikanbot.js';
import bt_two from './spider/video/bt_two.js';
import duanju_bashi from './spider/video/duanju_bashi.js';
import duanju_daquan from './spider/video/duanju_daquan.js';
import hema_duanju from './spider/video/hema_duanju.js';
import hongdou_duanju from './spider/video/hongdou_duanju.js';
import jisu_zhuiju from './spider/video/jisu_zhuiju.js';
import rebo_fast from './spider/video/rebo_fast.js';
import xin6v from './spider/video/xin6v.js';
import duboku from './spider/video/duboku.js';
import duoduo_tv from './spider/video/duoduo_tv.js';
import hqvod4k from './spider/video/hqvod4k.js';
import jianpian from './spider/video/jianpian.js';
import kanju_ai from './spider/video/kanju_ai.js';
import netflixgc from './spider/video/netflixgc.js';
import nivod_fast from './spider/video/nivod_fast.js';
import wencaiyingshi from './spider/video/wencaiyingshi.js';
import yueting from './spider/video/yueting.js';
import xingya_short from './spider/video/xingya_short.js';
import asmrba from './spider/video/asmrba.js';
import ximalaya from './spider/video/ximalaya.js';
import yidong_4k from './spider/video/yidong_4k.js';
import juzi_4k from './spider/video/juzi_4k.js';
import tiantian_4k from './spider/video/tiantian_4k.js';
import chabeihu from './spider/video/chabeihu.js';
import fengye4k from './spider/video/fengye4k.js';
import gulu_4k from './spider/video/gulu_4k.js';
import juxiafan_4k from './spider/video/juxiafan_4k.js';
import douban_hot from './spider/video/douban_hot.js';
import dongman_bashi from './spider/video/dongman_bashi.js';
import dshixiong_tv from './spider/video/dshixiong_tv.js';
import fenzhu from './spider/video/fenzhu.js';
import linglingqi from './spider/video/linglingqi.js';
import mengtaiqi from './spider/video/mengtaiqi.js';
import zhuijudaren from './spider/video/zhuijudaren.js';
import xiaoyouzi from './spider/video/xiaoyouzi.js';
import duse91 from './spider/video/duse91.js';
import duoju_local_node from './spider/video/duoju_local_node.js';
import netflix_cat from './spider/video/netflix_cat.js';
import tencent_video from './spider/video/tencent_video.js';
import zhenpin_video from './spider/video/zhenpin_video.js';
import guazi_2k from './spider/video/guazi_2k.js';
import youtube_video from './spider/video/youtube_video.js';
import hub_center from './spider/video/hub_center.js';
import lee_iqiyi from './spider/video/lee_iqiyi.js';
import lee_mgtv from './spider/video/lee_mgtv.js';
import lee_sp360 from './spider/video/lee_sp360.js';
import lee_4kmp from './spider/video/lee_4kmp.js';
import lee_4k_yingshi from './spider/video/lee_4k_yingshi.js';
import lee_juzi4k from './spider/video/lee_juzi4k.js';
import lee_hetun4k from './spider/video/lee_hetun4k.js';
import lee_duoju_wusheng from './spider/video/lee_duoju_wusheng.js';
import lee_zhenguo_xingguo from './spider/video/lee_zhenguo_xingguo.js';
import lee_quanju_xingxing from './spider/video/lee_quanju_xingxing.js';
import lee_quanju_weiguan from './spider/video/lee_quanju_weiguan.js';
import lee_duoju_kuwo from './spider/video/lee_duoju_kuwo.js';
import lee_duoju_damang from './spider/video/lee_duoju_damang.js';
import lee_duoju_haokan from './spider/video/lee_duoju_haokan.js';
import lee_quanju_haokan from './spider/video/lee_quanju_haokan.js';
import lee_quanju_baidu from './spider/video/lee_quanju_baidu.js';
import lee_quanju_xingya from './spider/video/lee_quanju_xingya.js';
import lee_zhenguo_yaguo from './spider/video/lee_zhenguo_yaguo.js';
import lee_quanju_hema from './spider/video/lee_quanju_hema.js';
import lee_quanju_xifan from './spider/video/lee_quanju_xifan.js';
import lee_zhenguo_fanguo from './spider/video/lee_zhenguo_fanguo.js';
import lee_quanju_qimao from './spider/video/lee_quanju_qimao.js';
import lee_quanju_shanhai from './spider/video/lee_quanju_shanhai.js';
import lee_quanju_yimi from './spider/video/lee_quanju_yimi.js';
import lee_quanju_xifu from './spider/video/lee_quanju_xifu.js';
import lee_quanju_niuniu from './spider/video/lee_quanju_niuniu.js';
import lee_duoju_qixing from './spider/video/lee_duoju_qixing.js';
import lee_duoju_souju from './spider/video/lee_duoju_souju.js';
import lee_duoju_yizk from './spider/video/lee_duoju_yizk.js';
import lee_junior_school from './spider/video/lee_junior_school.js';
import { arrangeSites, arrangeSitesWith, PAN_SOURCES, fetchRemoteConfig, ADULT_KEYS } from './hub.js';
import req from './util/req.js';
import createPanSpider from './spider/video/pan_hub.js';
const spiders = [guazi, zhibo, jinpai, juzi, aikanbot, bt_two, duanju_bashi, duanju_daquan, hema_duanju, hongdou_duanju, jisu_zhuiju, rebo_fast, xin6v, duboku, duoduo_tv, hqvod4k, jianpian, kanju_ai, netflixgc, nivod_fast, wencaiyingshi, yueting, xingya_short, asmrba, ximalaya, yidong_4k, juzi_4k, tiantian_4k, chabeihu, fengye4k, gulu_4k, juxiafan_4k, douban_hot, dongman_bashi, dshixiong_tv, fenzhu, linglingqi, mengtaiqi, zhuijudaren, xiaoyouzi, duse91, duoju_local_node, netflix_cat, tencent_video, zhenpin_video, guazi_2k, youtube_video, hub_center, lee_iqiyi, lee_mgtv, lee_sp360, lee_4kmp, lee_4k_yingshi, lee_juzi4k, lee_hetun4k, lee_duoju_wusheng, lee_zhenguo_xingguo, lee_quanju_xingxing, lee_quanju_weiguan, lee_duoju_kuwo, lee_duoju_damang, lee_duoju_haokan, lee_quanju_haokan, lee_quanju_baidu, lee_quanju_xingya, lee_zhenguo_yaguo, lee_quanju_hema, lee_quanju_xifan, lee_zhenguo_fanguo, lee_quanju_qimao, lee_quanju_shanhai, lee_quanju_yimi, lee_quanju_xifu, lee_quanju_niuniu, lee_duoju_qixing, lee_duoju_souju, lee_duoju_yizk, lee_junior_school];
// 网盘条目由中枢 PAN_SOURCES 驱动、通用蜘蛛承接；与视频源分开注册，
// 但下发时同样过中枢（排序/开关）。PAN_SOURCES 为空时这里就是空数组。
// 注意：panSpiders 不再是模块级常量，见 router() 内的异步初始化：
// 启动时先读一次远端配置，远端 pan 覆盖同 key 内置条目并追加新增条目后
// 再生成；远端读取失败时只用内置 PAN_SOURCES。
const spiderPrefix = '/spider'; // API 路由前缀

/**
 * 合并内置网盘表与远端网盘表：同 key 以远端条目覆盖（只有名时只改名，
 * 其余字段保留内置值；全量条目则整体覆盖），远端新增 key 追加在末尾。
 * remotePan 为 null/undefined 时原样返回内置表。
 */
function mergePanSources(builtin, remotePan) {
    if (!remotePan) return builtin;
    const out = builtin.map((entry) => Object.assign({}, entry));
    const indexByKey = new Map(out.map((entry, i) => [entry.key, i]));
    for (const entry of remotePan) {
        if (!entry || typeof entry.key !== 'string') continue;
        if (indexByKey.has(entry.key)) {
            out[indexByKey.get(entry.key)] = Object.assign({}, out[indexByKey.get(entry.key)], entry);
        } else {
            out.push(Object.assign({}, entry));
            indexByKey.set(entry.key, out.length - 1);
        }
    }
    return out;
}

/**
 * A function to initialize the router.
 *
 * @param {Object} fastify - The Fastify instance
 * @return {Promise<void>} - A Promise that resolves when the router is initialized
 */
export default async function router(fastify) {
    // 网盘蜘蛛异步初始化：启动时先读一次远端配置（失败回 null，只用内置表），
    // 远端 pan 覆盖同 key 内置条目并追加新增条目后生成 panSpiders。
    // 远端在启动后新增的 key 因本次未注册路由，/config 本次不下发，重启后生效。
    const startupRemote = await fetchRemoteConfig(req);
    const panSpiders = mergePanSources(PAN_SOURCES, startupRemote && startupRemote.pan ? startupRemote.pan : null)
        .map((entry) => createPanSpider(entry));
    // register all spider router
    spiders.forEach((spiderFn) => {
        const spider = typeof spiderFn === 'function' ? spiderFn() : spiderFn;
        const path = spiderPrefix + '/' + spider.meta.key + '/' + spider.meta.type;
        fastify.register(spider.api, { prefix: path });
        console.log('Register spider: ' + path);
    });
    // 网盘蜘蛛同样全部注册：中枢关掉的源只是 /config 不下发，路由仍可响应。
    panSpiders.forEach((spider) => {
        const path = spiderPrefix + '/' + spider.meta.key + '/' + spider.meta.type;
        fastify.register(spider.api, { prefix: path });
        console.log('Register pan spider: ' + path);
    });
    /**
     * @api {get} /check 检查
     */
    fastify.register(
        /**
         *
         * @param {import('fastify').FastifyInstance} fastify
         */
        async (fastify) => {
            fastify.get(
                '/check',
                /**
                 * check api alive or not
                 * @param {import('fastify').FastifyRequest} _request
                 * @param {import('fastify').FastifyReply} reply
                 */
                async function (_request, reply) {
                    reply.send({ run: !fastify.stop });
                }
            );
            fastify.get(
                '/config',
                /**
                 * get catopen format config
                 * @param {import('fastify').FastifyRequest} _request
                 * @param {import('fastify').FastifyReply} reply
                 */
                async function (_request, reply) {
                    const config = {
                        video: {
                            sites: [],
                        },
                        read: {
                            sites: [],
                        },
                        comic: {
                            sites: [],
                        },
                        music: {
                            sites: [],
                        },
                        pan: {
                            sites: [],
                        },
                        color: fastify.config.color || [],
                    };
                    // 先收齐全部 meta（视频源 + 网盘条目），再一次性过中枢：
                    // arrangeSites 按 SITE_ORDER 排序、滤掉 DISABLED、未列出的 key 兜底追加。
                    // 两段分开收：spiderMetas 含独立蜘蛛（含原盘、闪电两个网盘型独立源），
                    // panMetas 只含 PAN_SOURCES 驱动的通用网盘条目（含启动期远端合并结果）；
                    // 回落分支要靠这个来源区分把网盘部分还原成纯内置表。
                    const spiderMetas = [];
                    spiders.forEach((spiderFn) => {
                        const spider = typeof spiderFn === 'function' ? spiderFn() : spiderFn;
                        let meta = Object.assign({}, spider.meta);
                        meta.api = spiderPrefix + '/' + meta.key + '/' + meta.type;
                        spiderMetas.push(meta);
                    });
                    const panMetas = [];
                    panSpiders.forEach((spider) => {
                        let meta = Object.assign({}, spider.meta);
                        meta.api = spiderPrefix + '/' + meta.key + '/' + meta.type;
                        panMetas.push(meta);
                    });
                    const allMetas = spiderMetas.concat(panMetas);
                    // /config 每次请求都读一次远端配置：成功时远端 order/disabled
                    // 覆盖内置表，hideAdult=true 时把成人源 key 并入 disabled；
                    // 远端 pan 只管 PAN_SOURCES 驱动的通用网盘条目：远端有且本站
                    // 已注册路由的 key 才下发（远端新增 key 本次未注册路由，不下发），
                    // 远端省略的内置网盘 key 本次不下发（= 删除生效），同 key 条目
                    // 改名时下发名取远端名。原盘、闪电两个独立网盘蜘蛛不受 pan 表
                    // 过滤（只受 order/disabled 管），避免 Worker 种子漏列导致独立
                    // 源消失——Worker 的 pan 种子只需列 5 条 PAN_SOURCES。
                    // 远端读取失败时行为与原来完全一致（内置表）：网盘部分只取
                    // PAN_SOURCES 的 key 并还原内置名，启动期远端新增的 key 不下发
                    // （启动合并写进 panSpiders 的远端名不能漏到回落结果里）。
                    const remote = await fetchRemoteConfig(req);
                    let arranged;
                    let remotePanByKey = null;
                    if (remote) {
                        const disabled = new Set(remote.disabled);
                        if (remote.hideAdult) {
                            for (const k of ADULT_KEYS) disabled.add(k);
                        }
                        arranged = arrangeSitesWith(remote.order, disabled, allMetas);
                        if (remote.pan) {
                            remotePanByKey = new Map(remote.pan.map((entry) => [entry.key, entry]));
                            // 只过滤通用网盘条目（panSpiders 出身）；独立蜘蛛（原盘、
                            // 闪电）不在 panSpiderKeys 里，永远不受 pan 表过滤。
                            const panSpiderKeys = new Set(panMetas.map((meta) => meta.key));
                            arranged = arranged.filter((meta) => {
                                if (panSpiderKeys.has(meta.key)) return remotePanByKey.has(meta.key);
                                return true;
                            });
                        }
                    } else {
                        // 回落 = 纯内置表：独立蜘蛛原样保留；通用网盘只取 PAN_SOURCES
                        // 的 key 并还原内置名（启动期远端合并写进 panMetas 的改名与
                        // 新增 key 在此全部排除，HUB_WORKER_BASE 为空时本分支与旧
                        // 行为逐项一致）。
                        const builtinPanNames = new Map(PAN_SOURCES.map((entry) => [entry.key, entry.name]));
                        const builtinPanMetas = panMetas
                            .filter((meta) => builtinPanNames.has(meta.key))
                            .map((meta) => Object.assign({}, meta, { name: builtinPanNames.get(meta.key) }));
                        arranged = arrangeSites(spiderMetas.concat(builtinPanMetas));
                    }
                    arranged.forEach((meta) => {
                        const out = Object.assign({}, meta);
                        if (remotePanByKey && remotePanByKey.has(meta.key) && remotePanByKey.get(meta.key).name) {
                            out.name = remotePanByKey.get(meta.key).name;
                        }
                        // 远端改名（中枢管理页 ✎ 改的名）覆盖下发名，视频源与网盘源都适用
                        if (remote && remote.names && typeof remote.names[meta.key] === 'string' && remote.names[meta.key]) {
                            out.name = remote.names[meta.key];
                        }
                        out.key = 'nodejs_' + meta.key;
                        const stype = meta.type;
                        if (stype < 10) {
                            config.video.sites.push(out);
                        } else if (stype >= 10 && stype < 20) {
                            config.read.sites.push(out);
                        } else if (stype >= 20 && stype < 30) {
                            config.comic.sites.push(out);
                        } else if (stype >= 30 && stype < 40) {
                            config.music.sites.push(out);
                        } else if (stype >= 40 && stype < 50) {
                            config.pan.sites.push(out);
                        }
                    });
                    reply.send(config);
                }
            );
        }
    );
}

