// src/crawler/smart-crawler.ts
// 智能爬虫：启动用户自己的 Chrome（保留登录态），通过 CDP 连接并注入脚本

import puppeteer, { Browser, Page } from 'puppeteer';
import { Config } from '../config/config';
import { logger } from '../utils/logger';

// chrome-launcher 是 ESM 模块，需要动态导入
let chromeLauncher: any = null;

async function getChromeLauncher() {
  if (!chromeLauncher) {
    chromeLauncher = await import('chrome-launcher');
  }
  return chromeLauncher;
}

export class SmartCrawler {
  private chromeInstance: any = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async launch(): Promise<void> {
    logger.info('启动用户 Chrome 浏览器（保留登录态）...');

    try {
      // 动态导入 chrome-launcher
      const chromeLauncherModule = await getChromeLauncher();

      // 启动用户自己的 Chrome（使用默认 profile）
      // 这样可以保留淘宝的登录态
      this.chromeInstance = await chromeLauncherModule.launch({
        chromeFlags: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-networking',
          `--window-size=${this.config.browser.viewport.width},${this.config.browser.viewport.height}`,
        ],
        // 不指定 userDataDir，使用默认的用户 profile
        // 这样可以保留登录态和 cookies
      });

      logger.info(`Chrome 已启动，调试端口: ${this.chromeInstance.port}`);

      // 通过 CDP 连接到启动的 Chrome
      this.browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${this.chromeInstance.port}`,
        defaultViewport: null, // 使用 Chrome 自身的 viewport
      });

      // 获取或创建页面
      const pages = await this.browser.pages();
      this.page = pages[0] || await this.browser.newPage();

      // 设置超时
      await this.page.setDefaultTimeout(this.config.crawler.pageTimeout);
      await this.page.setDefaultNavigationTimeout(this.config.crawler.pageTimeout);

      // 注入反检测脚本
      await this.injectAntiDetection();

      logger.info('Chrome 启动成功，已连接');
    } catch (error) {
      logger.error('启动 Chrome 失败', error as Error);
      await this.close();
      throw error;
    }
  }

  // 注入反检测脚本，隐藏自动化特征
  private async injectAntiDetection(): Promise<void> {
    if (!this.page) return;

    await this.page.evaluateOnNewDocument(() => {
      // 隐藏 webdriver 标志
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // 覆盖 chrome.runtime
      (window as any).chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
        app: {},
      };

      // 覆盖 permissions
      const originalQuery = window.navigator.permissions.query;
      (window.navigator.permissions as any).query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);

      // 覆盖 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 覆盖 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
    });

    logger.info('已注入反检测脚本');
  }

  async close(): Promise<void> {
    try {
      // 断开 puppeteer 连接（不关闭 Chrome）
      if (this.browser) {
        await this.browser.disconnect();
        this.browser = null;
        this.page = null;
      }

      // 关闭 chrome-launcher 启动的 Chrome
      if (this.chromeInstance) {
        await this.chromeInstance.kill();
        this.chromeInstance = null;
      }

      logger.info('浏览器已关闭');
    } catch (error) {
      logger.error('关闭浏览器时出错', error as Error);
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    logger.info(`导航到: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.crawler.pageTimeout,
    });

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));
    logger.info('页面加载完成');
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }
    return this.page;
  }

  // 注入脚本并执行
  async injectScript<T>(script: string | Function): Promise<T> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    return await this.page.evaluate(script as any) as T;
  }

  // 滚动页面
  async scrollDown(times: number = 1): Promise<void> {
    if (!this.page) return;

    for (let i = 0; i < times; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await new Promise(resolve => setTimeout(resolve, this.config.crawler.scrollDelay));
    }
  }

  // 截图
  async screenshot(filePath: string): Promise<void> {
    if (!this.page) return;

    await this.page.screenshot({ path: filePath, fullPage: true });
    logger.info(`截图已保存: ${filePath}`);
  }

  // 滚动直到连续 N 次无新商品出现
  async scrollUntilStable(
    extractFn: () => Promise<any[]>,
    options: { maxScrolls?: number; stableThreshold?: number; scrollAmount?: number } = {}
  ): Promise<any[]> {
    if (!this.page) return [];

    const { maxScrolls = 20, stableThreshold = 3, scrollAmount = 2 } = options;
    let stableCount = 0;
    const allItems: any[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < maxScrolls && stableCount < stableThreshold; i++) {
      await this.page.evaluate((n: number) => {
        window.scrollBy(0, window.innerHeight * n);
      }, scrollAmount);

      await new Promise(resolve => setTimeout(resolve, this.config.crawler.scrollDelay + 500));

      const items = await extractFn();
      let newCount = 0;

      for (const item of items) {
        const id = item.id || item.link || item.detailUrl;
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allItems.push(item);
          newCount++;
        }
      }

      stableCount = newCount === 0 ? stableCount + 1 : 0;
      logger.info(`滚动 ${i + 1} 次，新增 ${newCount} 件商品（总计 ${allItems.length}）`);
    }

    if (stableCount >= stableThreshold) {
      logger.info(`连续 ${stableThreshold} 次滚动无新商品，停止滚动`);
    }

    return allItems;
  }
}
