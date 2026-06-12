// src/manual-index.ts
// 手动模式入口：启动 Chrome，用户手动操作，脚本只提取数据

import { loadConfig } from './config/config';
import { ManualCrawler } from './crawler/manual-crawler';

async function main() {
  const config = loadConfig();
  const crawler = new ManualCrawler(config);
  await crawler.start();
}

main();
