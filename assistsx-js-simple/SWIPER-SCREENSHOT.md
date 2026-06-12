# AI Swiper 智能截图功能

基于 AssistsX + xiaomimomo 视觉大模型的智能截图功能，自动识别页面中的轮播/Swiper 组件并截图。

## 功能说明

该功能会：
1. 自动截取当前页面
2. 调用 xiaomimomo 视觉模型分析截图
3. 识别是否存在可滑动的轮播组件（Swiper/Carousel）
4. 如果检测到 Swiper，自动向右滑动继续截图
5. 直到 Swiper 内容全部截取完成
6. 继续向下滚动获取更多内容
7. 最后将所有截图拼接成一张长图

## 配置步骤

### 1. 获取 API Key

前往 [xiaomimomo 平台](https://platform.xiaomimimo.com) 注册并获取 API Key。

### 2. 修改配置

编辑 `src/core/swiper-screenshot.ts` 文件，修改以下配置：

```typescript
const AI_CONFIG = {
  apiKey: "sk-your-api-key-here", // 替换为你的 API Key
  baseUrl: "https://platform.xiaomimimo.com/v1", // API 基础地址
  model: "mimo", // 模型名称，根据实际使用调整
};
```

### 3. 构建并运行

```bash
npm install
npm run build
```

将生成的 `dist` 文件夹压缩为 `.zip`，传到手机后在 AssistsX 中加载。

## 使用方法

1. 打开包含 Swiper 组件的 App 页面
2. 在 AssistsX 中加载插件
3. 点击「AI Swiper截图」按钮
4. 等待自动完成

## AI Prompt 说明

系统使用以下 Prompt 来让 AI 识别 Swiper 组件：

```
请分析这个手机截图，判断是否存在可以左右滑动的轮播组件（Swiper/Carousel）。

判断依据：
1. 是否有多个并列的内容块（如图片、卡片）水平排列
2. 是否有指示器（小圆点、线条等）表示可滑动
3. 内容是否被截断，需要滑动才能完全显示
4. 注意区分：整个页面的滚动 vs 单个组件的滑动
```

## 注意事项

- 首次使用需要配置 API Key
- AI 识别需要网络连接
- 如果识别不准确，可以调整 Prompt 或增加置信度阈值
- 默认最多截取 50 张图片，防止死循环

## 技术架构

```
用户点击按钮
    ↓
打开浮窗日志面板
    ↓
启动 SwiperScreenshotTask
    ↓
┌─────────────────────────────────┐
│  循环：                          │
│  1. 截屏                         │
│  2. 调用 xiaomimomo API          │
│  3. AI 分析是否存在 Swiper       │
│  4. 根据结果决定滑动方向          │
│  5. 执行滑动                     │
│  6. 重复直到完成                  │
└─────────────────────────────────┘
    ↓
拼接所有截图
    ↓
保存到相册
```
