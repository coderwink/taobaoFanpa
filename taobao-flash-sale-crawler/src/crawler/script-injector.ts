// src/crawler/script-injector.ts
// 注入到淘宝页面的脚本，使用链接优先策略提取商品数据
// 不依赖硬编码 CSS 类名，通过 DOM 结构特征识别商品卡片

import { Page } from 'puppeteer';
import { Product, ProductStore, ProductStock, ProductTime } from '../types';
import { logger } from '../utils/logger';
import { parseTitle } from './title-parser';

// 浏览器端注入脚本的返回类型
interface InjectedProduct {
  id: string;            // 真实商品 ID（从 URL id= 参数提取）
  title: string;
  price: number;         // 当前价 / 秒杀价
  originalPrice: number; // 原价（划线价）
  quantity: number;      // 剩余库存，-1 表示页面未显示
  sold: number;          // 已售数量，-1 表示页面未显示
  link: string;
  image: string;
  isFlashSale: boolean;
  keyword: string;
  platform: 'taobao' | 'tmall';
}

export class ScriptInjector {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // 转换注入脚本返回的数据为 Product 类型
  private convertToProduct(item: InjectedProduct): Product {
    const originalPrice = item.originalPrice || item.price;
    const parsed = parseTitle(item.title);

    return {
      id: item.id,
      name: item.title,
      title: item.title,
      price: {
        original: originalPrice,
        flashSale: item.price,
        discount: originalPrice > 0
          ? `${Math.round((item.price / originalPrice) * 100)}%`
          : '',
      },
      image: item.image,
      detailUrl: item.link,
      link: item.link,
      store: {} as ProductStore,
      stock: {
        total: 0,
        remaining: item.quantity >= 0 ? item.quantity : 0,
        sold: item.sold >= 0 ? item.sold : 0,
        limit: 0,
      },
      time: {} as ProductTime,
      specs: [],
      category: parsed.category,
      brand: parsed.brand,
      volume: parsed.volume,
      attributes: parsed.attributes,
      isFlashSale: item.isFlashSale,
      keyword: item.keyword,
      platform: item.platform,
      collectedAt: new Date().toISOString(),
      source: 'smart',
    };
  }

