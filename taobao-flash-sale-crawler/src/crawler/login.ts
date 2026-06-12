import { PuppeteerCrawler } from './puppeteer-crawler';
import { logger } from '../utils/logger';

const LOGIN_URL = 'https://login.taobao.com';
const LOGIN_TIMEOUT = 5 * 60 * 1000;
const CHECK_INTERVAL = 2000;

export class LoginManager {
  private crawler: PuppeteerCrawler;

  constructor(crawler: PuppeteerCrawler) {
    this.crawler = crawler;
  }

  async login(): Promise<boolean> {
    logger.info('启动登录流程...');

    try {
      await this.crawler.launch();

      logger.info('正在打开淘宝登录页...');
      await this.crawler.navigate(LOGIN_URL);

      console.log('');
      console.log('==========================================');
      console.log('请在浏览器中使用手机淘宝扫码登录');
      console.log('登录成功后会自动保存cookie');
      console.log('超时时间: 5分钟');
      console.log('==========================================');
      console.log('');

      const loggedIn = await this.waitForLogin();

      if (loggedIn) {
        await this.crawler.saveCookies();
        logger.info('登录成功，cookie 已保存');
        return true;
      } else {
        logger.warn('登录超时');
        return false;
      }
    } catch (error) {
      logger.error('登录流程出错', error as Error);
      return false;
    } finally {
      await this.crawler.close();
    }
  }

  private async waitForLogin(): Promise<boolean> {
    const startTime = Date.now();
    const page = await this.crawler.getPage();

    while (Date.now() - startTime < LOGIN_TIMEOUT) {
      try {
        const currentUrl = page.url();

        // 如果页面跳转离开了登录页，说明登录成功
        if (!currentUrl.includes('login.taobao.com') && !currentUrl.includes('login.tmall.com')) {
          return true;
        }

        // 也检查一下是否真的登录了
        const loggedIn = await this.crawler.isLoggedIn();
        if (loggedIn) {
          return true;
        }
      } catch {
        // 页面可能在跳转中，忽略错误
      }

      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }

    return false;
  }
}
