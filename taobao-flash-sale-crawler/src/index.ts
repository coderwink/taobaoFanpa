import { Command } from 'commander';
import { loadConfig } from './config/config';
import { PuppeteerCrawler } from './crawler/puppeteer-crawler';
import { LoginManager } from './crawler/login';
import { CrawlOrchestrator } from './crawler/orchestrator';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('taobao-flash-sale-crawler')
  .description('淘宝秒杀商品批量采集工具')
  .version('1.0.0');

program
  .command('login')
  .description('登录淘宝账号（扫码登录）')
  .action(async () => {
    try {
      const config = loadConfig();
      const crawler = new PuppeteerCrawler(config);
      const loginManager = new LoginManager(crawler);
      const success = await loginManager.login();

      if (success) {
        console.log('登录成功！');
        process.exit(0);
      } else {
        console.log('登录失败或超时');
        process.exit(1);
      }
    } catch (error) {
      logger.error('登录命令执行失败', error as Error);
      process.exit(1);
    }
  });

program
  .command('crawl')
  .description('执行爬取任务')
  .action(async () => {
    try {
      const config = loadConfig();
      const orchestrator = new CrawlOrchestrator(config);
      await orchestrator.crawl();
      process.exit(0);
    } catch (error) {
      logger.error('爬取命令执行失败', error as Error);
      process.exit(1);
    }
  });

program.parse();
