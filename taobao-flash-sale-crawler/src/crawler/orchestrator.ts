import { Config } from '../config/config';
import { PuppeteerCrawler } from './puppeteer-crawler';
import { PageParser } from './page-parser';
import { Exporter } from '../storage/exporter';
import { RateLimiter } from '../utils/rate-limiter';
import { logger } from '../utils/logger';
import { Store } from '../types';

export class CrawlOrchestrator {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private buildSearchUrl(storeName: string): string {
    return this.config.searchUrlTemplate.replace('{storeName}', encodeURIComponent(storeName));
  }

  async crawl(): Promise<void> {
    logger.info('开始爬取任务...');

    const crawler = new PuppeteerCrawler(this.config);
    const exporter = new Exporter(this.config.storage);
    const rateLimiter = new RateLimiter(this.config.crawler.requestInterval);
    const stores: Store[] = [];

    try {
      // 启动浏览器
      await crawler.launch();

      // 加载cookie（如果有）
      await crawler.loadCookies();

      // 获取启用的店铺列表
      const enabledStores = this.config.stores.filter(s => s.enabled);
      if (enabledStores.length === 0) {
        logger.warn('没有启用的店铺，请在 config.json 中配置 stores');
        return;
      }

      logger.info(`共 ${enabledStores.length} 个店铺待爬取`);

      // 串行爬取每个店铺
      for (let i = 0; i < enabledStores.length; i++) {
        const storeConfig = enabledStores[i];
        const searchUrl = this.buildSearchUrl(storeConfig.storeName);

        logger.info(`[${i + 1}/${enabledStores.length}] 搜索店铺: ${storeConfig.storeName}`);
        logger.info(`搜索URL: ${searchUrl}`);

        try {
          await rateLimiter.wait();
          await crawler.navigate(searchUrl);

          const parser = new PageParser(await crawler.getPage());
          const storeInfo = { id: `store_${i}`, name: storeConfig.storeName, url: searchUrl };
          const products = await parser.extractProducts(storeInfo, this.config.flashSaleKeywords);

          stores.push({
            id: storeInfo.id,
            name: storeConfig.storeName,
            url: searchUrl,
            products,
            collectedAt: new Date().toISOString(),
          });

          logger.info(`店铺 "${storeConfig.storeName}" 爬取完成，获得 ${products.length} 件秒杀商品`);
        } catch (error) {
          logger.error(`店铺 "${storeConfig.storeName}" 爬取失败`, error as Error);
        }
      }

      // 导出数据
      if (stores.length > 0) {
        logger.info('正在导出数据...');
        exporter.exportToJSON(stores);
        exporter.exportToCSV(stores);

        // 打印汇总
        const totalProducts = stores.reduce((sum, s) => sum + s.products.length, 0);
        console.log('');
        console.log('==========================================');
        console.log('爬取任务完成！');
        console.log(`店铺数量: ${stores.length}`);
        console.log(`秒杀商品总数: ${totalProducts}`);
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
