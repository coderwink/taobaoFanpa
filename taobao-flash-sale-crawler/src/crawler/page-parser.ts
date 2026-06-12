import { Page } from 'puppeteer';
import { Product, ProductStore } from '../types';
import { logger } from '../utils/logger';
import { parseTitle } from './title-parser';

export class PageParser {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async extractProducts(storeInfo: ProductStore, flashSaleKeywords: string[]): Promise<Product[]> {
    logger.info('开始提取搜索结果...');

    // 等待搜索结果加载（淘宝搜索页是SPA，需要等待动态渲染）
    try {
      await this.page.waitForSelector('.Content--contentInner--QVTcU0M, .Card--doubleCardWrapper--L2XFE73, [data-item-id], .itemWrapper', {
        timeout: 30000,
      });
      // 额外等待确保内容完全渲染
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      logger.warn('等待搜索结果超时，尝试直接提取');
    }

    // 滚动加载更多商品
    await this.loadAllProducts();

    // 提取所有搜索结果商品
    const rawProducts = await this.page.evaluate(() => {
      // 尝试多种选择器
      let cards = document.querySelectorAll('.Content--contentInner--QVTcU0M');
      if (cards.length === 0) cards = document.querySelectorAll('.Card--doubleCardWrapper--L2XFE73');
      if (cards.length === 0) cards = document.querySelectorAll('[data-item-id]');
      if (cards.length === 0) cards = document.querySelectorAll('.itemWrapper');
      if (cards.length === 0) cards = document.querySelectorAll('.item');

      // 如果还是没有，尝试更宽泛的选择
      if (cards.length === 0) {
        // 查找包含价格的容器
        cards = document.querySelectorAll('[class*="cardWrapper"], [class*="contentWrapper"]');
      }
      const results: any[] = [];

      cards.forEach((card) => {
        try {
          // 提取商品标题
          const titleEl = card.querySelector('.Title--title--jCOPvpf, .title, h3, [class*="title"]');
          const title = titleEl?.textContent?.trim() || '';

          // 提取价格
          const priceEl = card.querySelector('.Price--priceInt--ZlsSi_M, .price, [class*="price"]');
          const priceText = priceEl?.textContent?.trim() || '';
          const priceMatch = priceText.match(/[\d.]+/);
          const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

          // 提取原价（划线价）
          const originalPriceEl = card.querySelector('.Price--originPrice--tHBOBnO, .origin-price, del, [class*="originPrice"]');
          const originalPriceText = originalPriceEl?.textContent?.trim() || '';
          const originalPriceMatch = originalPriceText.match(/[\d.]+/);
          const originalPrice = originalPriceMatch ? parseFloat(originalPriceMatch[0]) : 0;

          // 提取图片
          const imgEl = card.querySelector('img');
          const image = imgEl?.src || imgEl?.getAttribute('data-src') || '';

          // 提取链接
          const linkEl = card.querySelector('a');
          const detailUrl = linkEl?.href || '';

          // 提取商品ID
          const itemId = detailUrl.match(/id=(\d+)/)?.[1] || '';

          // 提取店铺名
          const shopEl = card.querySelector('.ShopInfo--shopName--rgXmLVh, .shop, [class*="shopName"]');
          const shopName = shopEl?.textContent?.trim() || '';

          // 提取标签（秒杀、特价等）
          const tagEls = card.querySelectorAll('.Tag--tag--xHfMOba, .tag, [class*="tag"], [class*="Tag"]');
          const tags: string[] = [];
          tagEls.forEach(tag => {
            const text = tag.textContent?.trim();
            if (text) tags.push(text);
          });

          // 提取销量
          const salesEl = card.querySelector('.SaleCount--saleCount--tRbxoMs, .sales, [class*="saleCount"]');
          const salesText = salesEl?.textContent?.trim() || '';
          const salesMatch = salesText.match(/(\d+)/);
          const sales = salesMatch ? parseInt(salesMatch[1], 10) : 0;

          if (title) {
            results.push({
              itemId,
              title,
              price,
              originalPrice,
              image,
              detailUrl,
              shopName,
              tags,
              sales,
            });
          }
        } catch {
          // 跳过解析失败的卡片
        }
      });

      return results;
    });

