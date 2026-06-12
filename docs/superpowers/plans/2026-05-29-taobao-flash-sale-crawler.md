# 淘宝秒杀商品采集器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个独立的Node.js项目，使用Puppeteer浏览器自动化技术批量采集淘宝秒杀商品信息

**Architecture:** 采用模块化设计，核心组件包括Puppeteer浏览器自动化、页面解析、数据提取、配置管理和存储模块。通过命令行接口提供用户交互。

**Tech Stack:** Node.js, TypeScript, Puppeteer, Commander, Chalk, Ora, Day.js

---

## 文件结构映射

```
taobao-flash-sale-crawler/
├── src/
│   ├── index.ts                    # 入口文件
│   ├── config/
│   │   └── config.ts              # 配置管理
│   ├── crawler/
│   │   ├── puppeteer-crawler.ts    # Puppeteer浏览器自动化核心
│   │   ├── page-parser.ts          # 页面解析逻辑
│   │   └── data-extractor.ts       # 数据提取和清洗
│   ├── collectors/
│   │   ├── store-collector.ts      # 店铺数据采集器
│   │   └── product-collector.ts    # 商品数据采集器
│   ├── storage/
│   │   ├── json-storage.ts         # JSON文件存储
│   │   └── csv-storage.ts          # CSV文件存储
│   └── utils/
│       ├── logger.ts               # 日志工具
│       ├── retry.ts                # 重试机制
│       └── rate-limiter.ts         # 请求频率控制
├── data/                           # 数据存储目录
├── config.json                     # 默认配置文件
├── package.json
├── tsconfig.json
└── README.md
```

---

## Task 1: 项目初始化

**Files:**
- Create: `taobao-flash-sale-crawler/package.json`
- Create: `taobao-flash-sale-crawler/tsconfig.json`
- Create: `taobao-flash-sale-crawler/config.json`

- [ ] **Step 1: 创建项目目录**

```bash
mkdir -p taobao-flash-sale-crawler/src
cd taobao-flash-sale-crawler
```

- [ ] **Step 2: 创建package.json**

```json
{
  "name": "taobao-flash-sale-crawler",
  "version": "1.0.0",
  "description": "淘宝秒杀商品批量采集工具",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node dist/index.js",
    "crawl": "ts-node src/index.ts crawl",
    "login": "ts-node src/index.ts login"
  },
  "keywords": ["taobao", "flash-sale", "crawler", "puppeteer"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "puppeteer": "^21.0.0",
    "commander": "^11.0.0",
    "chalk": "^4.1.2",
    "ora": "^7.0.1",
    "dayjs": "^1.11.10"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "ts-node": "^10.9.0"
  }
}
```

- [ ] **Step 3: 创建tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: 创建config.json**

```json
{
  "browser": {
    "headless": false,
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  },
  "crawler": {
    "maxRetries": 3,
    "retryDelay": 2000,
    "pageTimeout": 30000,
    "scrollDelay": 1000,
    "maxScrollTimes": 20,
    "requestInterval": 1500
  },
  "storage": {
    "jsonDir": "./data/json",
    "csvDir": "./data/csv",
    "filenamePrefix": "flash-sale",
    "dateFormat": "YYYY-MM-DD_HH-mm-ss"
  },
  "stores": []
}
```

- [ ] **Step 5: 安装依赖**

```bash
npm install
```

- [ ] **Step 6: 创建.gitignore**

```
node_modules/
dist/
data/
*.log
.DS_Store
```

- [ ] **Step 7: 提交**

```bash
git add .
git commit -m "feat: 初始化项目结构"
```

---

## Task 2: 配置管理模块

**Files:**
- Create: `taobao-flash-sale-crawler/src/config/config.ts`
- Create: `taobao-flash-sale-crawler/src/config/config.test.ts`

- [ ] **Step 1: 创建配置类型定义**

```typescript
// src/config/config.ts

export interface BrowserConfig {
  headless: boolean;
  executablePath?: string;
  userDataDir?: string;
  viewport: {
    width: number;
    height: number;
  };
}

export interface CrawlerConfig {
  maxRetries: number;
  retryDelay: number;
  pageTimeout: number;
  scrollDelay: number;
  maxScrollTimes: number;
  requestInterval: number;
}

export interface StorageConfig {
  jsonDir: string;
  csvDir: string;
  filenamePrefix: string;
  dateFormat: string;
}

export interface StoreConfig {
  name: string;
  url: string;
  enabled: boolean;
}

export interface Config {
  browser: BrowserConfig;
  crawler: CrawlerConfig;
  storage: StorageConfig;
  stores: StoreConfig[];
}
```

- [ ] **Step 2: 实现配置加载函数**

