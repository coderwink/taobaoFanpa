# 爬取管道设计

## 概述

为 taobao-flash-sale-crawler 补齐缺失的胶水代码，实现完整的爬取管道：CLI入口 -> 登录 -> 爬取 -> 数据导出。

## 架构

```
src/
  index.ts                  -- CLI入口 (commander)
  crawler/
    puppeteer-crawler.ts    -- [已有] 浏览器管理
    page-parser.ts          -- [已有] 页面解析
    login.ts                -- [新增] 手动扫码登录
    orchestrator.ts         -- [新增] 爬取编排
  storage/
    exporter.ts             -- [新增] JSON/CSV导出
  config/
    config.ts               -- [已有] 配置管理
  utils/
    logger.ts               -- [已有]
    retry.ts                -- [已有]
    rate-limiter.ts         -- [已有]
  types.ts                  -- [已有] 数据模型
```

## 模块设计

### 1. CLI 入口 (`src/index.ts`)

使用 commander 定义两个子命令：

- **`login`** — 打开非无头浏览器，用户扫码登录，保存cookie
- **`crawl`** — 执行完整爬取管道

全局选项：
- `--config <path>` — 指定配置文件路径（默认 `config.json`）

示例：
```bash
npx ts-node src/index.ts login
npx ts-node src/index.ts crawl
npx ts-node src/index.ts crawl --config ./my-config.json
```

### 2. 登录流程 (`src/crawler/login.ts`)

`LoginManager` 类，接收 `PuppeteerCrawler` 实例。

流程：
1. 以 `headless: false` 启动浏览器（覆盖配置）
2. 导航到 `https://login.taobao.com`
3. 打印提示信息："请在浏览器中扫码登录"
4. 轮询检测 `.site-nav-login` 元素是否消失（登录成功标志）
5. 成功后调用 `crawler.saveCookies()` 保存cookie
6. 关闭浏览器

超时处理：5分钟未登录自动退出并提示。

### 3. 爬取编排 (`src/crawler/orchestrator.ts`)

`CrawlOrchestrator` 类，职责：串联所有模块完成端到端爬取。

流程：
1. 加载配置 (`loadConfig`)
2. 创建 `PuppeteerCrawler` 并启动浏览器
3. 尝试加载已保存的cookie (`loadCookies`)
4. 导航到淘宝任意页面，检查登录状态 (`isLoggedIn`)
5. 未登录则打印提示，退出并建议先执行 `login` 命令
6. 遍历配置中 `enabled: true` 的店铺（串行）
7. 对每个店铺：
   - 创建 `RateLimiter` 控制请求间隔
   - 导航到店铺URL
   - 创建 `PageParser` 提取商品列表
   - 收集结果到 `Store` 对象
8. 调用 `Exporter` 保存所有数据
9. 打印汇总统计
10. 关闭浏览器

### 4. 数据导出 (`src/storage/exporter.ts`)

`Exporter` 类，接收 `StorageConfig`。

**JSON导出**：
- 输出文件：`{jsonDir}/{filenamePrefix}-{timestamp}.json`
- 内容：按店铺分组的商品数据，外加采集时间

**CSV导出**：
- 输出文件：`{csvDir}/{filenamePrefix}-{timestamp}.csv`
- 扁平化字段：商品名、秒杀价、原价、折扣、剩余库存、已售、店铺名、图片URL、详情链接、采集时间
- 使用逗号分隔，自动处理字段中的逗号（加引号）

**目录管理**：
- 自动创建输出目录（`mkdirSync recursive`）
- 文件名时间戳格式：`YYYY-MM-DD_HH-mm-ss`（使用 dayjs）

## 数据流

```
config.json
    |
    v
loadConfig()
    |
    v
PuppeteerCrawler.launch()
    |
    v
loadCookies() -> isLoggedIn() --[未登录]--> 提示退出
    |
    v [已登录]
for each store in config.stores:
    |
    v
  crawler.navigate(store.url)
    |
    v
  parser.extractProducts(storeInfo)
    |
    v
  products.push(...)
    |
    v
Exporter.exportToJSON(allProducts)
Exporter.exportToCSV(allProducts)
```

## 错误处理

- 浏览器启动失败：打印错误，退出
- 登录超时：打印提示，退出
- 单个店铺爬取失败：记录错误，继续下一个店铺
- 数据导出失败：打印错误，不中断其他导出

## 依赖

无新增npm依赖，使用已有的：
- `commander` — CLI解析
- `chalk` — 终端彩色输出
- `ora` — 加载动画（可选）
- `dayjs` — 时间戳格式化