  // 提取搜索结果页面的商品（链接优先策略）
  async extractSearchResults(keywords: string[]): Promise<Product[]> {
    logger.info('注入脚本提取搜索结果（链接优先策略）...');

    const injectedProducts = await this.page.evaluate((keywords: string[]): InjectedProduct[] => {
      // ============ 浏览器端辅助函数 ============

      // 从价格文本中提取数字
      function parsePrice(text: string): number {
        const match = text.match(/(\d+\.?\d*)/);
        return match ? parseFloat(match[1]) : 0;
      }

      // 从容器中提取价格（非划线价 = 当前价）
      function extractCurrentPrice(container: Element): number {
        // 方法1: 找 class 包含 price 的元素
        const priceEls = container.querySelectorAll('[class*="price"], [class*="Price"]');
        for (const el of Array.from(priceEls)) {
          // 跳过划线价 / 原价元素
          const cls = (el.className || '').toLowerCase();
          const tag = el.tagName.toLowerCase();
          if (cls.includes('origin') || cls.includes('del') || cls.includes('cross')
              || tag === 'del' || tag === 's') {
            continue;
          }
          const text = el.textContent?.trim() || '';
          const price = parsePrice(text);
          if (price > 0) return price;
        }

        // 方法2: 遍历所有文本节点匹配 ¥XX.XX
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const parent = node.parentElement;
          if (!parent) continue;
          // 跳过划线价
          const parentTag = parent.tagName.toLowerCase();
          const parentCls = (parent.className || '').toLowerCase();
          if (parentTag === 'del' || parentTag === 's'
              || parentCls.includes('origin') || parentCls.includes('del') || parentCls.includes('cross')) {
            continue;
          }
          const text = node.textContent || '';
          if (text.includes('¥') || /\d+\.\d+/.test(text)) {
            const price = parsePrice(text);
            if (price > 0 && price < 100000) return price; // 合理价格范围
          }
        }

        return 0;
      }

      // 从容器中提取原价（划线价）
      function extractOriginalPrice(container: Element): number {
        // 方法1: 专门找划线价元素
        const delEls = container.querySelectorAll('del, s, [class*="origin"], [class*="Origin"], [class*="cross"], [class*="del"]');
        for (const el of Array.from(delEls)) {
          const text = el.textContent?.trim() || '';
          const price = parsePrice(text);
          if (price > 0) return price;
        }

        // 方法2: 找带 line-through 样式的元素
        const allEls = container.querySelectorAll('*');
        for (const el of Array.from(allEls)) {
          const style = window.getComputedStyle(el);
          if (style.textDecorationLine === 'line-through' || style.textDecoration.includes('line-through')) {
            const text = el.textContent?.trim() || '';
            const price = parsePrice(text);
            if (price > 0) return price;
          }
        }

        return 0;
      }

      // 提取库存/剩余数量
      function extractQuantity(text: string): number {
        const patterns = [
          /剩(\d+)\s*件/,
          /仅剩(\d+)/,
          /库存(\d+)/,
          /余(\d+)\s*件/,
          /剩余(\d+)/,
          /还剩(\d+)/,
          /限量(\d+)/,
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) return parseInt(match[1], 10);
        }
        return -1;
      }

      // 提取已售数量
      function extractSold(text: string): number {
        // 先尝试带"万"的格式
        const wanMatch = text.match(/(\d+(?:\.\d+)?)\s*万\+?\s*(?:人付款|人收货|人购买|已售|售出)/);
        if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);

        const patterns = [
          /已售(\d+)/,
          /月销(\d+)/,
          /(\d+)\s*人付款/,
          /(\d+)\s*人收货/,
          /(\d+)\s*人购买/,
          /售出(\d+)/,
          /(\d+)\+?\s*人想要/,
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) return parseInt(match[1], 10);
        }
        return -1;
      }

      // 判断哪个商品数据更完整
      function isBetterProduct(a: InjectedProduct, b: InjectedProduct): boolean {
        let scoreA = 0, scoreB = 0;
        if (a.title) scoreA += 2;
        if (b.title) scoreB += 2;
        if (a.price > 0) scoreA += 3;
        if (b.price > 0) scoreB += 3;
        if (a.originalPrice > 0) scoreA += 1;
        if (b.originalPrice > 0) scoreB += 1;
        if (a.image) scoreA += 1;
        if (b.image) scoreB += 1;
        if (a.quantity >= 0) scoreA += 1;
        if (b.quantity >= 0) scoreB += 1;
        if (a.sold >= 0) scoreA += 1;
        if (b.sold >= 0) scoreB += 1;
        return scoreA > scoreB;
      }

      // ============ 主提取逻辑 ============

      // 第一步：查找所有商品链接（不依赖任何 CSS 类名）
      const productLinkSelectors = [
        'a[href*="item.taobao.com"]',
        'a[href*="detail.tmall.com"]',
        'a[href*="item.htm?id="]',
        'a[href*="detail.htm?id="]',
        'a[href*="item.taobao.com/item.htm"]',
        'a[href*="detail.tmall.com/item.htm"]',
      ];

      const allLinks = new Set<HTMLAnchorElement>();
      for (const selector of productLinkSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          allLinks.add(el as HTMLAnchorElement);
        });
      }

      const seen = new Map<string, InjectedProduct>();

      for (const linkEl of Array.from(allLinks)) {
        const href = linkEl.href || '';

        // 提取真实商品 ID
        const idMatch = href.match(/[?&]id=(\d+)/);
        if (!idMatch) continue;
        const productId = idMatch[1];

        // 如果已经见过这个 ID，跳过（除非新数据更好）
        if (seen.has(productId)) continue;

        // 向上遍历找到卡片容器（最多 5 层）
        let container: Element | null = linkEl.parentElement;
        for (let depth = 0; depth < 5 && container; depth++) {
          const text = container.textContent || '';
          const hasPrice = /¥?\s*\d+\.?\d*/.test(text);
          const hasImg = !!container.querySelector('img');
          if (hasPrice && hasImg) break;
          container = container.parentElement;
        }
        if (!container) container = linkEl.parentElement;
        if (!container) continue;

        // 提取标题
        let title = linkEl.getAttribute('title')
          || linkEl.querySelector('img')?.getAttribute('alt')
          || '';
        // 如果标题太短，尝试从容器中找更长的文本
        if (!title || title.length < 5) {
          const textNodes = container.querySelectorAll('[class*="title"], [class*="Title"], h3, h4');
          for (const node of Array.from(textNodes)) {
            const t = node.textContent?.trim() || '';
            if (t.length > title.length) title = t;
          }
        }
        // 最后兜底：取链接文本
        if (!title || title.length < 3) {
          title = linkEl.textContent?.trim() || '';
        }

        // 提取价格
        const price = extractCurrentPrice(container);
        const originalPrice = extractOriginalPrice(container);

        // 提取图片
        const img = container.querySelector('img');
        let image = img?.getAttribute('src')
          || img?.getAttribute('data-src')
          || img?.getAttribute('data-lazy-src')
          || img?.getAttribute('data-ks-lazyload')
          || '';
        if (image.startsWith('//')) image = 'https:' + image;

        // 提取库存和销量
        const containerText = container.textContent || '';
        const quantity = extractQuantity(containerText);
        const sold = extractSold(containerText);

        // 平台判断
        const platform = href.includes('tmall.com') ? 'tmall' : 'taobao';
        const normalizedLink = href.startsWith('//') ? 'https:' + href : href;

        // 去重：按商品 ID，保留数据更完整的
        const candidate: InjectedProduct = {
          id: productId,
          title: title.substring(0, 200),
          price,
          originalPrice,
          quantity,
          sold,
          link: normalizedLink,
          image,
          isFlashSale: false,
          keyword: '',
          platform,
        };

        const existing = seen.get(productId);
        if (!existing || isBetterProduct(candidate, existing)) {
          seen.set(productId, candidate);
        }
      }

      // 关键词匹配
      const results = Array.from(seen.values());
      for (const product of results) {
        const matchedKeyword = keywords.find(kw => product.title.includes(kw));
        if (matchedKeyword) {
          product.isFlashSale = true;
          product.keyword = matchedKeyword;
        }
      }

      return results;
    }, keywords);

    const products = injectedProducts.map(item => this.convertToProduct(item));
    logger.info(`提取到 ${products.length} 件商品`);
    return products;
  }

  // 提取店铺页面的商品（复用链接优先策略）
  async extractStoreProducts(storeName: string, keywords: string[]): Promise<Product[]> {
    logger.info('注入脚本提取店铺商品（复用链接优先策略）...');
    // 店铺页面和搜索页面的商品链接结构相同，直接复用
    return this.extractSearchResults(keywords);
  }

  // 等待页面加载并提取数据
  async waitForLoadAndExtract(url: string, keywords: string[]): Promise<Product[]> {
    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    return this.extractSearchResults(keywords);
  }
}
