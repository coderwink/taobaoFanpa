// test-smart.ts
// 测试智能爬虫是否能正常导入

import { SmartCrawler } from './src/crawler/smart-crawler';
import { ScriptInjector } from './src/crawler/script-injector';
import { SmartOrchestrator } from './src/crawler/smart-orchestrator';
import { loadConfig } from './src/config/config';

async function test() {
  console.log('测试智能爬虫模块导入...');

  try {
    // 测试配置加载
    const config = loadConfig();
    console.log('✅ 配置加载成功');

    // 测试类导入
    const crawler = new SmartCrawler(config);
    console.log('✅ SmartCrawler 导入成功');

    const orchestrator = new SmartOrchestrator(config);
    console.log('✅ SmartOrchestrator 导入成功');

    console.log('');
    console.log('所有模块导入成功！');
    console.log('');
    console.log('运行方式：');
    console.log('  npm run smart');
    console.log('');

  } catch (error) {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  }
}

test();
