# 淘宝秒杀爬虫（智能版）

## 原理

使用 `chrome-launcher` 启动你自己的 Chrome 浏览器（保留登录态），然后通过 CDP 协议连接并注入脚本抓取数据。

**优势：**
- ✅ 使用你自己的 Chrome profile，保留淘宝登录态
- ✅ 不会被检测为自动化工具
- ✅ 无需处理验证码
- ✅ 完全自动化，一键运行

## 使用方法

### 1. 首次运行（需要手动登录）

```bash
cd taobao-flash-sale-crawler

# 启动智能爬虫
npm run smart
```

首次运行时，Chrome 会打开淘宝页面。如果你还没有登录，需要手动登录一次。登录后，Chrome 会保存你的登录态。

### 2. 配置店铺

编辑 `config.json`，添加你要监控的店铺：

```json
{
  "stores": [
    {
      "storeName": "欧莱雅美发官方旗舰店",
      "enabled": true
    },
    {
      "storeName": "某品牌官方旗舰店",
      "enabled": true
    }
  ]
}
```

### 3. 运行爬虫

```bash
# 使用智能爬虫（推荐）
npm run smart

# 或者使用原来的 Puppeteer 爬虫（可能会被验证）
npm run crawl
```

## 工作流程

1. **启动 Chrome** - 使用 `chrome-launcher` 启动你自己的 Chrome
2. **连接浏览器** - 通过 CDP 协议连接到 Chrome
3. **注入反检测脚本** - 隐藏自动化特征
4. **访问淘宝** - 先访问首页检查登录态
5. **搜索店铺** - 逐个搜索配置的店铺
6. **提取数据** - 注入脚本提取商品信息
7. **导出数据** - 保存为 JSON 和 CSV 文件

## 文件结构

```
taobao-flash-sale-crawler/
├── src/
│   ├── crawler/
│   │   ├── smart-crawler.ts      # 智能爬虫核心
│   │   ├── script-injector.ts    # 脚本注入器
│   │   ├── smart-orchestrator.ts # 智能编排器
│   │   └── ...
│   ├── smart-index.ts            # 智能爬虫入口
│   └── ...
├── data/                         # 数据输出目录
│   ├── json/                     # JSON 文件
│   ├── csv/                      # CSV 文件
│   └── debug-*.png               # 调试截图
└── config.json                   # 配置文件
```

## 调试

运行时会生成调试截图：
- `data/debug-homepage.png` - 淘宝首页截图
- `data/debug-search-*.png` - 搜索结果截图

如果遇到问题，可以查看这些截图确认页面状态。

## 注意事项

1. **首次登录** - 第一次运行需要手动登录淘宝
2. **Chrome 版本** - 需要安装 Chrome 浏览器
3. **不要手动关闭** - 运行过程中不要手动关闭 Chrome 窗口
4. **网络环境** - 确保网络稳定，避免请求过快

## 与原方案对比

| 特性 | 原 Puppeteer 方案 | 智能方案 |
|------|------------------|----------|
| 登录态 | 需要每次登录 | 保留用户登录态 |
| 反检测 | 容易被识别 | 使用真实浏览器 |
| 验证码 | 经常遇到 | 基本不会遇到 |
| 自动化程度 | 半自动 | 全自动 |
| 稳定性 | 低 | 高 |
