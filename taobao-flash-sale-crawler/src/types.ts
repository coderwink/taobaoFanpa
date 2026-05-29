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
