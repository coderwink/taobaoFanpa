// src/crawler/manual-crawler.ts
// 手动模式：启动 Chrome，用户手动操作，脚本只提取数据

import { SmartCrawler } from './smart-crawler';
import { ScriptInjector } from './script-injector';
import { Exporter } from '../storage/exporter';
import { Config } from '../config/config';
import { logger } from '../utils/logger';
import { Product } from '../types';
import * as readline from 'readline';

export class ManualCrawler {
  private config: Config;
  private crawler: SmartCrawler;
  private products: Product[] = [];

  constructor(config: Config) {
    this.config = config;
    this.crawler = new SmartCrawler(config);
  }

  async start(): Promise<void> {
    console.log('');
    console.log('==========================================');
    console.log('  淘宝秒杀爬虫（手动模式）');
    console.log('  启动 Chrome → 你手动操作 → 脚本提取数据');
    console.log('==========================================');
    console.log('');

    try {
      // 启动 Chrome
      await this.crawler.launch();

      const page = await this.crawler.getPage();

      // 访问淘宝
      logger.info('打开淘宝首页...');
      await this.crawler.navigate('https://www.taobao.com');

      console.log('');
      console.log('操作说明：');
      console.log('  1. 在浏览器中登录淘宝（如果需要）');
      console.log('  2. 导航到搜索结果页面或店铺页面');
      console.log('  3. 当页面加载完成后，在终端输入 "c" 并回车提取数据');
      console.log('  4. 输入 "q" 退出程序');
      console.log('');

      // 创建交互式命令行
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      // 监听用户输入
      const prompt = () => {
        rl.question('输入命令 (c=提取数据, s=截图, q=退出): ', async (answer) => {
          const cmd = answer.trim().toLowerCase();

          switch (cmd) {
            case 'c':
              await this.extractData(page);
              break;
            case 's':
              await this.takeScreenshot();
              break;
            case 'q':
              console.log('正在关闭...');
              await this.crawler.close();
              rl.close();
              process.exit(0);
              break;
            default:
              console.log('未知命令。c=提取数据, s=截图, q=退出');
          }

          // 继续提示
          prompt();
        });
      };

      prompt();

      // 处理程序退出
      rl.on('close', async () => {
        await this.crawler.close();
      });

    } catch (error) {
      logger.error('启动失败', error as Error);
      await this.crawler.close();
      process.exit(1);
    }
  }

  private async extractData(page: any): Promise<void> {
    logger.info('正在提取当前页面数据...');

    try {
      const injector = new ScriptInjector(page);
      const currentUrl = page.url();

      // 判断是搜索结果页还是其他页面
      let newProducts: Product[] = [];

      if (currentUrl.includes('s.taobao.com/search')) {
        // 搜索结果页
        newProducts = await injector.extractSearchResults(this.config.flashSaleKeywords);
      } else {
        // 其他页面，尝试通用提取
        newProducts = await injector.extractSearchResults(this.config.flashSaleKeywords);
      }

      if (newProducts.length > 0) {
        // 去重
        const uniqueProducts = newProducts.filter(p =>
          !this.products.some(existing => existing.detailUrl === p.detailUrl)
        );

        this.products.push(...uniqueProducts);

        console.log('');
        console.log(`✅ 提取成功！新增 ${uniqueProducts.length} 件商品`);
        console.log(`📊 总共已收集 ${this.products.length} 件商品`);

        if (uniqueProducts.length > 0) {
          console.log('');
          console.log('新增商品预览：');
          uniqueProducts.slice(0, 5).forEach((p, i) => {
            const price = typeof p.price === 'object' ? p.price.flashSale : p.price;
            console.log(`  ${i + 1}. ${p.name.substring(0, 40)}... - ¥${price}`);
          });
          if (uniqueProducts.length > 5) {
            console.log(`  ... 还有 ${uniqueProducts.length - 5} 件`);
          }
        }
        console.log('');
      } else {
        console.log('');
        console.log('⚠️  未提取到商品数据。请确认：');
        console.log('   - 页面是否已完全加载？');
        console.log('   - 是否在搜索结果页面？');
        console.log('   - 可以先输入 "s" 截图查看当前页面');
        console.log('');
      }
    } catch (error) {
      logger.error('提取数据失败', error as Error);
    }
  }

  private async takeScreenshot(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `./data/screenshot-${timestamp}.png`;

    await this.crawler.screenshot(filename);
    console.log(`📸 截图已保存: ${filename}`);
  }

  async exportData(): Promise<void> {
    if (this.products.length === 0) {
      console.log('没有数据可导出');
      return;
    }

    const exporter = new Exporter(this.config.storage);

    // 按店铺组织数据
    const stores = [{
      id: 'manual',
      name: '手动采集',
      url: 'manual',
      products: this.products,
      collectedAt: new Date().toISOString(),
    }];

    exporter.exportToJSON(stores);
    exporter.exportToCSV(stores);

    console.log('');
    console.log('📁 数据已导出：');
    console.log(`   JSON: ${this.config.storage.jsonDir}/`);
    console.log(`   CSV: ${this.config.storage.csvDir}/`);
    console.log('');
  }
}
