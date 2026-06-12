import { Step, AssistsXAsync, fileIO } from "assistsx-js";
import { log, clearLogs } from "../logging/app-log";

// ==================== 配置 ====================
const BACKEND_URL = "http://192.168.200.153:8000";
const MAX_ROUNDS = 30;
const TAOBAO_PACKAGE = "com.taobao.taobao";

class SimpleSwiperTask {
  private round = 0;

  start = async (): Promise<void> => {
    clearLogs();
    log("=== 开始 ===");

    // 检查后端
    try {
      const res = await fetch(`${BACKEND_URL}/api/health`);
      if (!res.ok) throw new Error("后端不可用");
      log("后端正常");
    } catch {
      log("错误：请先启动 Python 后端！");
      return;
    }

    // 打开淘宝
    log("打开淘宝...");
    await AssistsXAsync.launchApp(TAOBAO_PACKAGE);
    await new Promise(resolve => setTimeout(resolve, 3000));

    await Step.run(this.loop);
    log("=== 结束 ===");
  };

  private loop = async (step: Step): Promise<Step | undefined> => {
    this.round++;
    log(`--- 第 ${this.round} 轮 ---`);

    // 截屏
    const imgPath = await AssistsXAsync.takeScreenshotSave();
    if (!imgPath) {
      log("截屏失败");
      return step.repeat({ delayMs: 1000 });
    }
    log(`截图: ${imgPath}`);

    // 转 base64
    const base64 = await fileIO.readFile2BytesByStream(imgPath);
    if (!base64) {
      log("读取失败");
      return step.repeat({ delayMs: 1000 });
    }

    // 调用后端
    log("调用 AI...");
    let result: any;
    try {
      const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64 }),
      });
      result = await res.json();
    } catch (err) {
      log("API 失败: " + err);
      result = { scroll_direction: "down", confidence: 0 };
    }

    log(`AI 结果: ${JSON.stringify(result)}`);

    // 到达上限
    if (this.round >= MAX_ROUNDS) {
      log("达到上限，结束");
      return undefined;
    }

    // 向下滑动 - 手指从上往下滑
    log("执行滑动...");
    const screen = await AssistsXAsync.getScreenSize();
    const w = screen?.width || 1080;
    const h = screen?.height || 2400;
    const centerX = Math.floor(w / 2);

    try {
      await AssistsXAsync.performLinearGesture(
        { x: centerX, y: h - 100 },
        { x: centerX, y: 100 },
        { duration: 1000 }
      );
      log("滑动完成");
    } catch (err) {
      log("滑动失败: " + err);
    }

    await step.delay(1500);
    return step.repeat({ delayMs: 500 });
  };
}

export const simpleSwiperTask = new SimpleSwiperTask();