```typescript
// src/config/config.ts (续)

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_CONFIG: Config = {
  browser: {
    headless: false,
    viewport: {
      width: 1920,
      height: 1080,
    },
  },
  crawler: {
    maxRetries: 3,
    retryDelay: 2000,
    pageTimeout: 30000,
    scrollDelay: 1000,
    maxScrollTimes: 20,
    requestInterval: 1500,
  },
  storage: {
    jsonDir: './data/json',
    csvDir: './data/csv',
    filenamePrefix: 'flash-sale',
    dateFormat: 'YYYY-MM-DD_HH-mm-ss',
  },
  stores: [],
};

export function loadConfig(configPath?: string): Config {
  const filePath = configPath || path.join(process.cwd(), 'config.json');
  
  if (!fs.existsSync(filePath)) {
    console.warn(`配置文件不存在: ${filePath}，使用默认配置`);
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const userConfig = JSON.parse(content);
    
    // 深度合并配置
    return deepMerge(DEFAULT_CONFIG, userConfig);
  } catch (error) {
    console.error(`读取配置文件失败: ${error}`);
    return DEFAULT_CONFIG;
  }
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

export function saveConfig(config: Config, configPath?: string): void {
  const filePath = configPath || path.join(process.cwd(), 'config.json');
  const content = JSON.stringify(config, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');
}
```

- [ ] **Step 3: 提交**

```bash
git add src/config/
git commit -m "feat: 添加配置管理模块"
```

---

## Task 3: 日志工具

**Files:**
- Create: `taobao-flash-sale-crawler/src/utils/logger.ts`

- [ ] **Step 1: 实现日志工具**

```typescript
// src/utils/logger.ts

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private logDir: string;
  private logFile: string;

  constructor(logDir: string = './data/logs') {
    this.logDir = logDir;
    this.logFile = path.join(logDir, 'crawler.log');
    
    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatConsoleMessage(entry: LogEntry): string {
    const timestamp = chalk.gray(entry.timestamp);
    let level: string;

    switch (entry.level) {
      case LogLevel.DEBUG:
        level = chalk.cyan(entry.level);
        break;
      case LogLevel.INFO:
        level = chalk.green(entry.level);
        break;
      case LogLevel.WARN:
        level = chalk.yellow(entry.level);
        break;
      case LogLevel.ERROR:
        level = chalk.red(entry.level);
        break;
      default:
        level = entry.level;
    }

    let message = `${timestamp} ${level}: ${entry.message}`;
    
    if (entry.context) {
      message += ` ${chalk.gray(JSON.stringify(entry.context))}`;
    }
    
    if (entry.error) {
      message += `\n${chalk.red(entry.error.stack || entry.error.message)}`;
    }

    return message;
  }

  private writeToFile(entry: LogEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logFile, logLine, 'utf-8');
  }

  debug(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.DEBUG,
      message,
      context,
    };
    console.log(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  info(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.INFO,
      message,
      context,
    };
    console.log(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  warn(message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.WARN,
      message,
      context,
    };
    console.warn(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel.ERROR,
      message,
      context,
      error,
    };
    console.error(this.formatConsoleMessage(entry));
    this.writeToFile(entry);
  }

  createChildLogger(prefix: string): Logger {
    const childLogger = new Logger(this.logDir);
    const originalInfo = childLogger.info.bind(childLogger);
    const originalError = childLogger.error.bind(childLogger);
    const originalWarn = childLogger.warn.bind(childLogger);
    const originalDebug = childLogger.debug.bind(childLogger);

    childLogger.info = (message: string, context?: Record<string, any>) => {
      originalInfo(`[${prefix}] ${message}`, context);
    };

    childLogger.error = (message: string, error?: Error, context?: Record<string, any>) => {
      originalError(`[${prefix}] ${message}`, error, context);
    };

    childLogger.warn = (message: string, context?: Record<string, any>) => {
      originalWarn(`[${prefix}] ${message}`, context);
    };

    childLogger.debug = (message: string, context?: Record<string, any>) => {
      originalDebug(`[${prefix}] ${message}`, context);
    };

    return childLogger;
  }
}

export const logger = new Logger();
```

- [ ] **Step 2: 提交**

```bash
git add src/utils/logger.ts
git commit -m "feat: 添加日志工具"
```

---

## Task 4: 重试机制和请求频率控制

**Files:**
- Create: `taobao-flash-sale-crawler/src/utils/retry.ts`
- Create: `taobao-flash-sale-crawler/src/utils/rate-limiter.ts`

- [ ] **Step 1: 实现重试机制**

```typescript
// src/utils/retry.ts

import { logger } from './logger';

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, retryDelay, backoffMultiplier = 2, onRetry } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt - 1);
        logger.warn(`操作失败，${delay}ms 后重试 (${attempt}/${maxRetries})`, {
          error: lastError.message,
        });
        
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
```

- [ ] **Step 2: 实现请求频率控制**

