import { Step, AssistsXAsync, fileIO, imageUtils } from 'assistsx-js';
import { log, clearLogs } from '../logging/app-log';
import { backendClient, AgentAction } from './backend-client';
import { computePHash, isSimilar } from './image-hash';

// ==================== 配置 ====================

interface WidgetCollectorConfig {
  maxScreenshots: number;     // 最大总截屏次数
  maxWidgetPages: number;     // 单个 widget 最大页数
  hashThreshold: number;      // pHash 相似度阈值
  sameHashLimit: number;      // 连续相同 hash 次数认为结束
  actionDelayMs: number;      // 每次操作后等待时间
}

const DEFAULT_CONFIG: WidgetCollectorConfig = {
  maxScreenshots: 80,
  maxWidgetPages: 25,
  hashThreshold: 10,
  sameHashLimit: 3,
  actionDelayMs: 1500,
};

// ==================== 数据结构 ====================

/** 已识别的小部件信息（发送给后端 AI） */
interface WidgetInfo {
  widget_type: string;
  widget_name: string;
  is_captured: boolean;
  screenshot_count: number;
}

/** 本地 widget 追踪 */
interface TrackedWidget {
  id: number;
  type: string;
  name: string;
  screenshotPaths: string[];
  hashes: string[];
  isCaptured: boolean;
}

// ==================== 主任务类 ====================

class WidgetCollector {
  private config: WidgetCollectorConfig;
  private taobaoPackageName = 'com.taobao.taobao';

  // 状态
  private screenshotPaths: string[] = [];
  private allHashes: string[] = [];
  private actionHistory: any[] = [];
  private widgets: Map<number, TrackedWidget> = new Map();
  private nextWidgetId = 1;
  private currentWidgetId: number | null = null;

