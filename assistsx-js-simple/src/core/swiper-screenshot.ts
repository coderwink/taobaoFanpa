import { Step, AssistsXAsync, fileIO, imageUtils } from "assistsx-js";
import { log, clearLogs } from "../logging/app-log";

// ==================== 配置区域 ====================
// 请填入你的 xiaomimomo API 配置
const AI_CONFIG = {
  apiKey: "sk-c4k7dqgb34fw3orflczt1m4dut4yshilxgvi0tj2unhzyu56", // TODO: 替换为你的 API Key
  baseUrl: "https://api.xiaomimimo.com/v1", // API 基础地址
  model: "mimo", // 模型名称，根据实际使用调整
};

// ==================== AI 视觉识别模块 ====================
interface AIResponse {
  has_swiper: boolean;
  swiper_not_finished: boolean;
  need_scroll_down: boolean;
  scroll_direction: "right" | "left" | "down" | "none";
  confidence: number;
  description: string;
}

/**
 * 调用 xiaomimomo 视觉模型分析截图
 */
async function askAI(imageBase64: string, question: string): Promise<AIResponse> {
  const url = `${AI_CONFIG.baseUrl}/chat/completions`;

  const requestBody = {
    model: AI_CONFIG.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
          {
            type: "text",
            text: question,
          },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_CONFIG.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // 尝试解析 JSON 响应
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AIResponse;
    }

    // 如果没有 JSON，根据文本内容推断
    return {
      has_swiper: content.includes("swiper") || content.includes("轮播") || content.includes("左右滑动"),
      swiper_not_finished: content.includes("未完成") || content.includes("还有") || content.includes("继续"),
      need_scroll_down: content.includes("向下") || content.includes("更多"),
      scroll_direction: content.includes("向右") ? "right" : content.includes("向左") ? "left" : "down",
      confidence: 0.8,
      description: content,
    };
  } catch (error) {
    log("AI 调用失败: " + error);
    return {
      has_swiper: false,
      swiper_not_finished: false,
      need_scroll_down: true,
      scroll_direction: "down",
      confidence: 0,
      description: "AI 调用失败，默认向下滑动",
    };
  }
}

// ==================== 主任务类 ====================
class SwiperScreenshotTask {
  private maxScreenshots = 50; // 最大截屏次数，防止死循环
  private swipeCount = 0; // 已截屏次数
  private swiperScreenshots: string[] = []; // Swiper 区域的截图

  // Swiper 识别的 Prompt
  private readonly SWIPER_PROMPT = `请分析这个手机截图，判断是否存在可以左右滑动的轮播组件（Swiper/Carousel）。

请按以下格式返回 JSON：
{
  "has_swiper": true/false,          // 是否存在可滑动的轮播组件
  "swiper_not_finished": true/false, // 轮播内容是否还未完全显示（还有更多内容）
  "need_scroll_down": true/false,    // 整个页面是否需要继续向下滚动
  "scroll_direction": "right"/"left"/"down"/"none",  // 建议的滑动方向
  "confidence": 0.0-1.0,            // 识别置信度
  "description": "简短描述你看到的内容"
}

判断依据：
1. 是否有多个并列的内容块（如图片、卡片）水平排列
2. 是否有指示器（小圆点、线条等）表示可滑动
3. 内容是否被截断，需要滑动才能完全显示
4. 注意区分：整个页面的滚动 vs 单个组件的滑动`;

  start = async (targetApp?: string): Promise<void> => {
    clearLogs();
    this.swipeCount = 0;
    this.swiperScreenshots = [];

    try {
      if (targetApp) {
        log(`正在启动 ${targetApp}...`);
        await Step.run(this.launchApp);
      }
      log("开始 Swiper 智能截图...");
      await Step.run(this.startSmartScreenshot);
    } catch (error) {
      log("Swiper 截图失败：" + error);
    }
  };

  private launchApp = async (step: Step): Promise<Step | undefined> => {
    // 这里需要用户提供目标 App 的包名
    // 常见示例：'com.taobao.taobao' (淘宝), 'com.jingdong.app.mall' (京东)
    log("请手动切换到目标 App...");
    await step.delay(3000);
    return step.next(this.startSmartScreenshot);
  };