    logger.debug(`原始提取商品数: ${rawProducts.length}`);

    // 转换为Product格式，并解析标题
    const products: Product[] = [];
    for (const raw of rawProducts) {
      const parsed = parseTitle(raw.title);

      const product: Product = {
        id: raw.itemId || `unknown_${Date.now()}`,
        name: raw.title,
        price: {
          original: raw.originalPrice,
          flashSale: raw.price,
          discount: raw.originalPrice > 0
            ? `${Math.round((raw.price / raw.originalPrice) * 10)}折`
            : '',
        },
        image: raw.image,
        detailUrl: raw.detailUrl,
        store: {
          id: storeInfo.id,
          name: raw.shopName || storeInfo.name,
          url: storeInfo.url,
        },
        stock: {
          total: 0,
          remaining: 0,
          sold: raw.sales,
          limit: 0,
        },
        time: {
          startTime: '',
          endTime: '',
          countdown: '',
        },
        specs: [],
        category: parsed.category,
        brand: parsed.brand,
        volume: parsed.volume,
        attributes: parsed.attributes,
        collectedAt: new Date().toISOString(),
        source: 'crawler',
      };

      products.push(product);
    }

    logger.info(`搜索结果共 ${products.length} 件商品`);

    // 筛选秒杀商品
    if (flashSaleKeywords.length > 0) {
      const filtered = products.filter(p => {
        const text = `${p.name} ${p.price.discount}`.toLowerCase();
        return flashSaleKeywords.some(kw => text.includes(kw.toLowerCase()));
      });
      logger.info(`筛选秒杀商品 ${filtered.length} 件`);
      return filtered;
    }

    return products;
  }

  private async loadAllProducts(): Promise<void> {
    let scrollTimes = 0;
    const maxScrollTimes = 20;

    try {
      while (scrollTimes < maxScrollTimes) {
        const previousHeight = await this.page.evaluate(() => document.body.scrollHeight);

        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

        if (currentHeight === previousHeight) {
          break;
        }

        scrollTimes++;
      }
    } catch (error) {
      logger.error('滚动加载商品失败', error as Error);
    }
  }

  async extractProductDetail(): Promise<Partial<Product>> {
    logger.info('提取商品详情...');

    const detail: Partial<Product> = {};

    try {
      // 提取商品名称
      const nameElement = await this.page.$('.ItemHeader--mainTitle--3CIjqWV, h1, [class*="mainTitle"]');
      if (nameElement) {
        detail.name = await nameElement.evaluate(el => el.textContent?.trim() || '');
      }

      // 提取价格信息
      const priceElement = await this.page.$('.Price--price--eRpJblN, [class*="price"]');
      if (priceElement) {
        const priceText = await priceElement.evaluate(el => el.textContent?.trim() || '');
        const priceMatch = priceText.match(/[\d.]+/);
        if (priceMatch) {
          detail.price = {
            original: 0,
            flashSale: parseFloat(priceMatch[0]),
            discount: '',
          };
        }
      }

      // 提取库存信息
      const stockElement = await this.page.$('.Stock--stock--9-sWYnd, .stock, [class*="stock"]');
      if (stockElement) {
        const stockText = await stockElement.evaluate(el => el.textContent?.trim() || '');
        const stockMatch = stockText.match(/(\d+)/);
        if (stockMatch) {
          detail.stock = {
            total: 0,
            remaining: parseInt(stockMatch[1], 10),
            sold: 0,
            limit: 0,
          };
        }
      }

      // 提取商品规格
      const specs = await this.page.$$eval('.sku-item, .SpecItem--item--fCNsLPM', (elements) => {
        return elements.map((el) => {
          const nameEl = el.querySelector('.sku-name, .SpecItem--name--rTPQfXK');
          const valueEl = el.querySelector('.sku-value, .SpecItem--text--HdFQcsa');
          const name = nameEl?.textContent?.trim() || '';
          const value = valueEl?.textContent?.trim() || '';
          return { name, value };
        }).filter(spec => spec.name && spec.value);
      });
      detail.specs = specs;

    } catch (error) {
      logger.error('提取商品详情失败', error as Error);
    }

    return detail;
  }
}