```typescript
// src/utils/rate-limiter.ts

export class RateLimiter {
  private lastRequestTime: number = 0;
  private interval: number;

  constructor(interval: number) {
    this.interval = interval;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.interval) {
      const delay = this.interval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  setInterval(interval: number): void {
    this.interval = interval;
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/utils/retry.ts src/utils/rate-limiter.ts
git commit -m "feat: 添加重试机制和请求频率控制"
```

---

## Task 5: 数据模型定义

**Files:**
- Create: `taobao-flash-sale-crawler/src/types.ts`

- [ ] **Step 1: 定义数据模型**

```typescript
// src/types.ts

export interface ProductPrice {
  original: number;
  flashSale: number;
  discount: string;
}

export interface ProductStock {
  total: number;
  remaining: number;
  sold: number;
  limit: number;
}

export interface ProductTime {
  startTime: string;
  endTime: string;
  countdown: string;
}

export interface ProductSpec {
  name: string;
  value: string;
}

export interface ProductStore {
  id: string;
  name: string;
  url: string;
}

export interface Product {
  id: string;
  name: string;
  price: ProductPrice;
  image: string;
  detailUrl: string;
  store: ProductStore;
  stock: ProductStock;
  time: ProductTime;
  specs: ProductSpec[];
  collectedAt: string;
  source: 'crawler' | 'tampermonkey';
}

export interface Store {
  id: string;
  name: string;
  url: string;
  products: Product[];
  collectedAt: string;
}

export interface CrawlTask {
  id: string;
  storeUrls: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  startTime: string;
  endTime?: string;
}

export enum ErrorType {
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  SELECTOR = 'SELECTOR',
  ANTIBOT = 'ANTIBOT',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface CrawlerError {
  type: ErrorType;
  message: string;
  url?: string;
  retryCount?: number;
  timestamp: string;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/types.ts
git commit -m "feat: 添加数据模型定义"
```

---

## Task 6: Puppeteer浏览器自动化核心

**Files:**
- Create: `taobao-flash-sale-crawler/src/crawler/puppeteer-crawler.ts`

- [ ] **Step 1: 实现PuppeteerCrawler类**

```typescript
// src/crawler/puppeteer-crawler.ts

import puppeteer, { Browser, Page } from 'puppeteer';
import { Config } from '../config/config';
import { logger } from '../utils/logger';

export class PuppeteerCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async launch(): Promise<void> {
    logger.info('启动浏览器...');
    
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
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 设置超时时间
    await this.page.setDefaultTimeout(this.config.crawler.pageTimeout);
    await this.page.setDefaultNavigationTimeout(this.config.crawler.pageTimeout);

    logger.info('浏览器启动成功');
  }

  async close(): Promise<void> {
    if (this.browser) {
      logger.info('关闭浏览器...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
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
    const fs = require('fs');
    const path = require('path');
    
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

    const fs = require('fs');
    const path = require('path');
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
```

- [ ] **Step 2: 提交**

```bash
git add src/crawler/puppeteer-crawler.ts
git commit -m "feat: 添加Puppeteer浏览器自动化核心"
```

---

## Task 7: 页面解析器

**Files:**
- Create: `taobao-flash-sale-crawler/src/crawler/page-parser.ts`

- [ ] **Step 1: 实现页面解析器**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/crawler/page-parser.ts
git commit -m "feat: 添加页面解析器"
```

---

## Task 8: JSON存储模块

**Files:**
- Create: `taobao-flash-sale-crawler/src/storage/json-storage.ts`

- [ ] **Step 1: 实现JSON存储**

```typescript
// src/storage/json-storage.ts

import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import { Product, Store, Config } from '../types';
import { logger } from '../utils/logger';

export class JsonStorage {
  private config: Config;
  private currentDir: string;

  constructor(config: Config) {
    this.config = config;
    this.currentDir = this.generateDirName();
    this.ensureDirectories();
  }

  private generateDirName(): string {
    const timestamp = dayjs().format(this.config.storage.dateFormat);
    return `${this.config.storage.filenamePrefix}-${timestamp}`;
  }

