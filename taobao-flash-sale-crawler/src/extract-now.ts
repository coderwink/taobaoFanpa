// src/extract-now.ts
// 连接到已运行的 Chrome，提取当前页面数据

import puppeteer from 'puppeteer';
import { ScriptInjector } from './crawler/script-injector';
import { Exporter } from './storage/exporter';
import { loadConfig } from './config/config';
import { logger } from './utils/logger';

async function main() {
  console.log('');
  console.log('==========================================');
  console.log('  提取当前页面数据');
  console.log('==========================================');
  console.log('');

  const config = loadConfig();

  // 连接到已运行的 Chrome（固定端口 9222）
  const port = '9222';

  try {
    logger.info(`连接到 Chrome (端口: ${port})...`);

    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${port}`,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    if (pages.length === 0) {
      console.log('❌ 没有找到打开的页面');
      process.exit(1);
    }

    // 找到淘宝页面
    let targetPage = null;
    for (const page of pages) {
      const url = page.url();
      if (url.includes('taobao.com') || url.includes('tmall.com')) {
        targetPage = page;
        break;
      }
    }

    if (!targetPage) {
      targetPage = pages[0];
      console.log('⚠️  没有找到淘宝页面，使用当前活动页面');
    }

    const currentUrl = targetPage.url();
    console.log(`📍 当前页面: ${currentUrl}`);
    console.log('');

    // 提取数据
    logger.info('正在提取数据...');
    const injector = new ScriptInjector(targetPage);
    const products = await injector.extractSearchResults(config.flashSaleKeywords);

    if (products.length > 0) {
      console.log('');
      console.log(`✅ 提取成功！共 ${products.length} 件商品`);
      console.log('');
      console.log('商品预览：');
      products.slice(0, 10).forEach((p, i) => {
        const price = typeof p.price === 'object' ? p.price.flashSale : p.price;
        console.log(`  ${i + 1}. ${p.name.substring(0, 50)} - ¥${price}`);
      });
      if (products.length > 10) {
        console.log(`  ... 还有 ${products.length - 10} 件`);
      }

      // 导出数据
      const exporter = new Exporter(config.storage);
      const stores = [{
        id: 'manual',
        name: '手动采集',
        url: currentUrl,
        products,
        collectedAt: new Date().toISOString(),
      }];

      exporter.exportToJSON(stores);
      exporter.exportToCSV(stores);

      console.log('');
      console.log('📁 数据已导出：');
      console.log(`   JSON: ${config.storage.jsonDir}/`);
      console.log(`   CSV: ${config.storage.csvDir}/`);
    } else {
      console.log('');
      console.log('⚠️  未提取到商品数据');
      console.log('   可能原因：');
      console.log('   - 页面不是搜索结果页');
      console.log('   - 页面未完全加载');
      console.log('   - 淘宝页面结构已变化');
    }

    // 断开连接（不关闭 Chrome）
    await browser.disconnect();
    console.log('');
    console.log('✅ 完成！Chrome 保持打开状态。');

  } catch (error) {
    console.error('❌ 连接失败:', (error as Error).message);
    console.log('');
    console.log('请确保：');
    console.log('  1. Chrome 正在运行');
    console.log('  2. 使用了正确的端口号');
    console.log('  3. 端口号从启动日志中获取');
    process.exit(1);
  }
}

main();
