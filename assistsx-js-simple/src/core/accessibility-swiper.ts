import { Step, AssistsXAsync } from 'assistsx-js';
import { log, clearLogs } from '../logging/app-log';

// ==================== 配置 ====================

interface SwiperProbeConfig {
  /** 最大 swiper 遍历页数，防止死循环 */
  maxPages: number;
  /** 连续相同内容阈值，超过则认为遍历结束 */
  sameContentLimit: number;
  /** 每次操作后等待时间 (ms) */
  actionDelayMs: number;
  /** 最大向下滚动次数 */
  maxScrollDown: number;
}

const DEFAULT_CONFIG: SwiperProbeConfig = {
  maxPages: 30,
  sameContentLimit: 3,
  actionDelayMs: 1200,
  maxScrollDown: 40,
};

// ==================== 数据结构 ====================

/** 识别到的 swiper 信息 */
interface SwiperInfo {
  index: number;
  className: string;
  viewId: string;
  bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  childCount: number;
  isHorizontal: boolean;
  pages: SwiperPage[];
}

/** swiper 的一页内容 */
interface SwiperPage {
  pageIndex: number;
  contentHash: string;
  texts: string[];
  rawContent: string;
}

// ==================== 内容指纹 ====================

/** 从节点子树中提取文本指纹（不依赖截图） */
async function extractContentFingerprint(node: any): Promise<{ texts: string[]; hash: string; childCount: number }> {
  const texts: string[] = [];
  let childCount = 0;

  try {
    // 获取直接子节点的文本
    const children = await node.async.getChildren();
    if (children) {
      childCount = children.length;
      for (const child of children) {
        collectTexts(child, texts, 0);
      }
    }
  } catch {
    // 忽略
  }

  // 生成简单 hash：将所有文本拼接后取 hash
  const raw = texts.join('|||');
  const hash = simpleHash(raw);
  return { texts, hash, childCount };
}

/** 递归收集节点及其子节点的文本（限制深度） */
function collectTexts(node: any, texts: string[], depth: number): void {
  if (depth > 4) return; // 限制深度，避免过深遍历

  const t = node.text;
  if (t && t.trim()) {
    texts.push(t.trim());
  }

  const des = node.des;
  if (des && des.trim()) {
    texts.push(`[des:${des.trim()}]`);
  }

  // 同步访问子节点（通过 getChildren 的同步版本）
  try {
    const children = node.getChildren?.() || [];
    for (const child of children) {
      collectTexts(child, texts, depth + 1);
    }
  } catch {
    // 忽略同步访问失败
  }
}

/** 简单字符串 hash（djb2） */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ==================== Swiper 检测 ====================

/**
 * 在控件树中查找 swiper 组件
 *
 * 淘宝会员页中 swiper 的典型特征：
 * 1. 水平可滚动容器（width > height 且 isScrollable）
 * 2. 类名包含 ViewPager / HorizontalScrollView / RecyclerView
 * 3. 有多个子节点（每个子节点是一页）
 */
