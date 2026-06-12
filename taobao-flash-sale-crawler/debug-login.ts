import { loadConfig } from './src/config/config';
import { PuppeteerCrawler } from './src/crawler/puppeteer-crawler';

async function debug() {
  const config = loadConfig();
  const crawler = new PuppeteerCrawler(config);
  await crawler.launch();
  await crawler.loadCookies();
  await crawler.navigate('https://www.taobao.com');

  const page = await crawler.getPage();

  await page.screenshot({ path: 'debug-taobao.png', fullPage: false });

  const title = await page.title();
  console.log('Page title:', title);

  const url = page.url();
  console.log('Current URL:', url);

  const loginBtn = await page.$('.site-nav-login');
  console.log('site-nav-login exists:', !!loginBtn);

  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
  console.log('Body text (first 500):', bodyText);

  await crawler.close();
}

debug().catch(e => { console.error(e); process.exit(1); });
