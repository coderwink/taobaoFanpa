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
  title?: string; // 兼容注入脚本的字段
  price: ProductPrice;
  originalPrice?: number;
  image: string;
  detailUrl: string;
  link?: string; // 兼容注入脚本的字段
  store: ProductStore;
  stock: ProductStock;
  time: ProductTime;
  specs: ProductSpec[];
  // 从标题解析出的结构化信息
  category?: string;       // 品类：洗发水、沐浴露、洗衣液等
  brand?: string;          // 品牌：海飞丝、潘婷、蓝月亮等
  volume?: string;         // 规格/容量：750ml、500g、1L等
  attributes?: string[];   // 属性标签：去屑、滋润、控油等
  sales?: number;
  isFlashSale?: boolean;
  keyword?: string;
  platform?: 'taobao' | 'tmall';
  collectedAt: string;
  source: 'crawler' | 'tampermonkey' | 'smart';
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