async function findSwipers(step: Step, screenW: number, screenH: number): Promise<SwiperInfo[]> {
  const swipers: SwiperInfo[] = [];
  let swiperIndex = 0;

  // 策略1: 查找特定的 ViewPager 类
  const viewPagerClasses = [
    'androidx.viewpager.widget.ViewPager',
    'android.view.ViewPager',
    'android.widget.HorizontalScrollView',
  ];

  for (const cls of viewPagerClasses) {
    const nodes = step.findByTags(cls);
    for (const node of nodes) {
      const info = await classifySwiperCandidate(node, screenW, screenH, swiperIndex);
      if (info) {
        swipers.push(info);
        swiperIndex++;
      }
    }
  }

  // 策略1b: 直接通过已知 viewId 查找淘宝 swiper
  // 探测发现淘宝会员页 swiper 的 id 为 new_shop_view_view_pager
  const knownSwiperIds = [
    'com.taobao.taobao:id/new_shop_view_view_pager',
    'new_shop_view_view_pager',
  ];
  for (const id of knownSwiperIds) {
    const nodes = step.findById(id);
    for (const node of nodes) {
      const alreadyFound = swipers.some(s => s.viewId === id || s.viewId === node.viewId);
      if (alreadyFound) continue;
      const info = await classifySwiperCandidate(node, screenW, screenH, swiperIndex);
      if (info) {
        swipers.push(info);
        swiperIndex++;
      }
    }
  }

  // 策略2: 查找 RecyclerView 并检查是否水平滚动
  const rvNodes = step.findByTags('androidx.recyclerview.widget.RecyclerView');
  for (const node of rvNodes) {
    // 排除已经找到的
    const alreadyFound = swipers.some(s =>
      s.viewId && node.viewId && s.viewId === node.viewId,
    );
    if (alreadyFound) continue;

    const info = await classifySwiperCandidate(node, screenW, screenH, swiperIndex, true);
    if (info) {
      swipers.push(info);
      swiperIndex++;
    }
  }

  // 策略3: 查找所有 isScrollable 节点，检查是否有水平方向的
  // （某些自定义 View 可能不使用标准类名）
  const allScrollable = step.findByTags('android.widget.ScrollView');
  for (const node of allScrollable) {
    const alreadyFound = swipers.some(s =>
      s.viewId && node.viewId && s.viewId === node.viewId,
    );
    if (alreadyFound) continue;

    const info = await classifySwiperCandidate(node, screenW, screenH, swiperIndex);
    if (info) {
      swipers.push(info);
      swiperIndex++;
    }
  }

  return swipers;
}

/**
 * 判断一个可滚动节点是否是 swiper（水平方向的轮播）
 */
async function classifySwiperCandidate(
  node: any,
  screenW: number,
  screenH: number,
  index: number,
  requireHorizontalCheck = false,
): Promise<SwiperInfo | null> {
  try {
    const bounds = await AssistsXAsync.getBoundsInScreen(node);
    if (!bounds) return null;

    const b = bounds.toJSON ? bounds.toJSON() : bounds;

    // 必须是可滚动的
    if (!node.isScrollable) return null;

    // 必须在屏幕内
    if (b.width < 100 || b.height < 100) return null;

    // 判断是否水平方向：宽度 > 高度 或 在屏幕宽度的较大比例
    const isHorizontal = b.width > b.height * 1.2 || b.width > screenW * 0.7;

    if (requireHorizontalCheck && !isHorizontal) return null;

    // 获取子节点数量
    let childCount = 0;
    try {
      const children = await node.async.getChildren();
      childCount = children?.length || 0;
    } catch {
      // 忽略
    }

    // swiper 至少有 2 个子节点
    if (childCount < 2) return null;

    // 获取子节点内容指纹
    const pages: SwiperPage[] = [];
    try {
      const children = await node.async.getChildren();
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const { texts, hash } = await extractContentFingerprint(children[i]);
          pages.push({
            pageIndex: i,
            contentHash: hash,
            texts,
            rawContent: texts.join(' '),
          });
        }
      }
    } catch {
      // 忽略
    }

    const className = node.className || '';
    const shortClass = className.split('.').pop() || className;

    return {
      index,
      className: shortClass,
      viewId: node.viewId || '',
      bounds: b,
      childCount,
      isHorizontal,
      pages,
    };
  } catch {
    return null;
  }
}

// ==================== 主任务 ====================

class AccessibilitySwiperTask {
  private config = DEFAULT_CONFIG;

  start = async (): Promise<void> => {
    clearLogs();
    log('=== 控件树 Swiper 探测与遍历 ===');
    log('不依赖 AI 视觉，纯无障碍树分析');
    log('');

    await Step.run(this.run);
    log('=== 任务结束 ===');
  };

