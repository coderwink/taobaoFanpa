// src/crawler/smart-orchestrator.ts
// 智能编排器：启动用户 Chrome + 注入脚本抓取数据

import { Config } from '../config/config';
import { SmartCrawler } from './smart-crawler';
import { ScriptInjector } from './script-injector';
import { Exporter } from '../storage/exporter';
import { RateLimiter } from '../utils/rate-limiter';
import { logger } from '../utils/logger';
import { Store, Product } from '../types';

export class SmartOrchestrator {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private buildSearchUrl(storeName: string): string {
    return this.config.searchUrlTemplate.replace('{storeName}', encodeURIComponent(storeName));
  }

  async crawl(): Promise<void> {
    logger.info('启动智能爬虫（使用用户 Chrome）...');

    const crawler = new SmartCrawler(this.config);
    const exporter = new Exporter(this.config.storage);
    const rateLimiter = new RateLimiter(this.config.crawler.requestInterval);
    const allProducts: Product[] = [];

    try {
      // 启动 Chrome（使用用户 profile，保留登录态）
      await crawler.launch();

      // 获取启用的店铺列表
      const enabledStores = this.config.stores.filter(s => s.enabled);
      if (enabledStores.length === 0) {
        logger.warn('没有启用的店铺，请在 config.json 中配置 stores');
        return;
      }

      logger.info(`共 ${enabledStores.length} 个店铺待爬取`);

      // 先访问淘宝首页，确保登录态有效
      logger.info('访问淘宝首页，检查登录态...');
      await crawler.navigate('https://www.taobao.com');

      // 截图检查状态
      await crawler.screenshot('./data/debug-homepage.png');

      // 检查是否已登录
      const page = await crawler.getPage();
      const isLoggedIn = await page.evaluate(() => {
        // 检查是否有登录弹窗或"请登录"文字
        const bodyText = document.body?.innerText || '';
        const hasLoginButton = bodyText.includes('亲，请登录') || bodyText.includes('请登录');
        const hasLoginModal = document.querySelector('.login-dialog, .login-modal, [class*="login"]');
        return !hasLoginButton && !hasLoginModal;
      });

      if (!isLoggedIn) {
        logger.warn('检测到未登录状态！请在浏览器中手动登录淘宝。');
        logger.warn('登录完成后，程序会自动继续...');
        logger.warn('（等待 60 秒供您登录）');

        // 等待用户登录（最多 60 秒）
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const stillLoggedIn = await page.evaluate(() => {
            const bodyText = document.body?.innerText || '';
            return !bodyText.includes('亲，请登录') && !bodyText.includes('请登录');
          });

          if (stillLoggedIn) {
            logger.info('检测到已登录，继续爬取...');
            break;
          }

          if (i % 10 === 0) {
            logger.info(`等待登录中... (${60 - i} 秒)`);
          }
        }
      } else {
        logger.info('已登录，继续爬取...');
      }

      // 再次截图确认状态
      await crawler.screenshot('./data/debug-homepage-loggedin.png');

      // 串行爬取每个店铺
      for (let i = 0; i < enabledStores.length; i++) {
        const storeConfig = enabledStores[i];
        const searchUrl = this.buildSearchUrl(storeConfig.storeName);

        logger.info(`[${i + 1}/${enabledStores.length}] 搜索店铺: ${storeConfig.storeName}`);
        logger.info(`搜索URL: ${searchUrl}`);

        try {
          await rateLimiter.wait();

          // 导航到搜索页
          await crawler.navigate(searchUrl);

          // 截图
          await crawler.screenshot(`./data/debug-search-${i}.png`);

          // 获取页面并注入脚本
          const page = await crawler.getPage();

          // 检测是否有验证码
          const hasVerification = await page.evaluate(() => {
            const bodyText = document.body?.innerText || '';
            return bodyText.includes('拖动滑块') ||
                   bodyText.includes('请完成验证') ||
                   bodyText.includes('滑动验证') ||
                   !!document.querySelector('[class*="captcha"], [class*="verify"]');
          });

          if (hasVerification) {
            logger.warn('检测到验证码！请在浏览器中手动完成验证。');
            logger.warn('验证完成后，程序会自动继续...');
            logger.warn('（等待 120 秒供您完成验证）');

            // 等待用户完成验证（最多 120 秒）
            for (let j = 0; j < 120; j++) {
              await new Promise(resolve => setTimeout(resolve, 1000));

              const stillNeedVerify = await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';
                return bodyText.includes('拖动滑块') ||
                       bodyText.includes('请完成验证') ||
                       bodyText.includes('滑动验证');
              });

              if (!stillNeedVerify) {
                logger.info('检测到验证已完成，继续爬取...');
                // 等待页面加载
                await new Promise(resolve => setTimeout(resolve, 3000));
                break;
              }

              if (j % 15 === 0) {
                logger.info(`等待验证中... (${120 - j} 秒)`);
              }
            }

            // 再次截图确认
            await crawler.screenshot(`./data/debug-search-${i}-after-verify.png`);
          }

          const injector = new ScriptInjector(page);

          // 提取商品数据（先提取当前可见的）
          const initialProducts = await injector.extractSearchResults(this.config.flashSaleKeywords);
          allProducts.push(...initialProducts);

          logger.info(`店铺 "${storeConfig.storeName}" 初始提取 ${initialProducts.length} 件商品`);

          // 滚动加载更多商品（直到连续 3 次无新商品）
          if (this.config.crawler.maxScrollTimes > 0) {
            logger.info(`滚动页面提取更多商品...`);
            const moreProducts = await crawler.scrollUntilStable(
              () => injector.extractSearchResults(this.config.flashSaleKeywords),
              {
                maxScrolls: this.config.crawler.maxScrollTimes || 20,
                stableThreshold: 3,
                scrollAmount: 2,
              }
            );
            // 按 ID 去重合并
            const seenIds = new Set(allProducts.map(p => p.id));
            for (const p of moreProducts) {
              if (!seenIds.has(p.id)) {
                allProducts.push(p);
                seenIds.add(p.id);
              }
            }
          }

          logger.info(`店铺 "${storeConfig.storeName}" 爬取完成，共获得 ${allProducts.length} 件商品`);
        } catch (error) {
          logger.error(`店铺 "${storeConfig.storeName}" 爬取失败`, error as Error);
        }
      }

      // 导出数据
      if (allProducts.length > 0) {
        logger.info('正在导出数据...');

        // 按店铺组织数据
        const stores: Store[] = enabledStores.map((storeConfig, i) => ({
          id: `store_${i}`,
          name: storeConfig.storeName,
          url: this.buildSearchUrl(storeConfig.storeName),
          products: allProducts.filter(p => p.title), // 简单过滤
          collectedAt: new Date().toISOString(),
        }));

        exporter.exportToJSON(stores);
        exporter.exportToCSV(stores);

        // 打印汇总
        console.log('');
        console.log('==========================================');
        console.log('爬取任务完成！');
        console.log(`店铺数量: ${stores.length}`);
        console.log(`秒杀商品总数: ${allProducts.length}`);
        console.log('==========================================');
        console.log('');
      } else {
        logger.warn('没有爬取到任何秒杀商品');
      }

    } catch (error) {
      logger.error('爬取任务出错', error as Error);
    } finally {
      await crawler.close();
    }
  }
}
