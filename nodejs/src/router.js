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
import huangguo_ai_local from './spider/video/huangguo_ai_local.js';
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
import xingmeng_asmr from './spider/video/xingmeng_asmr.js';
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
import hudie_yingyuan from './spider/video/hudie_yingyuan.js';
import guazi_2k from './spider/video/guazi_2k.js';
import { arrangeSites, PAN_SOURCES } from './hub.js';
import createPanSpider from './spider/video/pan_hub.js';
const spiders = [guazi, zhibo, jinpai, juzi, aikanbot, bt_two, duanju_bashi, duanju_daquan, hema_duanju, hongdou_duanju, huangguo_ai_local, jisu_zhuiju, rebo_fast, xin6v, duboku, duoduo_tv, hqvod4k, jianpian, kanju_ai, netflixgc, nivod_fast, wencaiyingshi, yueting, xingya_short, asmrba, xingmeng_asmr, ximalaya, yidong_4k, juzi_4k, tiantian_4k, chabeihu, fengye4k, gulu_4k, juxiafan_4k, douban_hot, dongman_bashi, dshixiong_tv, fenzhu, linglingqi, mengtaiqi, zhuijudaren, xiaoyouzi, duse91, duoju_local_node, netflix_cat, tencent_video, zhenpin_video, hudie_yingyuan, guazi_2k];
// 网盘条目由中枢 PAN_SOURCES 驱动、通用蜘蛛承接；与视频源分开注册，
// 但下发时同样过中枢（排序/开关）。PAN_SOURCES 为空时这里就是空数组。
const panSpiders = PAN_SOURCES.map((entry) => createPanSpider(entry));
const spiderPrefix = '/spider'; // API 路由前缀

/**
 * A function to initialize the router.
 *
 * @param {Object} fastify - The Fastify instance
 * @return {Promise<void>} - A Promise that resolves when the router is initialized
 */
export default async function router(fastify) {
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
                    const allMetas = [];
                    spiders.forEach((spiderFn) => {
                        const spider = typeof spiderFn === 'function' ? spiderFn() : spiderFn;
                        let meta = Object.assign({}, spider.meta);
                        meta.api = spiderPrefix + '/' + meta.key + '/' + meta.type;
                        allMetas.push(meta);
                    });
                    panSpiders.forEach((spider) => {
                        let meta = Object.assign({}, spider.meta);
                        meta.api = spiderPrefix + '/' + meta.key + '/' + meta.type;
                        allMetas.push(meta);
                    });
                    arrangeSites(allMetas).forEach((meta) => {
                        const out = Object.assign({}, meta);
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