  private run = async (step: Step): Promise<Step | undefined> => {
    // 检查是否在淘宝
    const pkg = step.getPackageName();
    if (pkg !== 'com.taobao.taobao') {
      log('当前不在淘宝，请手动打开淘宝会员页');
      return step.repeat({ delayMs: 3000 });
    }

    // 获取屏幕尺寸
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;
    log(`屏幕: ${screenW}x${screenH}`);

    // 步骤1: 探测 swiper
    log('');
    log('--- 步骤1: 探测 Swiper 组件 ---');
    const swipers = await findSwipers(step, screenW, screenH);

    if (swipers.length === 0) {
      log('当前页面未检测到 Swiper 组件');
      log('尝试向下滚动查找...');
      return step.next(this.scrollAndProbe);
    }

    log(`检测到 ${swipers.length} 个 Swiper 组件:`);
    swipers.forEach(s => {
      log(`  #${s.index} [${s.className}] id:${s.viewId}`);
      log(`    位置: (${s.bounds.left}, ${s.bounds.top}) ${s.bounds.width}x${s.bounds.height}`);
      log(`    水平: ${s.isHorizontal}, 子节点: ${s.childCount}`);
      log(`    页面内容:`);
      s.pages.forEach(p => {
        log(`      第${p.pageIndex}页 [${p.contentHash}]: ${p.rawContent.substring(0, 80)}`);
      });
    });

    // 步骤2: 遍历每个 swiper
    log('');
    log('--- 步骤2: 遍历 Swiper 内容 ---');

    for (const swiper of swipers) {
      await this.traverseSwiper(swiper, step, screenW, screenH);
    }

    log('');
    log('--- 所有 Swiper 遍历完成 ---');
    return undefined;
  };

  /** 向下滚动后重新探测 */
  private scrollAndProbe = async (step: Step): Promise<Step | undefined> => {
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;

    const state = (step.data || {}) as any;
    state.scrollDownCount = (state.scrollDownCount || 0) + 1;
    step.data = state;

    if (state.scrollDownCount > this.config.maxScrollDown) {
      log('向下滚动次数过多，结束');
      return undefined;
    }

    log(`向下滚动 (${state.scrollDownCount}/${this.config.maxScrollDown})`);

    const centerX = Math.floor(screenW / 2);
    const startY = Math.floor(screenH * 0.75);
    const endY = Math.floor(screenH * 0.25);

    await AssistsXAsync.performLinearGesture(
      { x: centerX, y: startY },
      { x: centerX, y: endY },
      { duration: 1000 },
    );

    await step.delay(this.config.actionDelayMs);

    // 重新探测
    const swipers = await findSwipers(step, screenW, screenH);
    if (swipers.length > 0) {
      log(`滚动后检测到 ${swipers.length} 个 Swiper`);
      for (const swiper of swipers) {
        await this.traverseSwiper(swiper, step, screenW, screenH);
      }
      return undefined;
    }

    return step.repeat({ delayMs: 500 });
  };

