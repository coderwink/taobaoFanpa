// src/crawler/puppeteer-crawler.ts

import fs from 'fs';
import path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';
import { Config } from '../config/config';
import { logger } from '../utils/logger';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class PuppeteerCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async launch(): Promise<void> {
    logger.info('启动浏览器...');

    try {
      this.browser = await puppeteer.launch({
        headless: this.config.browser.headless,
        executablePath: this.config.browser.executablePath,
        userDataDir: this.config.browser.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      this.page = await this.browser.newPage();

      await this.page.setViewport({
        width: this.config.browser.viewport.width,
        height: this.config.browser.viewport.height,
      });

      // 设置用户代理
      await this.page.setUserAgent(DEFAULT_USER_AGENT);

      // 设置超时时间
      await this.page.setDefaultTimeout(this.config.crawler.pageTimeout);
      await this.page.setDefaultNavigationTimeout(this.config.crawler.pageTimeout);

      logger.info('浏览器启动成功');
    } catch (error) {
      logger.error('浏览器启动失败', error as Error);
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      logger.info('关闭浏览器...');
      try {
        await this.browser.close();
      } catch (error) {
        logger.error('关闭浏览器时出错', error as Error);
      } finally {
        this.browser = null;
        this.page = null;
      }
      logger.info('浏览器已关闭');
    }
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    logger.info(`导航到: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: this.config.crawler.pageTimeout,
    });
    logger.info('页面加载完成');
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }
    return this.page;
  }

  async saveCookies(): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    const cookies = await this.page.cookies();

    const cookieDir = path.join(process.cwd(), 'data/cookies');
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }

    const cookiePath = path.join(cookieDir, 'taobao-cookies.json');
    fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
    logger.info('Cookie 已保存');
  }

  async loadCookies(): Promise<boolean> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    const cookiePath = path.join(process.cwd(), 'data/cookies/taobao-cookies.json');

    if (!fs.existsSync(cookiePath)) {
      logger.warn('Cookie 文件不存在');
      return false;
    }

    try {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
      await this.page.setCookie(...cookies);
      logger.info('Cookie 已加载');
      return true;
    } catch (error) {
      logger.error('加载 Cookie 失败', error as Error);
      return false;
    }
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    try {
      // 检查是否显示登录按钮
      const loginButton = await this.page.$('.site-nav-login');
      return !loginButton;
    } catch {
      return false;
    }
  }

  async screenshot(filePath: string): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    await this.page.screenshot({ path: filePath, fullPage: true });
    logger.info(`截图已保存: ${filePath}`);
  }

  async scrollDown(times: number = 1): Promise<void> {
    if (!this.page) {
      throw new Error('浏览器未启动');
    }

    for (let i = 0; i < times; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await new Promise(resolve => setTimeout(resolve, this.config.crawler.scrollDelay));
    }
  }
}
