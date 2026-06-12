// src/smart-index.ts
// 智能爬虫入口：使用用户自己的 Chrome（保留登录态）

import { loadConfig } from './config/config';
import { SmartOrchestrator } from './crawler/smart-orchestrator';
import { logger } from './utils/logger';

async function main() {
  console.log('');
  console.log('==========================================');
  console.log('  淘宝秒杀商品爬虫（智能版）');
  console.log('  使用用户 Chrome，保留登录态');
  console.log('==========================================');
  console.log('');

  try {
    // 加载配置
    const config = loadConfig();
    logger.info('配置加载完成');

    // 创建智能编排器
    const orchestrator = new SmartOrchestrator(config);

    // 开始爬取
    await orchestrator.crawl();

  } catch (error) {
    logger.error('程序运行出错', error as Error);
    process.exit(1);
  }
}

main();
