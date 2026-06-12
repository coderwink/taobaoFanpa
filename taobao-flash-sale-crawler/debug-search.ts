import { loadConfig } from './src/config/config';
import { PuppeteerCrawler } from './src/crawler/puppeteer-crawler';

async function debug() {
  const config = loadConfig();
  const crawler = new PuppeteerCrawler(config);
  await crawler.launch();

  const searchUrl = 'https://s.taobao.com/search?q=%E6%AC%A7%E8%8E%B1%E9%9B%85%E7%BE%8E%E5%8F%91%E5%AE%98%E6%96%B9%E6%97%97%E8%88%B0%E5%BA%97';
  await crawler.navigate(searchUrl);

  const page = await crawler.getPage();

  // 等待更长时间让内容渲染
  console.log('Waiting 10s for content to render...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // 截图
  await page.screenshot({ path: 'debug-search.png', fullPage: false });

  // 打印页面标题和URL
  console.log('Page title:', await page.title());
  console.log('Current URL:', page.url());

  // 检查各种可能的选择器
  const selectors = [
    '.Content--contentInner--QVTcU0M',
    '.Card--doubleCardWrapper--L2XFE73',
    '[data-item-id]',
    '.itemWrapper',
    '.item',
    '[class*="cardWrapper"]',
    '[class*="contentWrapper"]',
    '[class*="Card"]',
    '[class*="card"]',
    'a[href*="item.htm"]',
  ];

  for (const sel of selectors) {
    const count = await page.$$eval(sel, els => els.length).catch(() => 0);
    if (count > 0) {
      console.log(`Found ${count} elements with selector: ${sel}`);
    }
  }

  // 打印所有链接
  const links = await page.$$eval('a[href*="item.htm"]', els =>
    els.slice(0, 5).map(el => ({ href: el.href, text: el.textContent?.trim()?.slice(0, 80) }))
  ).catch(() => []);
  console.log('Product links:', JSON.stringify(links, null, 2));

  // 打印body text
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
  console.log('Body text (first 2000):', bodyText);

  await crawler.close();
}

debug().catch(e => { console.error(e); process.exit(1); });
