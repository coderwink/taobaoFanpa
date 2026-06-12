// src/start-chrome.ts
// 直接启动 Chrome，使用临时 profile，独立运行

import { loadConfig } from './config/config';
import { logger } from './utils/logger';
import * as path from 'path';
import { spawn } from 'child_process';

async function main() {
  console.log('');
  console.log('==========================================');
  console.log('  启动 Chrome 浏览器');
  console.log('  请手动登录并导航到要采集的页面');
  console.log('==========================================');
  console.log('');

  const config = loadConfig();

  // 使用临时目录作为用户数据目录（避免与已运行的 Chrome 冲突）
  const tempDir = path.join(process.cwd(), 'temp-chrome-profile');

  // Chrome 可执行文件路径
  const chromePath = path.join(
    'C:',
    'Program Files',
    'Google',
    'Chrome',
    'Application',
    'chrome.exe'
  );

  console.log(`📁 临时用户数据目录: ${tempDir}`);
  console.log(`🚀 Chrome 路径: ${chromePath}`);
  console.log('');

  try {
    // 直接用 spawn 启动 Chrome
    const args = [
      `--user-data-dir=${tempDir}`,
      '--remote-debugging-port=9222',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${config.browser.viewport.width},${config.browser.viewport.height}`,
      'https://www.taobao.com',
    ];

    const child = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });

    // 释放子进程，让 Chrome 独立运行
    child.unref();

    console.log(`✅ Chrome 已启动 (调试端口: 9222)`);
    console.log('');
    console.log('请在浏览器中：');
    console.log('  1. 登录淘宝（这是临时浏览器，需要重新登录）');
    console.log('  2. 导航到搜索结果页面或店铺页面');
    console.log('  3. 等页面加载完成后，运行提取命令：');
    console.log('');
    console.log('     npm run extract');
    console.log('');
    console.log('Chrome 窗口会一直保持打开，直到你手动关闭。');
    console.log('');

    process.exit(0);

  } catch (error) {
    logger.error('启动失败', error as Error);
    process.exit(1);
  }
}

main();
