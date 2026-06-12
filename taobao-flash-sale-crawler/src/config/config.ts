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
  storeName: string;
  enabled: boolean;
}

export interface Config {
  browser: BrowserConfig;
  crawler: CrawlerConfig;
  storage: StorageConfig;
  searchUrlTemplate: string;
  flashSaleKeywords: string[];
  stores: StoreConfig[];
}

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
  searchUrlTemplate: 'https://s.taobao.com/search?q={storeName}',
  flashSaleKeywords: ['秒杀', '限时抢', '特价', '清仓', '聚划算'],
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
