import guazi from './spider/video/guazi.js';
import zhibo from './spider/video/zhibo.js';
import jinpai from './spider/video/jinpai.js';
import juzi from './spider/video/juzi.js';
import { arrangeSites, PAN_SOURCES } from './hub.js';
import createPanSpider from './spider/video/pan_hub.js';
const spiders = [guazi, zhibo, jinpai, juzi];
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