  /**
   * 遍历单个 swiper
   *
   * 策略：
   * 1. 每次滑动前重新获取 swiper 节点和当前位置
   * 2. 确认 swiper 在屏幕内再滑
   * 3. 已知有 N 个子节点，翻 N-1 次遍历所有页
   */
  private async traverseSwiper(
    swiper: SwiperInfo,
    step: Step,
    screenW: number,
    screenH: number,
  ): Promise<void> {
    log('');
    log(`=== 遍历 Swiper #${swiper.index} [${swiper.className}] ===`);
    log(`viewId: ${swiper.viewId}, 子节点数: ${swiper.childCount}`);

    const totalPages = swiper.childCount;
    if (totalPages <= 1) {
      log('只有 1 页或 0 页，无需遍历');
      return;
    }

    log(`共 ${totalPages} 页，第 1 页已在屏幕上`);

    // 翻页遍历：翻 totalPages - 1 次
    const scrollsNeeded = totalPages - 1;

    for (let i = 0; i < scrollsNeeded; i++) {
      log('');
      log(`--- 翻到第 ${i + 2} / ${totalPages} 页 ---`);

      // 每次滑动前重新获取 swiper 节点的实时位置
      const node = await this.refreshNode(swiper, step);
      if (!node) {
        log('swiper 节点丢失，尝试全屏滑动');
        await AssistsXAsync.performLinearGesture(
          { x: screenW - 30, y: Math.floor(screenH / 2) },
          { x: 30, y: Math.floor(screenH / 2) },
          { duration: 800 },
        );
        await step.delay(this.config.actionDelayMs);
        continue;
      }

      // 获取实时 bounds
      const bounds = await AssistsXAsync.getBoundsInScreen(node);
      if (!bounds) {
        log('无法获取 swiper 位置，跳过');
        continue;
      }
      const b = bounds.toJSON ? bounds.toJSON() : bounds;

      // 检查 swiper 是否在屏幕内
      const isInScreen = b.bottom > 0 && b.top < screenH && b.width > 100;
      if (!isInScreen) {
        log(`swiper 不在屏幕内 (top=${b.top}, bottom=${b.bottom})，先向下滚动`);
        // 先向下滚动让它出现
        await AssistsXAsync.performLinearGesture(
          { x: Math.floor(screenW / 2), y: Math.floor(screenH * 0.7) },
          { x: Math.floor(screenW / 2), y: Math.floor(screenH * 0.3) },
          { duration: 1000 },
        );
        await step.delay(this.config.actionDelayMs);
        // 重新获取
        const node2 = await this.refreshNode(swiper, step);
        if (!node2) continue;
        const bounds2 = await AssistsXAsync.getBoundsInScreen(node2);
        if (!bounds2) continue;
        const b2 = bounds2.toJSON ? bounds2.toJSON() : bounds2;
        this.logAndSwipe(b2, screenW);
      } else {
        this.logAndSwipe(b, screenW);
      }

      await step.delay(this.config.actionDelayMs);
    }

    // 输出汇总
    log('');
    log(`Swiper #${swiper.index} 遍历完成`);
    log(`共 ${totalPages} 页，已全部翻阅`);
  }

  /** 计算坐标并执行滑动 */
  private async logAndSwipe(b: any, screenW: number): Promise<void> {
    const swiperCenterY = Math.floor((b.top + b.bottom) / 2);
    const margin = Math.floor(b.width * 0.15);
    const startX = b.right - margin;
    const endX = b.left + margin;

    log(`swiper 位置: [${b.left},${b.top} ${b.width}x${b.height}], 中心Y=${swiperCenterY}`);
    log(`滑动: X ${startX} → ${endX}, Y=${swiperCenterY}, 距离=${startX - endX}px`);

    // 快速轻扫（300ms）
    const result = await AssistsXAsync.performLinearGesture(
      { x: startX, y: swiperCenterY },
      { x: endX, y: swiperCenterY },
      { duration: 300 },
    );
    log(`手势执行结果: ${JSON.stringify(result)}`);
  }

  /** 重新获取 swiper 节点 */
  private async refreshNode(swiper: SwiperInfo, step: Step): Promise<any> {
    if (swiper.viewId) {
      const nodes = step.findById(swiper.viewId);
      if (nodes.length > 0) return nodes[0];
    }
    const cls = swiper.className === 'ViewPager'
      ? 'androidx.viewpager.widget.ViewPager'
      : swiper.className === 'HorizontalScrollView'
        ? 'android.widget.HorizontalScrollView'
        : 'androidx.recyclerview.widget.RecyclerView';
    const nodes = step.findByTags(cls);
    for (const n of nodes) {
      const b = await AssistsXAsync.getBoundsInScreen(n);
      if (b) {
        const bj = b.toJSON ? b.toJSON() : b;
        if (Math.abs(bj.left - swiper.bounds.left) < 20 &&
            Math.abs(bj.top - swiper.bounds.top) < 20) {
          return n;
        }
      }
    }
    return null;
  }
}

export const accessibilitySwiperTask = new AccessibilitySwiperTask();
