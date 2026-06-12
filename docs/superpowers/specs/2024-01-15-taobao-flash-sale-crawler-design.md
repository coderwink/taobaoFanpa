# 淘宝秒杀商品采集器设计文档

## 1. 项目概述

### 1.1 项目背景

PC端淘宝秒杀页面URL中包含商品ID信息，相比移动端更容易获取商品数据。本项目旨在创建一个独立的PC端采集工具，用于批量采集多个店铺的秒杀商品信息。

### 1.2 项目目标

- 创建独立的Node.js项目，与现有Android项目分离
- 使用Puppeteer浏览器自动化技术采集秒杀商品数据
- 支持批量采集多个店铺的商品信息
- 采集所有可用信息：基础信息、库存、时间、商品详情
- 数据保存为JSON和CSV两种格式

### 1.3 技术选型

- **浏览器自动化**: Puppeteer（方案A）
- **运行环境**: Node.js + TypeScript
- **数据存储**: JSON + CSV（两种格式都保留）

## 2. 系统架构

### 2.1 项目结构

```
taobao-flash-sale-crawler/
├── src/
│   ├── crawler/
│   │   ├── puppeteer-crawler.ts      # Puppeteer浏览器自动化核心
│   │   ├── page-parser.ts            # 页面解析逻辑
│   │   └── data-extractor.ts         # 数据提取和清洗
│   ├── collectors/
│   │   ├── store-collector.ts        # 店铺数据采集器
│   │   └── product-collector.ts      # 商品数据采集器
│   ├── storage/
│   │   ├── json-storage.ts           # JSON文件存储
│   │   └── csv-storage.ts            # CSV文件存储
│   ├── utils/
│   │   ├── logger.ts                 # 日志工具
│   │   ├── retry.ts                  # 重试机制
│   │   └── rate-limiter.ts           # 请求频率控制
│   └── config/
│       └── config.ts                 # 配置管理
├── data/
│   ├── json/                         # JSON数据存储目录
│   └── csv/                          # CSV数据存储目录
├── package.json
├── tsconfig.json
└── README.md
```

### 2.2 核心组件

#### PuppeteerCrawler
- 启动/关闭浏览器
- 页面导航
- 登录态管理（Cookie加载/保存）
- 截图和调试

#### PageParser
- 解析秒杀页面结构
- 提取商品列表
- 处理分页和滚动

#### DataExtractor
- 从页面元素提取商品信息
- 数据清洗和标准化
- 去重处理

#### StoreCollector
- 遍历店铺列表
- 管理采集进度
- 错误处理和重试

#### Storage
- JSON格式保存原始数据
- CSV格式生成报表
- 文件命名和目录管理

## 3. 数据模型

### 3.1 商品信息 (Product)

```typescript
interface Product {
  id: string;                    // 商品ID（从URL提取）
  name: string;                  // 商品名称
  price: {
    original: number;            // 原价
    flashSale: number;           // 秒杀价
    discount: string;            // 折扣信息
  };
  image: string;                 // 商品图片URL
  detailUrl: string;             // 详情页URL
  store: {
    id: string;                  // 店铺ID
    name: string;                // 店铺名称
    url: string;                 // 店铺URL
  };
  stock: {
    total: number;               // 总库存
    remaining: number;           // 剩余库存
    sold: number;                // 已售数量
    limit: number;               // 限购数量
  };
  time: {
    startTime: string;           // 秒杀开始时间
    endTime: string;             // 秒杀结束时间
    countdown: string;           // 倒计时
  };
  specs: Array<{                 // 商品规格
    name: string;                // 规格名称
    value: string;               // 规格值
  }>;
  collectedAt: string;           // 采集时间
  source: 'crawler' | 'tampermonkey';  // 数据来源
}
```

### 3.2 店铺信息 (Store)

```typescript
interface Store {
  id: string;
  name: string;
  url: string;
  products: Product[];
  collectedAt: string;
}
```

### 3.3 采集任务 (CrawlTask)

```typescript
interface CrawlTask {
  id: string;
  storeUrls: string[];           // 店铺URL列表
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  startTime: string;
  endTime?: string;
}
```

## 4. 采集流程

### 4.1 流程图

```
开始采集
    │
    ▼
加载配置（店铺URL列表、Cookie）
    │
    ▼
启动浏览器
    │
    ▼
遍历店铺列表
    │
    ├─► 导航到店铺秒杀页面
    │
    ├─► 等待页面加载完成
    │
    ├─► 检查是否需要登录
    │   ├─ 是 → 提示用户手动登录，保存Cookie
    │   └─ 否 → 继续
    │
    ├─► 提取商品列表
    │   ├─ 滚动页面加载更多商品
    │   ├─ 解析商品卡片信息
    │   └─ 进入详情页获取完整信息
    │
    ├─► 保存商品数据
    │   ├─ 去重处理
    │   ├─ 保存到JSON
    │   └─ 追加到CSV
    │
    └─► 记录采集进度
    │
    ▼
生成报表（CSV + 采集报告）
    │
    ▼
清理资源（关闭浏览器）
```

### 4.2 详细步骤

1. **加载配置**
   - 读取config.json配置文件
   - 加载店铺URL列表
   - 加载已保存的Cookie（如果存在）
   - 设置采集参数

2. **启动浏览器**
   - 启动Puppeteer实例
   - 创建新页面
   - 注入Cookie（如果存在）
   - 设置视口大小

3. **遍历店铺列表**
   - 对每个店铺URL执行采集
   - 管理采集进度
   - 处理错误和重试