  private startSmartScreenshot = async (step: Step): Promise<Step | undefined> => {
    log("开始智能截图流程...");

    // 获取屏幕尺寸
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;
    log(`屏幕尺寸: ${screenW}x${screenH}`);

    // 计算裁剪区域（去除状态栏和导航栏）
    const cropTop = Math.floor(screenH * 0.08); // 状态栏约 8%
    const cropBottom = Math.floor(screenH * 0.06); // 底部导航约 6%

    // 主循环
    while (this.swipeCount < this.maxScreenshots) {
      this.swipeCount++;
      log(`--- 第 ${this.swipeCount} 轮截图 ---`);

      // 1. 截屏
      const imagePath = await AssistsXAsync.takeScreenshotSave();
      if (!imagePath) {
        log("截屏失败，重试...");
        await step.delay(1000);
        continue;
      }
      log(`截图已保存: ${imagePath}`);

      // 2. 读取图片并转 base64
      const base64 = await fileIO.readFile2BytesByStream(imagePath);
      if (!base64) {
        log("读取图片失败");
        continue;
      }

      // 3. 调用 AI 分析
      log("正在调用 AI 分析截图...");
      const aiResult = await askAI(base64, this.SWIPER_PROMPT);
      log(`AI 分析结果: ${JSON.stringify(aiResult)}`);

      // 4. 根据 AI 结果决定操作
      if (aiResult.confidence < 0.5) {
        log("AI 识别置信度较低，尝试向下滑动...");
        await this.performSwipe(step, screenW, screenH, "down", cropTop, cropBottom);
        continue;
      }

      if (aiResult.swiper_not_finished && aiResult.has_swiper) {
        // Swiper 还有内容，向右滑动
        log("检测到 Swiper 未完成，向右滑动...");
        this.swiperScreenshots.push(imagePath); // 保存当前截图
        await this.performSwipe(step, screenW, screenH, "right", cropTop, cropBottom);
      } else if (aiResult.has_swiper && !aiResult.swiper_not_finished) {
        // Swiper 已完成，保存并继续向下
        log("Swiper 已完成，继续向下滚动...");
        this.swiperScreenshots.push(imagePath);
        await this.performSwipe(step, screenW, screenH, "down", cropTop, cropBottom);
      } else if (aiResult.need_scroll_down) {
        // 没有 Swiper，继续向下
        log("没有检测到 Swiper，继续向下滚动...");
        await this.performSwipe(step, screenW, screenH, "down", cropTop, cropBottom);
      } else {
        // 可能已经到底了
        log("页面可能已到底部，保存当前截图...");
        this.swiperScreenshots.push(imagePath);
        break;
      }

      await step.delay(1500); // 等待页面渲染
    }

    log(`截图完成，共 ${this.swiperScreenshots.length} 张`);

    // 5. 拼接所有截图（如果有）
    if (this.swiperScreenshots.length > 1) {
      log("开始拼接截图...");
      try {
        const stitchedBase64 = await this.stitchImages(this.swiperScreenshots, cropTop, cropBottom);
        const savePath = `/sdcard/swiper_screenshot_${Date.now()}.jpg`;
        await fileIO.writeFileFromBytesByStream(savePath, stitchedBase64);
        await imageUtils.save2Album(savePath);
        log(`长图已保存到: ${savePath}`);
      } catch (err) {
        log("拼接失败: " + err);
      }
    }

    log("任务完成！");
    return undefined;
  };

  /**
   * 执行滑动操作
   */
  private performSwipe = async (
    step: Step,
    screenW: number,
    screenH: number,
    direction: "right" | "left" | "down",
    cropTop: number,
    cropBottom: number
  ): Promise<void> => {
    const margin = 30;
    const centerY = Math.floor(screenH / 2);
    const centerX = Math.floor(screenW / 2);

    try {
      switch (direction) {
        case "right":
          // 向右滑动：从右往左滑（手指从右向左）
          await AssistsXAsync.performLinearGesture(
            { x: screenW - margin, y: centerY },
            { x: margin, y: centerY },
            { duration: 800 }
          );
          log("已向右滑动");
          break;

        case "left":
          // 向左滑动：从左往右滑
          await AssistsXAsync.performLinearGesture(
            { x: margin, y: centerY },
            { x: screenW - margin, y: centerY },
            { duration: 800 }
          );
          log("已向左滑动");
          break;

        case "down":
        default:
          // 向下滑动：从下往上滑
          const scrollStartY = screenH - cropBottom - margin;
          const scrollEndY = cropTop + margin;
          await AssistsXAsync.performLinearGesture(
            { x: centerX, y: scrollStartY },
            { x: centerX, y: scrollEndY },
            { duration: 1000 }
          );
          log("已向下滑动");
          break;
      }
    } catch (err) {
      log("滑动失败: " + err);
    }
  };

  /**
   * 拼接多张截图
   */
  private stitchImages = async (paths: string[], cropTop: number, cropBottom: number): Promise<string> => {
    const images: HTMLImageElement[] = [];

    for (let i = 0; i < paths.length; i++) {
      try {
        const base64Str = await fileIO.readFile2BytesByStream(paths[i]);
        if (!base64Str) continue;
        const dataUri = `data:image/png;base64,${base64Str}`;
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = (e) => reject(e);
          image.src = dataUri;
        });
        images.push(img);
      } catch (err) {
        log(`第 ${i + 1} 张图片加载失败: ${err}`);
      }
    }

    if (images.length === 0) throw new Error("没有可供拼接的图片");

    const W = images[0].width;
    const H = images[0].height;
    const overlap = 0;
    const firstKeep = H - cropBottom;
    const restStart = cropTop + overlap;
    const restKeep = H - cropBottom - restStart;
    const totalHeight = firstKeep + Math.max(restKeep, 0) * (images.length - 1);

    log(`拼接: W=${W}, H=${H}, total=${totalHeight}`);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");

    let currentY = 0;
    for (let i = 0; i < images.length; i++) {
      if (i === 0) {
        ctx.drawImage(images[i], 0, 0, W, firstKeep, 0, currentY, W, firstKeep);
        currentY += firstKeep;
      } else {
        if (restKeep > 0) {
          ctx.drawImage(images[i], 0, restStart, W, restKeep, 0, currentY, W, restKeep);
          currentY += restKeep;
        }
      }
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  };
}

export const swiperScreenshotTask = new SwiperScreenshotTask();
