# Swiper AI Backend

AI 驱动的 Swiper 组件识别服务，为 AssistsX 提供视觉分析能力。

## 功能

- 接收手机截图（base64 或文件上传）
- 调用 xiaomimomo 视觉模型分析
- 识别页面中的 Swiper/轮播组件
- 返回滑动指令（right/left/down/none）

## 快速开始

### 1. 安装依赖

```bash
cd swiper-ai-backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
XIAOMIMIMO_API_KEY=sk-your-api-key-here
XIAOMIMIMO_BASE_URL=https://platform.xiaomimimo.com/v1
XIAOMIMIMO_MODEL=mimo
```

### 3. 启动服务

```bash
python main.py
```

服务将在 `http://localhost:8000` 启动。

### 4. 查看 API 文档

访问 `http://localhost:8000/docs` 查看 Swagger 文档。

## API 接口

### POST /api/analyze

分析截图，返回滑动指令。

**请求体：**

```json
{
  "image_base64": "base64编码的图片数据",
  "context": "可选的自定义prompt"
}
```

**响应：**

```json
{
  "has_swiper": true,
  "swiper_not_finished": true,
  "need_scroll_down": false,
  "scroll_direction": "right",
  "confidence": 0.9,
  "description": "检测到一个图片轮播组件，还有更多内容未显示"
}
```

### POST /api/analyze/upload

通过文件上传分析截图。

**请求：** multipart/form-data，字段名为 `file`

**响应：** 同上

### GET /api/health

健康检查。

## 架构

```
┌─────────────────┐     HTTP      ┌─────────────────┐
│   AssistsX      │ ─────────────>│   Python 后端   │
│   (手机端)      │               │   (AI 分析)     │
│                 │<───────────── │                 │
└─────────────────┘   滑动指令    └─────────────────┘
                                           │
                                           │ API 调用
                                           ▼
                                  ┌─────────────────┐
                                  │ xiaomimomo API  │
                                  │ (视觉大模型)    │
                                  └─────────────────┘
```

## 开发

### 项目结构

```
swiper-ai-backend/
├── app/
│   ├── __init__.py
│   ├── api.py          # API 路由
│   ├── ai_service.py   # AI 调用逻辑
│   ├── config.py       # 配置管理
│   └── models.py       # 数据模型
├── main.py             # 应用入口
├── requirements.txt    # 依赖
├── .env.example        # 环境变量示例
└── README.md           # 本文件
```

### 运行测试

```bash
# 启动服务
python main.py

# 测试 API
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"image_base64": "your-base64-image-data"}'
```

## 与 AssistsX 集成

AssistsX 端需要修改 `swiper-screenshot.ts`，将 AI 调用改为调用本后端 API：

```typescript
// 旧代码（直接调用 AI）
const result = await askAI(base64, prompt);

// 新代码（调用 Python 后端）
const result = await fetch('http://your-server:8000/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image_base64: base64 })
});
```