  private ensureDirectories(): void {
    const jsonDir = path.join(this.config.storage.jsonDir, this.currentDir);
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
      logger.info(`创建目录: ${jsonDir}`);
    }
  }

  async saveStore(store: Store): Promise<void> {
    const filePath = path.join(
      this.config.storage.jsonDir,
      this.currentDir,
      `${this.sanitizeFileName(store.name)}.json`
    );

    const data = {
      ...store,
      savedAt: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`店铺数据已保存: ${filePath}`);
  }

  async saveProducts(products: Product[], storeName: string): Promise<void> {
    const filePath = path.join(
      this.config.storage.jsonDir,
      this.currentDir,
      `${this.sanitizeFileName(storeName)}-products.json`
    );

    const data = {
      storeName,
      products,
      savedAt: new Date().toISOString(),
      count: products.length,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`商品数据已保存: ${filePath}`);
  }

  async saveSummary(stores: Store[]): Promise<void> {
    const filePath = path.join(
      this.config.storage.jsonDir,
      this.currentDir,
      'summary.json'
    );

    const totalProducts = stores.reduce((sum, store) => sum + store.products.length, 0);
    const summary = {
      crawlTime: new Date().toISOString(),
      totalStores: stores.length,
      totalProducts,
      stores: stores.map(store => ({
        name: store.name,
        url: store.url,
        productCount: store.products.length,
      })),
    };

    fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
    logger.info(`汇总数据已保存: ${filePath}`);
  }

  private sanitizeFileName(name: string): string {
    // 移除或替换文件名中的非法字符
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  getOutputDir(): string {
    return path.join(this.config.storage.jsonDir, this.currentDir);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/storage/json-storage.ts
git commit -m "feat: 添加JSON存储模块"
```

---

## Task 9: CSV存储模块

**Files:**
- Create: `taobao-flash-sale-crawler/src/storage/csv-storage.ts`

- [ ] **Step 1: 实现CSV存储**

```typescript
// src/storage/csv-storage.ts

import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import { Product, Config } from '../types';
import { logger } from '../utils/logger';

export class CsvStorage {
  private config: Config;
  private currentDir: string;

  constructor(config: Config) {
    this.config = config;
    this.currentDir = this.generateDirName();
    this.ensureDirectories();
  }

  private generateDirName(): string {
    const timestamp = dayjs().format(this.config.storage.dateFormat);
    return `${this.config.storage.filenamePrefix}-${timestamp}`;
  }

  private ensureDirectories(): void {
    const csvDir = path.join(this.config.storage.csvDir, this.currentDir);
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
      logger.info(`创建目录: ${csvDir}`);
    }
  }

  async saveProducts(products: Product[], storeName: string): Promise<void> {
    const filePath = path.join(
      this.config.storage.csvDir,
      this.currentDir,
      `${this.sanitizeFileName(storeName)}.csv`
    );

    const headers = [
      '商品ID',
      '商品名称',
      '原价',
      '秒杀价',
      '折扣',
      '店铺名称',
      '店铺ID',
      '剩余库存',
      '已售数量',
      '商品图片',
      '详情页链接',
      '采集时间',
    ];

    const rows = products.map(product => [
      product.id,
      this.escapeCsvField(product.name),
      product.price.original.toString(),
      product.price.flashSale.toString(),
      product.price.discount,
      this.escapeCsvField(product.store.name),
      product.store.id,
      product.stock.remaining.toString(),
      product.stock.sold.toString(),
      product.image,
      product.detailUrl,
      product.collectedAt,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    logger.info(`CSV 数据已保存: ${filePath}`);
  }

  async saveAllProducts(products: Product[]): Promise<void> {
    const filePath = path.join(
      this.config.storage.csvDir,
      this.currentDir,
      'all-products.csv'
    );

    const headers = [
      '商品ID',
      '商品名称',
      '原价',
      '秒杀价',
      '折扣',
      '店铺名称',
      '店铺ID',
      '剩余库存',
      '已售数量',
      '商品图片',
      '详情页链接',
      '采集时间',
    ];

    const rows = products.map(product => [
      product.id,
      this.escapeCsvField(product.name),
      product.price.original.toString(),
      product.price.flashSale.toString(),
      product.price.discount,
      this.escapeCsvField(product.store.name),
      product.store.id,
      product.stock.remaining.toString(),
      product.stock.sold.toString(),
      product.image,
      product.detailUrl,
      product.collectedAt,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    logger.info(`所有商品 CSV 已保存: ${filePath}`);
  }

  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  getOutputDir(): string {
    return path.join(this.config.storage.csvDir, this.currentDir);
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/storage/csv-storage.ts
git commit -m "feat: 添加CSV存储模块"
```

---

## Task 10: 店铺采集器

**Files:**
- Create: `taobao-flash-sale-crawler/src/collectors/store-collector.ts`

- [ ] **Step 1: 实现店铺采集器**

```typescript
// src/collectors/store-collector.ts

import { PuppeteerCrawler } from '../crawler/puppeteer-crawler';
import { PageParser } from '../crawler/page-parser';
import { ProductCollector } from './product-collector';
import { JsonStorage } from '../storage/json-storage';
import { CsvStorage } from '../storage/csv-storage';
import { Config, Store, Product } from '../types';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { RateLimiter } from '../utils/rate-limiter';

export class StoreCollector {
  private crawler: PuppeteerCrawler;
  private config: Config;
  private jsonStorage: JsonStorage;
  private csvStorage: CsvStorage;
  private rateLimiter: RateLimiter;

  constructor(config: Config) {
    this.config = config;
    this.crawler = new PuppeteerCrawler(config);
    this.jsonStorage = new JsonStorage(config);
    this.csvStorage = new CsvStorage(config);
    this.rateLimiter = new RateLimiter(config.crawler.requestInterval);
  }

  async collectAll(): Promise<Store[]> {
    const stores: Store[] = [];
    const enabledStores = this.config.stores.filter(store => store.enabled);

    if (enabledStores.length === 0) {
      logger.warn('没有启用的店铺');
      return stores;
    }

    logger.info(`开始采集 ${enabledStores.length} 个店铺`);

    try {
      await this.crawler.launch();

      // 尝试加载Cookie
      const hasCookies = await this.crawler.loadCookies();
      if (!hasCookies) {
        logger.warn('未找到Cookie，请先运行 login 命令登录淘宝');
      }

      for (let i = 0; i < enabledStores.length; i++) {
        const storeConfig = enabledStores[i];
        logger.info(`[${i + 1}/${enabledStores.length}] 开始采集: ${storeConfig.name}`);

        try {
          const store = await this.collectStore(storeConfig.url, storeConfig.name);
          stores.push(store);

          // 保存数据
          await this.jsonStorage.saveStore(store);
          await this.csvStorage.saveProducts(store.products, store.name);

          logger.info(`采集完成: ${store.name}, 共 ${store.products.length} 件商品`);
        } catch (error) {
          logger.error(`采集店铺失败: ${storeConfig.name}`, error as Error);
        }

        // 请求频率控制
        if (i < enabledStores.length - 1) {
          await this.rateLimiter.wait();
        }
      }

      // 保存汇总数据
      await this.jsonStorage.saveSummary(stores);
      
      // 保存所有商品的CSV
      const allProducts = stores.flatMap(store => store.products);
      await this.csvStorage.saveAllProducts(allProducts);

    } finally {
      await this.crawler.close();
    }

    return stores;
  }

  async collectStore(url: string, name: string): Promise<Store> {
    return withRetry(
      async () => {
        // 导航到店铺秒杀页面
        await this.crawler.navigate(url);

        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 检查是否需要登录
        const page = await this.crawler.getPage();
        const isLoggedIn = await this.crawler.isLoggedIn();
        
        if (!isLoggedIn) {
          logger.warn('需要登录，请在浏览器中手动登录');
          logger.info('登录完成后按 Enter 继续...');
          
          // 等待用户登录
          await this.waitForUserLogin();
          
          // 保存Cookie
          await this.crawler.saveCookies();
        }

        // 解析页面
        const parser = new PageParser(page);
        const storeInfo = {
          id: this.extractStoreId(url),
          name: name,
          url: url,
        };

        const products = await parser.extractProducts(storeInfo);

        return {
          id: storeInfo.id,
          name: name,
          url: url,
          products: products,
          collectedAt: new Date().toISOString(),
        };
      },
      {
        maxRetries: this.config.crawler.maxRetries,
        retryDelay: this.config.crawler.retryDelay,
      }
    );
  }

  private extractStoreId(url: string): string {
    // 从URL中提取店铺ID
    const match = url.match(/shopId=(\d+)/);
    return match ? match[1] : `store_${Date.now()}`;
  }

  private async waitForUserLogin(): Promise<void> {
    return new Promise((resolve) => {
      process.stdin.once('data', () => {
        resolve();
      });
    });
  }

  async collectSingleStore(storeUrl: string, storeName?: string): Promise<Store> {
    const name = storeName || this.extractStoreName(storeUrl);
    
    try {
      await this.crawler.launch();
      
      const hasCookies = await this.crawler.loadCookies();
      if (!hasCookies) {
        logger.warn('未找到Cookie，请先运行 login 命令登录淘宝');
      }

      const store = await this.collectStore(storeUrl, name);
      
      await this.jsonStorage.saveStore(store);
      await this.csvStorage.saveProducts(store.products, name);
      
      return store;
    } finally {
      await this.crawler.close();
    }
  }

  private extractStoreName(url: string): string {
    // 从URL中提取店铺名称（简单实现）
    const match = url.match(/shopId=(\d+)/);
    return match ? `店铺_${match[1]}` : '未知店铺';
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/collectors/store-collector.ts
git commit -m "feat: 添加店铺采集器"
```

---

## Task 11: 商品采集器

**Files:**
- Create: `taobao-flash-sale-crawler/src/collectors/product-collector.ts`

- [ ] **Step 1: 实现商品采集器**

```typescript
// src/collectors/product-collector.ts

import { Page } from 'puppeteer';
import { Product, ProductStore } from '../types';
import { logger } from '../utils/logger';

export class ProductCollector {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async collectProductDetail(url: string, storeInfo: ProductStore): Promise<Product | null> {
    try {
      logger.info(`采集商品详情: ${url}`);
      
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // 等待页面加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 提取商品ID
      const itemId = this.extractItemId(url);

      // 提取商品名称
      const name = await this.extractText('.item-title, .product-title, h1');

      // 提取价格
      const price = await this.extractPrice();

      // 提取图片
      const image = await this.extractImage();

      // 提取库存
      const stock = await this.extractStock();

      // 提取规格
      const specs = await this.extractSpecs();

      const product: Product = {
        id: itemId || `product_${Date.now()}`,
        name: name || '未知商品',
        price: price,
        image: image,
        detailUrl: url,
        store: storeInfo,
        stock: stock,
        time: {
          startTime: '',
          endTime: '',
          countdown: '',
        },
        specs: specs,
        collectedAt: new Date().toISOString(),
        source: 'crawler',
      };

      return product;
    } catch (error) {
      logger.error('采集商品详情失败', error as Error);
      return null;
    }
  }

  private extractItemId(url: string): string {
    // 从URL中提取商品ID
    const match = url.match(/id=(\d+)/);
    return match ? match[1] : '';
  }

  private async extractText(selector: string): Promise<string> {
    try {
      const element = await this.page.$(selector);
      if (element) {
        return await element.evaluate(el => el.textContent?.trim() || '');
      }
    } catch (error) {
      logger.debug(`提取文本失败: ${selector}`);
    }
    return '';
  }

  private async extractPrice(): Promise<{ original: number; flashSale: number; discount: string }> {
    try {
      // 提取秒杀价
      const flashSalePriceText = await this.extractText('.flash-price, .seckill-price, .price');
      const flashSalePrice = this.parsePrice(flashSalePriceText);

      // 提取原价
      const originalPriceText = await this.extractText('.original-price, .del-price');
      const originalPrice = this.parsePrice(originalPriceText);

      // 计算折扣
      let discount = '';
      if (originalPrice > 0 && flashSalePrice > 0) {
        const discountValue = Math.round((flashSalePrice / originalPrice) * 10);
        discount = `${discountValue}折`;
      }

      return {
        original: originalPrice,
        flashSale: flashSalePrice,
        discount: discount,
      };
    } catch (error) {
      logger.debug('提取价格失败');
      return { original: 0, flashSale: 0, discount: '' };
    }
  }

  private parsePrice(text: string): number {
    const match = text.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  private async extractImage(): Promise<string> {
    try {
      const imgElement = await this.page.$('.item-img img, .product-img img, img');
      if (imgElement) {
        return await imgElement.evaluate(el => el.src || el.getAttribute('data-src') || '');
      }
    } catch (error) {
      logger.debug('提取图片失败');
    }
    return '';
  }

  private async extractStock(): Promise<{ total: number; remaining: number; sold: number; limit: number }> {
    try {
      const stockText = await this.extractText('.stock, .remaining, .inventory');
      const stockMatch = stockText.match(/(\d+)/);
      const remaining = stockMatch ? parseInt(stockMatch[1]) : 0;

      const soldText = await this.extractText('.sold, .sales');
      const soldMatch = soldText.match(/(\d+)/);
      const sold = soldMatch ? parseInt(soldMatch[1]) : 0;

      return {
        total: 0,
        remaining: remaining,
        sold: sold,
        limit: 0,
      };
    } catch (error) {
      logger.debug('提取库存失败');
      return { total: 0, remaining: 0, sold: 0, limit: 0 };
    }
  }

  private async extractSpecs(): Promise<Array<{ name: string; value: string }>> {
    try {
      const specs: Array<{ name: string; value: string }> = [];
      
      const specElements = await this.page.$$('.spec-item, .sku-item, .attr-item');
      
      for (const specElement of specElements) {
        const name = await specElement.evaluate(el => {
          const nameEl = el.querySelector('.spec-name, .sku-name, .attr-name');
          return nameEl?.textContent?.trim() || '';
        });
        
        const value = await specElement.evaluate(el => {
          const valueEl = el.querySelector('.spec-value, .sku-value, .attr-value');
          return valueEl?.textContent?.trim() || '';
        });
        
        if (name && value) {
          specs.push({ name, value });
        }
      }
      
      return specs;
    } catch (error) {
      logger.debug('提取规格失败');
      return [];
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/collectors/product-collector.ts
git commit -m "feat: 添加商品采集器"
```

---

## Task 12: 命令行接口

**Files:**
- Create: `taobao-flash-sale-crawler/src/index.ts`

- [ ] **Step 1: 实现命令行接口**

```typescript
// src/index.ts

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig, Config } from './config/config';
import { StoreCollector } from './collectors/store-collector';
import { PuppeteerCrawler } from './crawler/puppeteer-crawler';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('taobao-flash-sale-crawler')
  .description('淘宝秒杀商品批量采集工具')
  .version('1.0.0');

program
  .command('crawl')
  .description('开始采集秒杀商品')
  .option('-c, --config <path>', '配置文件路径', './config.json')
  .option('-s, --stores <stores>', '店铺名称（逗号分隔）')
  .option('-o, --output <path>', '输出目录', './data')
  .option('--headless', '无头模式')
  .action(async (options) => {
    const spinner = ora('加载配置...').start();
    
    try {
      const config = loadConfig(options.config);
      
      // 如果指定了无头模式，覆盖配置
      if (options.headless) {
        config.browser.headless = true;
      }

      // 如果指定了店铺，过滤配置中的店铺
      if (options.stores) {
        const storeNames = options.stores.split(',').map((s: string) => s.trim());
        config.stores = config.stores.filter(store => 
          storeNames.includes(store.name)
        );
      }

      spinner.succeed('配置加载完成');

      const collector = new StoreCollector(config);
      
      spinner.start('开始采集...');
      
      const stores = await collector.collectAll();
      
      // 统计信息
      const totalProducts = stores.reduce((sum, store) => sum + store.products.length, 0);
      
      spinner.succeed(chalk.green(`采集完成！共 ${stores.length} 个店铺，${totalProducts} 件商品`));
      
      // 显示详细信息
      console.log('\n' + chalk.bold('采集详情:'));
      for (const store of stores) {
        console.log(`  ${chalk.cyan(store.name)}: ${store.products.length} 件商品`);
      }
      
    } catch (error) {
      spinner.fail(chalk.red('采集失败'));
      logger.error('采集失败', error as Error);
      process.exit(1);
    }
  });

program
  .command('login')
  .description('手动登录淘宝（保存Cookie）')
  .option('-c, --config <path>', '配置文件路径', './config.json')
  .action(async (options) => {
    const spinner = ora('启动浏览器...').start();
    
    try {
      const config = loadConfig(options.config);
      const crawler = new PuppeteerCrawler(config);
      
      await crawler.launch();
      
      spinner.succeed('浏览器已启动');
      
      console.log(chalk.yellow('\n请在浏览器中手动登录淘宝'));
      console.log(chalk.yellow('登录完成后按 Enter 继续...\n'));
      
      // 等待用户登录
      await new Promise(resolve => {
        process.stdin.once('data', resolve);
      });
      
      // 保存Cookie
      await crawler.saveCookies();
      
      console.log(chalk.green('\nCookie 已保存！'));
      
      await crawler.close();
      
    } catch (error) {
      spinner.fail(chalk.red('登录失败'));
      logger.error('登录失败', error as Error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('列出已采集的数据')
  .option('-o, --output <path>', '数据目录', './data')
  .action((options) => {
    const fs = require('fs');
    const path = require('path');
    
    const jsonDir = path.join(options.output, 'json');
    
    if (!fs.existsSync(jsonDir)) {
      console.log(chalk.yellow('没有找到采集数据'));
      return;
    }
    
    const dirs = fs.readdirSync(jsonDir).filter((d: string) => 
      fs.statSync(path.join(jsonDir, d)).isDirectory()
    );
    
    if (dirs.length === 0) {
      console.log(chalk.yellow('没有找到采集数据'));
      return;
    }
    
    console.log(chalk.bold('\n已采集的数据:\n'));
    
    for (const dir of dirs) {
      const dirPath = path.join(jsonDir, dir);
      const files = fs.readdirSync(dirPath);
      
      console.log(chalk.cyan(`${dir}:`));
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        console.log(`  ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
      }
      console.log('');
    }
  });

program
  .command('export')
  .description('导出数据为CSV格式')
  .option('-o, --output <path>', '输出目录', './data')
  .action((options) => {
    console.log(chalk.yellow('导出功能开发中...'));
  });

program.parse();
```

- [ ] **Step 2: 提交**

```bash
git add src/index.ts
git commit -m "feat: 添加命令行接口"
```

---

## Task 13: 完善项目配置

**Files:**
- Create: `taobao-flash-sale-crawler/README.md`
- Modify: `taobao-flash-sale-crawler/package.json`

- [ ] **Step 1: 创建README.md**

```markdown
# 淘宝秒杀商品批量采集工具

一个基于Puppeteer的淘宝秒杀商品批量采集工具，支持采集多个店铺的秒杀商品信息。

## 功能特性

- 批量采集多个店铺的秒杀商品
- 采集商品名称、价格、库存、规格等详细信息
- 支持JSON和CSV两种数据格式
- 命令行界面，操作简单
- 支持Cookie登录态管理
- 请求频率控制，避免被封

## 安装

```bash
# 克隆项目
git clone <repository-url>
cd taobao-flash-sale-crawler

# 安装依赖
npm install
```

## 使用方法

### 1. 配置店铺

编辑 `config.json` 文件，添加要采集的店铺：

```json
{
  "stores": [
    {
      "name": "某某旗舰店",
      "url": "https://ms.ju.taobao.com/flashsale/...",
      "enabled": true
    }
  ]
}
```

### 2. 登录淘宝

首次使用需要登录淘宝保存Cookie：

```bash
npm run login
```

### 3. 开始采集

```bash
npm run crawl
```

或者使用npx：

```bash
npx ts-node src/index.ts crawl
```

### 4. 查看数据

采集完成后，数据保存在 `data` 目录下：

```
data/
├── json/
│   └── flash-sale-2026-05-29_10-30-00/
│       ├── 某某旗舰店.json
│       └── summary.json
├── csv/
│   └── flash-sale-2026-05-29_10-30-00/
│       ├── 某某旗舰店.csv
│       └── all-products.csv
└── cookies/
    └── taobao-cookies.json
```

## 命令行选项

```bash
npx ts-node src/index.ts [command] [options]

Commands:
  crawl      开始采集秒杀商品
  login      手动登录淘宝（保存Cookie）
  list       列出已采集的数据
  export     导出数据为CSV格式

Options:
  -c, --config <path>     配置文件路径 (default: "./config.json")
  -s, --stores <stores>   店铺名称（逗号分隔）
  -o, --output <path>     输出目录 (default: "./data")
  --headless               无头模式
  -h, --help              显示帮助信息
  -V, --version           显示版本号
```

## 配置说明

配置文件 `config.json` 包含以下选项：

```json
{
  "browser": {
    "headless": false,
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  },
  "crawler": {
    "maxRetries": 3,
    "retryDelay": 2000,
    "pageTimeout": 30000,
    "scrollDelay": 1000,
    "maxScrollTimes": 20,
    "requestInterval": 1500
  },
  "storage": {
    "jsonDir": "./data/json",
    "csvDir": "./data/csv",
    "filenamePrefix": "flash-sale",
    "dateFormat": "YYYY-MM-DD_HH-mm-ss"
  },
  "stores": [
    {
      "name": "店铺名称",
      "url": "秒杀页面URL",
      "enabled": true
    }
  ]
}
```

## 注意事项

1. **登录态**：首次使用需要登录淘宝，Cookie会保存在 `data/cookies/taobao-cookies.json`
2. **请求频率**：默认请求间隔为1500ms，可在配置中调整
3. **反爬机制**：如果遇到验证码，需要手动处理
4. **页面结构**：淘宝页面结构可能变化，需要更新选择器

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 运行构建后的代码
npm start
```

## License

MIT
```

- [ ] **Step 2: 更新package.json添加bin配置**

在package.json中添加：

```json
{
  "bin": {
    "taobao-flash-sale-crawler": "./dist/index.js"
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add README.md package.json
git commit -m "feat: 添加README和项目配置"
```

---

## Task 14: 测试和验证

**Files:**
- Create: `taobao-flash-sale-crawler/test/test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
// test/test.ts

import { loadConfig } from '../src/config/config';
import { Logger } from '../src/utils/logger';
import { RateLimiter } from '../src/utils/rate-limiter';
import { JsonStorage } from '../src/storage/json-storage';
import { CsvStorage } from '../src/storage/csv-storage';

async function testConfig() {
  console.log('测试配置加载...');
  const config = loadConfig();
  console.log('配置加载成功:', JSON.stringify(config, null, 2));
}

async function testLogger() {
  console.log('测试日志工具...');
  const logger = new Logger();
  logger.info('这是一条测试日志');
  logger.warn('这是一条警告日志');
  logger.error('这是一条错误日志', new Error('测试错误'));
}

async function testRateLimiter() {
  console.log('测试请求频率控制...');
  const limiter = new RateLimiter(1000);
  
  console.log('第一次请求...');
  await limiter.wait();
  console.log('第二次请求...');
  await limiter.wait();
  console.log('请求频率控制测试完成');
}

async function testStorage() {
  console.log('测试存储模块...');
  const config = loadConfig();
  
  const jsonStorage = new JsonStorage(config);
  const csvStorage = new CsvStorage(config);
  
  console.log('JSON存储目录:', jsonStorage.getOutputDir());
  console.log('CSV存储目录:', csvStorage.getOutputDir());
}

async function main() {
  console.log('开始测试...\n');
  
  await testConfig();
  console.log('');
  
  await testLogger();
  console.log('');
  
  await testRateLimiter();
  console.log('');
  
  await testStorage();
  console.log('');
  
  console.log('所有测试完成！');
}

main().catch(console.error);
```

- [ ] **Step 2: 添加测试脚本到package.json**

```json
{
  "scripts": {
    "test": "ts-node test/test.ts"
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm test
```

- [ ] **Step 4: 提交**

```bash
git add test/
git commit -m "feat: 添加测试文件"
```

---

## Task 15: 最终验证

- [ ] **Step 1: 构建项目**

```bash
npm run build
```

- [ ] **Step 2: 检查构建输出**

```bash
ls -la dist/
```

- [ ] **Step 3: 运行完整测试**

```bash
npm test
```

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "feat: 完成淘宝秒杀商品采集器"
```

---

**计划完成！**

两个执行选项：

**1. Subagent-Driven (推荐)** - 我为每个任务分发一个新的子代理，在任务之间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中使用executing-plans执行任务，批量执行并设置检查点

你选择哪种方式？
