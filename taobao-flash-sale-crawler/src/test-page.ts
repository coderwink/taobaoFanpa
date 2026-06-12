import { loadConfig } from './config/config';
import { PuppeteerCrawler } from './crawler/puppeteer-crawler';

async function main() {
  const config = loadConfig();
  const crawler = new PuppeteerCrawler(config);

  try {
    await crawler.launch();
    await crawler.loadCookies();

    const url = 'https://s.taobao.com/search?q=%E6%AC%A7%E8%8E%B1%E9%9B%85%E7%BE%8E%E5%8F%91%E5%AE%98%E6%96%B9%E6%97%97%E8%88%B0%E5%BA%97';
    await crawler.navigate(url, 'networkidle2');

    const page = await crawler.getPage();

    // 截图
    await page.screenshot({ path: 'debug-search.png', fullPage: false });
    console.log('截图已保存: debug-search.png');

    // 打印当前 URL（看是否被重定向）
    console.log('当前URL:', page.url());

    // 打印页面标题
    const title = await page.title();
    console.log('页面标题:', title);

    // 打印页面 body 前500字
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
    console.log('页面内容预览:\n', bodyText);

  } catch (err) {
    console.error('出错:', err);
  } finally {
    await crawler.close();
  }
}

main();
