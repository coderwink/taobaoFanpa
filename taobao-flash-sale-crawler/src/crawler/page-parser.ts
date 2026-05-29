// src/crawler/page-parser.ts

import { Page } from 'puppeteer';
import { Product, ProductStore } from '../types';
import { logger } from '../utils/logger';

export class PageParser {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async extractProducts(storeInfo: ProductStore): Promise<Product[]> {
    logger.info('开始提取商品列表...');

    const products: Product[] = [];

    // 等待商品卡片加载
    try {
      await this.page.waitForSelector('.flash-sale-item, .seckill-item, [data-item-id]', {
        timeout: 10000,
      });
    } catch (error) {
      logger.warn('未找到商品卡片，尝试其他选择器');
    }

    // 滚动加载更多商品
    await this.loadAllProducts();

    // 提取所有商品卡片
    const productCards = await this.page.$$eval(
      '.flash-sale-item, .seckill-item, [data-item-id]',
      (cards) => {
        return cards.map((card) => {
          // 提取商品ID
          const itemId = card.getAttribute('data-item-id') ||
                         card.querySelector('[data-item-id]')?.getAttribute('data-item-id') || '';

          // 提取商品名称
          const nameElement = card.querySelector('.item-title, .product-title, h3, h4');
          const name = nameElement?.textContent?.trim() || '';

          // 提取价格
          const priceElement = card.querySelector('.price, .flash-price, .seckill-price');
          const priceText = priceElement?.textContent?.trim() || '';
          const priceMatch = priceText.match(/[\d.]+/);
          const flashSalePrice = priceMatch ? parseFloat(priceMatch[0]) : 0;

          // 提取原价
          const originalPriceElement = card.querySelector('.original-price, .del-price');
          const originalPriceText = originalPriceElement?.textContent?.trim() || '';
          const originalPriceMatch = originalPriceText.match(/[\d.]+/);
          const originalPrice = originalPriceMatch ? parseFloat(originalPriceMatch[0]) : 0;

          // 提取图片
          const imgElement = card.querySelector('img');
          const image = imgElement?.src || imgElement?.getAttribute('data-src') || '';

          // 提取详情页链接
          const linkElement = card.querySelector('a');
          const detailUrl = linkElement?.href || '';

          // 提取库存信息
          const stockElement = card.querySelector('.stock, .remaining');
          const stockText = stockElement?.textContent?.trim() || '';
          const stockMatch = stockText.match(/(\d+)/);
          const remaining = stockMatch ? parseInt(stockMatch[1]) : 0;

          // 提取已售数量
          const soldElement = card.querySelector('.sold, .sales');
          const soldText = soldElement?.textContent?.trim() || '';
          const soldMatch = soldText.match(/(\d+)/);
          const sold = soldMatch ? parseInt(soldMatch[1]) : 0;

          return {
            itemId,
            name,
            flashSalePrice,
            originalPrice,
            image,
            detailUrl,
            remaining,
            sold,
          };
        });
      }
    );

    // 转换为Product格式
    for (const card of productCards) {
      if (card.itemId || card.name) {
        const product: Product = {
          id: card.itemId || `unknown_${Date.now()}`,
          name: card.name || '未知商品',
          price: {
            original: card.originalPrice,
            flashSale: card.flashSalePrice,
            discount: card.originalPrice > 0
              ? `${Math.round((card.flashSalePrice / card.originalPrice) * 10)}折`
              : '',
          },
          image: card.image,
          detailUrl: card.detailUrl,
          store: storeInfo,
          stock: {
            total: 0,
            remaining: card.remaining,
            sold: card.sold,
            limit: 0,
          },
          time: {
            startTime: '',
            endTime: '',
            countdown: '',
          },
          specs: [],
          collectedAt: new Date().toISOString(),
          source: 'crawler',
        };

        products.push(product);
      }
    }

    logger.info(`提取到 ${products.length} 件商品`);
    return products;
  }

  private async loadAllProducts(): Promise<void> {
    let scrollTimes = 0;
    const maxScrollTimes = 20;

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
  }

  async extractProductDetail(): Promise<Partial<Product>> {
    logger.info('提取商品详情...');

    const detail: Partial<Product> = {};

    try {
      // 提取商品名称
      const nameElement = await this.page.$('.item-title, .product-title, h1');
      if (nameElement) {
        detail.name = await nameElement.evaluate(el => el.textContent?.trim() || '');
      }

      // 提取价格信息
      const priceElement = await this.page.$('.price, .flash-price');
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
      const stockElement = await this.page.$('.stock, .remaining, .inventory');
      if (stockElement) {
        const stockText = await stockElement.evaluate(el => el.textContent?.trim() || '');
        const stockMatch = stockText.match(/(\d+)/);
        if (stockMatch) {
          detail.stock = {
            total: 0,
            remaining: parseInt(stockMatch[1]),
            sold: 0,
            limit: 0,
          };
        }
      }

      // 提取商品规格
      const specElements = await this.page.$$('.spec-item, .sku-item');
      const specs = [];
      for (const specElement of specElements) {
        const specName = await specElement.$eval('.spec-name, .sku-name', el => el.textContent?.trim() || '');
        const specValue = await specElement.$eval('.spec-value, .sku-value', el => el.textContent?.trim() || '');
        if (specName && specValue) {
          specs.push({ name: specName, value: specValue });
        }
      }
      detail.specs = specs;

    } catch (error) {
      logger.error('提取商品详情失败', error as Error);
    }

    return detail;
  }
}
