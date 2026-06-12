import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import { Product, Store } from '../types';
import { StorageConfig } from '../config/config';
import { logger } from '../utils/logger';

export class Exporter {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  exportToJSON(stores: Store[]): string {
    const timestamp = dayjs().format(this.config.dateFormat);
    const filename = `${this.config.filenamePrefix}-${timestamp}.json`;
    const filePath = path.join(this.config.jsonDir, filename);

    this.ensureDir(this.config.jsonDir);

    const data = {
      collectedAt: new Date().toISOString(),
      totalStores: stores.length,
      totalProducts: stores.reduce((sum, s) => sum + s.products.length, 0),
      stores,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`JSON 导出完成: ${filePath}`);
    return filePath;
  }

  exportToCSV(stores: Store[]): string {
    const timestamp = dayjs().format(this.config.dateFormat);
    const filename = `${this.config.filenamePrefix}-${timestamp}.csv`;
    const filePath = path.join(this.config.csvDir, filename);

    this.ensureDir(this.config.csvDir);

    const headers = [
      '商品名称',
      '秒杀价',
      '原价',
      '折扣',
      '剩余库存',
      '已售数量',
      '店铺名称',
      '商品图片',
      '详情链接',
      '采集时间',
    ];

    const rows: string[] = [];
    rows.push(headers.join(','));

    for (const store of stores) {
      for (const product of store.products) {
        const row = [
          this.escapeCSV(product.name),
          this.escapeCSV(String(product.price.flashSale)),
          this.escapeCSV(String(product.price.original)),
          this.escapeCSV(product.price.discount),
          this.escapeCSV(String(product.stock.remaining)),
          this.escapeCSV(String(product.stock.sold)),
          this.escapeCSV(store.name),
          this.escapeCSV(product.image),
          this.escapeCSV(product.detailUrl),
          this.escapeCSV(product.collectedAt),
        ];
        rows.push(row.join(','));
      }
    }

    fs.writeFileSync(filePath, rows.join('\n'), 'utf-8');
    logger.info(`CSV 导出完成: ${filePath}`);
    return filePath;
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