4. **采集商品数据**
   - 导航到秒杀页面
   - 等待页面加载
   - 滚动加载更多商品
   - 提取商品信息
   - 进入详情页获取完整信息

5. **保存数据**
   - 去重处理（基于商品ID）
   - 保存JSON原始数据
   - 追加CSV报表数据
   - 记录采集日志

6. **生成报表**
   - 汇总所有店铺数据
   - 生成CSV报表
   - 生成采集报告（Markdown格式）

## 5. 配置管理

### 5.1 配置结构

```typescript
interface Config {
  browser: {
    headless: boolean;           // 是否无头模式
    executablePath?: string;     // Chrome可执行文件路径
    userDataDir?: string;        // 用户数据目录
    viewport: {
      width: number;
      height: number;
    };
  };
  crawler: {
    maxRetries: number;          // 最大重试次数
    retryDelay: number;          // 重试延迟（ms）
    pageTimeout: number;         // 页面加载超时（ms）
    scrollDelay: number;         // 滚动间隔（ms）
    maxScrollTimes: number;      // 最大滚动次数
    requestInterval: number;     // 请求间隔（ms）
  };
  storage: {
    jsonDir: string;             // JSON存储目录
    csvDir: string;              // CSV存储目录
    filenamePrefix: string;      // 文件名前缀
    dateFormat: string;          // 日期格式
  };
  stores: Array<{
    name: string;                // 店铺名称
    url: string;                 // 秒杀页面URL
    enabled: boolean;            // 是否启用
  }>;
}
```

### 5.2 默认配置

```typescript
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
```

## 6. 错误处理

### 6.1 错误类型

```typescript
enum ErrorType {
  NETWORK = 'NETWORK',           // 网络错误
  TIMEOUT = 'TIMEOUT',           // 超时错误
  SELECTOR = 'SELECTOR',         // 选择器未找到
  ANTIBOT = 'ANTIBOT',           // 反爬检测
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',  // 需要登录
  UNKNOWN = 'UNKNOWN',           // 未知错误
}
```

### 6.2 处理策略

- **NETWORK/TIMEOUT**: 等待后重试（最多3次），指数退避
- **SELECTOR**: 记录页面快照，跳过当前商品
- **ANTIBOT**: 暂停采集，提示用户手动处理验证码
- **LOGIN_REQUIRED**: 暂停采集，提示用户手动登录

### 6.3 日志系统

- 日志级别：DEBUG、INFO、WARN、ERROR
- 输出方式：控制台（带颜色）、文件（JSON格式）
- 日志格式：时间戳 + 级别 + 消息 + 上下文

## 7. 命令行接口

### 7.1 命令

```bash
npx taobao-flash-sale-crawler [command] [options]

Commands:
  crawl      开始采集秒杀商品
  login      手动登录淘宝（保存Cookie）
  list       列出已采集的数据
  export     导出数据为CSV格式
  config     管理配置文件
```

### 7.2 选项

```bash
Options:
  --config, -c     配置文件路径 (default: "./config.json")
  --stores, -s     店铺名称（逗号分隔）
  --output, -o     输出目录 (default: "./data")
  --headless       无头模式 (default: false)
  --help           显示帮助信息
  --version        显示版本号
```

### 7.3 使用示例

```bash
# 首次使用 - 登录淘宝
npx taobao-flash-sale-crawler login

# 开始采集（使用配置文件）
npx taobao-flash-sale-crawler crawl

# 采集指定店铺
npx taobao-flash-sale-crawler crawl --stores "某某旗舰店,另一家店"

# 无头模式采集
npx taobao-flash-sale-crawler crawl --headless

# 查看已采集数据
npx taobao-flash-sale-crawler list

# 导出CSV
npx taobao-flash-sale-crawler export --output ./reports
```

## 8. 数据目录结构

```
data/
├── json/
│   └── 2026-05-29_10-30-00/
│       ├── 某某旗舰店.json
│       ├── 另一家店.json
│       └── summary.json
├── csv/
│   └── 2026-05-29_10-30-00/
│       ├── 某某旗舰店.csv
│       ├── 另一家店.csv
│       └── all-products.csv
├── reports/
│   └── 2026-05-29_10-30-00.md
└── cookies/
    └── taobao-cookies.json
```

## 9. 实现计划

### 9.1 第一阶段：核心功能

1. 项目初始化（package.json、tsconfig.json）
2. 配置管理模块
3. Puppeteer浏览器自动化核心
4. 页面解析和数据提取
5. JSON存储模块

### 9.2 第二阶段：完善功能

1. CSV存储模块
2. 命令行接口
3. 错误处理和重试机制
4. 日志系统
5. 采集进度显示

### 9.3 第三阶段：优化和测试

1. 性能优化
2. 反爬处理
3. 单元测试
4. 集成测试
5. 文档编写

## 10. 依赖项

```json
{
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
    "ts-node": "^10.9.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  }
}
```

## 11. 风险和注意事项

### 11.1 反爬风险

- 淘宝有反爬机制，频繁请求可能被封
- 解决方案：请求频率控制、随机延迟、Cookie管理

### 11.2 页面结构变化

- 淘宝页面结构可能随时变化
- 解决方案：模块化设计，便于更新选择器

### 11.3 登录态管理

- Cookie可能过期
- 解决方案：定期检查登录态，提示用户重新登录

### 11.4 性能考虑

- Puppeteer资源占用较高
- 解决方案：无头模式、合理配置超时时间

---

**文档版本**: 1.0
**创建日期**: 2026-05-29
**作者**: Claude Code