  constructor(config?: Partial<WidgetCollectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==================== 主入口 ====================

  start = async (): Promise<void> => {
    clearLogs();
    this.resetState();

    log('=== Widget 智能采集系统启动 ===');
    log('AI Agent 驱动的小部件识别与完整截图采集');

    try {
      // 1. 检查后端
      log('正在检查后端服务...');
      const healthy = await backendClient.checkHealth();
      if (!healthy) {
        log('错误：后端服务不可用，请先启动 Python 后端！');
        return;
      }

      // 2. 启动采集循环
      await Step.run(this.collectionLoop);

      // 3. 输出汇总
      this.printSummary();

      log('=== Widget 智能采集系统结束 ===');
    } catch (error) {
      log('采集任务执行失败：' + error);
    }
  };

  private resetState(): void {
    this.screenshotPaths = [];
    this.allHashes = [];
    this.actionHistory = [];
    this.widgets = new Map();
    this.nextWidgetId = 1;
    this.currentWidgetId = null;
  }

  // ==================== 核心采集循环 ====================

  /**
   * AI Agent 驱动的采集循环
   *
   * 流程：截图 → AI 分析 → 执行动作 → 记录 widget → 循环
   * AI 告诉代码干什么，代码就干什么
   */
  private collectionLoop = async (step: Step): Promise<Step | undefined> => {
    const packageName = step.getPackageName();
    if (packageName !== this.taobaoPackageName) {
      log('检测到当前不在淘宝，请手动切换到目标页面...');
      return step.repeat({ delayMs: 2000 });
    }

    // 获取屏幕尺寸
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;
    log(`屏幕尺寸: ${screenW}x${screenH}`);

    const cropTop = Math.floor(screenH * 0.08);
    const cropBottom = Math.floor(screenH * 0.06);

    let screenshotCount = 0;
    let consecutiveSameHash = 0;
    let lastHash = '';

    // 主循环：AI Agent 驱动
    while (screenshotCount < this.config.maxScreenshots) {
      screenshotCount++;
      log(`\n=== 第 ${screenshotCount} 轮采集 ===`);

      // 1. 截屏
      const imagePath = await AssistsXAsync.takeScreenshotSave();
      if (!imagePath) {
        log('截屏失败，重试...');
        await step.delay(1000);
        continue;
      }
      this.screenshotPaths.push(imagePath);

      // 2. 读取图片转 base64
      const base64 = await fileIO.readFile2BytesByStream(imagePath);
      if (!base64) {
        log('读取图片失败');
        continue;
      }

      // 3. 计算 pHash
      let currentHash = '';
      try {
        currentHash = await computePHash(base64);
        this.allHashes.push(currentHash);
        log(`pHash: ${currentHash}`);

        // 检查与上一帧是否相同（页面没变化）
        if (lastHash && isSimilar(currentHash, lastHash, this.config.hashThreshold)) {
          consecutiveSameHash++;
          log(`连续相同 hash: ${consecutiveSameHash}/${this.config.sameHashLimit}`);
          if (consecutiveSameHash >= this.config.sameHashLimit) {
            log('连续多次相同画面，可能已到底部或卡住');
            // 让 AI 做最终判断
          }
        } else {
          consecutiveSameHash = 0;
        }
        lastHash = currentHash;
      } catch (err) {
        log('pHash 计算失败: ' + err);
      }

      // 4. 记录到当前 widget
      if (this.currentWidgetId) {
        const widget = this.widgets.get(this.currentWidgetId);
        if (widget) {
          widget.screenshotPaths.push(imagePath);
          if (currentHash) widget.hashes.push(currentHash);
        }
      }

      // 5. 调用 Widget Agent 获取下一步操作
      log('正在调用 AI Agent 分析...');
      const widgetsInfo = this.buildWidgetsInfo();
      const agentResult = await backendClient.getWidgetDecision(
        base64,
        this.actionHistory,
        widgetsInfo,
        this.actionHistory.length > 0
          ? this.actionHistory[this.actionHistory.length - 1].page_description || ''
          : '',
      );

      log(`Agent 决策: ${agentResult.action_type} | ${agentResult.reason}`);
      log(`Widget: ${agentResult.widget_type || 'N/A'} - ${agentResult.widget_name || 'N/A'}`);

      // 6. 记录操作历史
      this.actionHistory.push({
        round: screenshotCount,
        action_type: agentResult.action_type,
        widget_type: agentResult.widget_type,
        widget_name: agentResult.widget_name,
        widget_finished: agentResult.widget_finished,
        page_description: agentResult.page_description,
        reason: agentResult.reason,
        hash: currentHash,
      });

      // 7. 更新 widget 信息
      this.updateWidgetTracking(agentResult);

      // 8. 执行 Agent 决策的动作
      const shouldStop = await this.executeAction(agentResult, step, screenW, screenH, cropTop, cropBottom);
      if (shouldStop) {
        log('Agent 判断采集完成');
        break;
      }

      // 9. 连续相同 hash 检查（让 AI 判断后仍卡住则退出）
      if (consecutiveSameHash >= this.config.sameHashLimit) {
        log('连续相同画面确认，结束采集');
        break;
      }

      await step.delay(this.config.actionDelayMs);
    }

    log(`\n采集循环结束，共截取 ${this.screenshotPaths.length} 张截图`);
    return undefined;
  };

  // ==================== Widget 追踪 ====================

  /** 根据 Agent 结果更新 widget 追踪 */
  private updateWidgetTracking(action: AgentAction): void {
    const widgetType = action.widget_type || 'unknown';
    const widgetName = action.widget_name || '未命名小部件';

    if (action.action_type === 'done') {
      // 标记所有 widget 为已完成
      this.widgets.forEach(w => { w.isCaptured = true; });
      this.currentWidgetId = null;
      return;
    }

    // 判断是否进入了新的 widget 区域
    const isNewWidget = this.isNewWidgetArea(action);

    if (isNewWidget || this.currentWidgetId === null) {
      // 创建新 widget
      const id = this.nextWidgetId++;
      const widget: TrackedWidget = {
        id,
        type: widgetType,
        name: widgetName,
        screenshotPaths: [],
        hashes: [],
        isCaptured: false,
      };
      this.widgets.set(id, widget);
      this.currentWidgetId = id;
      log(`新建 Widget #${id}: [${widgetType}] ${widgetName}`);
    } else {
      // 更新当前 widget
      const widget = this.widgets.get(this.currentWidgetId);
      if (widget) {
        widget.type = widgetType;
        widget.name = widgetName;
        if (action.widget_finished) {
          widget.isCaptured = true;
          log(`Widget #${widget.id} [${widget.name}] 采集完成`);
        }
      }
    }
  }

  /** 判断是否进入了新的 widget 区域 */
  private isNewWidgetArea(action: AgentAction): boolean {
    if (!this.currentWidgetId) return true;

    const current = this.widgets.get(this.currentWidgetId);
    if (!current) return true;

    // widget 类型变化 → 新 widget
    if (action.widget_type && action.widget_type !== current.type && action.widget_type !== 'unknown') {
      return true;
    }

    // 当前 widget 已完成 → 新 widget
    if (current.isCaptured) {
      return true;
    }

    // 向下滚动后 widget 名称变化 → 可能是新 widget
    if (action.action_type === 'swipe_down' && action.widget_name && action.widget_name !== current.name) {
      // 但如果名称只是更新了描述，不算新 widget
      if (action.widget_name !== '未命名小部件' && current.name !== '未命名小部件') {
        return true;
      }
    }

    return false;
  }

  /** 构建 widgets 信息列表（发送给后端 AI） */
  private buildWidgetsInfo(): WidgetInfo[] {
    const result: WidgetInfo[] = [];
    this.widgets.forEach(w => {
      result.push({
        widget_type: w.type,
        widget_name: w.name,
        is_captured: w.isCaptured,
        screenshot_count: w.screenshotPaths.length,
      });
    });
    return result;
  }

  // ==================== 动作执行 ====================

  /**
   * 执行 Agent 决策的动作
   * AI 让代码干什么，代码就干什么
   *
   * @returns true 表示应该停止采集
   */
  private async executeAction(
    action: AgentAction,
    step: Step,
    screenW: number,
    screenH: number,
    cropTop: number,
    cropBottom: number,
  ): Promise<boolean> {
    switch (action.action_type) {
      case 'swipe_right':
        await this.performSwipe('right', screenW, screenH);
        log('执行: 向右滑动 (Swiper 下一页)');
        return false;

      case 'swipe_left':
        await this.performSwipe('left', screenW, screenH);
        log('执行: 向左滑动 (Swiper 上一页)');
        return false;

      case 'swipe_down':
        await this.performScrollDown(screenW, screenH, cropTop, cropBottom);
        log('执行: 向下滚动');
        return false;

      case 'click':
        if (action.target_x != null && action.target_y != null) {
          await AssistsXAsync.clickByGesture(action.target_x, action.target_y, 50);
          log(`执行: 点击 (${action.target_x}, ${action.target_y})`);
          await step.delay(2000); // 点击后等待更久
        } else {
          log('Agent 返回 click 但未提供坐标，跳过');
        }
        return false;

      case 'wait':
        log('执行: 等待页面加载...');
        await step.delay(3000);
        return false;

      case 'back':
        log('执行: 返回上一页');
        try {
          await AssistsXAsync.back();
        } catch {
          log('返回键执行失败');
        }
        return false;

      case 'done':
        log('Agent 判断: 所有小部件内容已采集完成');
        return true;

      default:
        log(`未知操作类型: ${action.action_type}，执行默认向下滑动`);
        await this.performScrollDown(screenW, screenH, cropTop, cropBottom);
        return false;
    }
  }

  // ==================== 手势操作 ====================

  /** 向右滑动（Swiper 下一页） */
  private async performSwipe(direction: 'right' | 'left', screenW: number, screenH: number): Promise<void> {
    const margin = 30;
    const centerY = Math.floor(screenH / 2);

    try {
      if (direction === 'right') {
        // 手指从右向左滑 → 展示下一页
        await AssistsXAsync.performLinearGesture(
          { x: screenW - margin, y: centerY },
          { x: margin, y: centerY },
          { duration: 800 },
        );
      } else {
        // 手指从左向右滑 → 展示上一页
        await AssistsXAsync.performLinearGesture(
          { x: margin, y: centerY },
          { x: screenW - margin, y: centerY },
          { duration: 800 },
        );
      }
    } catch (err) {
      log('滑动失败: ' + err);
    }
  }

  /** 向下滚动：起点75% 避开底部导航栏，终点25% 避开顶部状态栏 */
  private async performScrollDown(
    screenW: number,
    screenH: number,
    cropTop: number,
    cropBottom: number,
  ): Promise<void> {
    const centerX = Math.floor(screenW / 2);
    const scrollStartY = Math.floor(screenH * 0.75);
    const scrollEndY = Math.floor(screenH * 0.25);
    log(`滚动坐标: (${centerX}, ${scrollStartY}) → (${centerX}, ${scrollEndY}), screenH=${screenH}`);

    try {
      await AssistsXAsync.performLinearGesture(
        { x: centerX, y: scrollStartY },
        { x: centerX, y: scrollEndY },
        { duration: 1200 },
      );
    } catch (err) {
      log('滚动失败: ' + err);
    }
  }

  // ==================== 汇总输出 ====================

  /** 打印采集汇总 */
  private printSummary(): void {
    log('\n========== 采集汇总 ==========');
    log(`总截图数: ${this.screenshotPaths.length}`);
    log(`识别到 ${this.widgets.size} 个小部件:`);

    this.widgets.forEach((w, id) => {
      const status = w.isCaptured ? '已完成' : '未完成';
      log(`  #${id} [${w.type}] ${w.name} - ${w.screenshotPaths.length} 张截图 - ${status}`);
    });

    log('操作历史:');
    this.actionHistory.forEach((h, i) => {
      log(`  ${i + 1}. ${h.action_type} - ${h.widget_name || ''} - ${h.reason}`);
    });
    log('================================\n');
  }

  // ==================== 图片拼接 ====================

  /**
   * 将指定 widget 的所有截图拼接为长图并保存
   */
  async stitchWidgetImages(widgetId: number, cropTop: number, cropBottom: number): Promise<void> {
    const widget = this.widgets.get(widgetId);
    if (!widget || widget.screenshotPaths.length < 2) {
      log(`Widget #${widgetId} 截图不足，跳过拼接`);
      return;
    }

    log(`开始拼接 Widget #${widgetId} 的 ${widget.screenshotPaths.length} 张截图...`);

    try {
      const stitchedBase64 = await this.stitchImages(widget.screenshotPaths, cropTop, cropBottom);

      const firstPath = widget.screenshotPaths[0];
      const dir = firstPath.substring(0, firstPath.lastIndexOf('/'));
      const savePath = `${dir}/widget_${widgetId}_${widget.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;

      await fileIO.writeFileFromBytesByStream(savePath, stitchedBase64);
      await imageUtils.save2Album(savePath);

      log(`Widget #${widgetId} 长图已保存: ${savePath}`);
    } catch (err) {
      log(`Widget #${widgetId} 拼接失败: ` + err);
    }
  }

  /** 拼接所有 widget 的截图 */
  async stitchAllWidgets(cropTop: number, cropBottom: number): Promise<void> {
    for (const [id] of this.widgets) {
      await this.stitchWidgetImages(id, cropTop, cropBottom);
    }
  }

  /** 将多张全屏截图拼接为长图 */
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

    if (images.length === 0) throw new Error('没有可供拼接的图片');

    const W = images[0].width;
    const H = images[0].height;
    const firstKeep = H - cropBottom;
    const restStart = cropTop;
    const restKeep = H - cropBottom - restStart;
    const totalHeight = firstKeep + Math.max(restKeep, 0) * (images.length - 1);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 Canvas 2D 上下文');

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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  };
}

/** 全局单例 */
export const widgetCollector = new WidgetCollector();
