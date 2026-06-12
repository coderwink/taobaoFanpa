import { Step, AssistsXAsync } from 'assistsx-js';
import { log, clearLogs } from '../logging/app-log';

// ==================== 配置 ====================
const TAOBAO_PACKAGE = 'com.taobao.taobao';

/** 树输出的最大深度 */
const MAX_DEPTH = 12;

/** 只输出有内容的节点（text/des/viewId 非空 或 isScrollable） */
const SKIP_EMPTY = true;

// ==================== 探测任务 ====================

class AccessibilityTreeProbe {
  private nodeCount = 0;
  private scrollableNodes: Array<{ className: string; viewId: string; text: string; childCount: number }> = [];

  start = async (): Promise<void> => {
    clearLogs();
    log('=== 无障碍控件树探测器 ===');
    log('目标: 淘宝会员页');
    log('');

    await Step.run(this.checkApp);
    await Step.run(this.probeTree);
    await Step.run(this.probeSwiperSubtree);
    this.printSummary();
  };

  /** 检查是否在淘宝 */
  private checkApp = async (step: Step): Promise<Step | undefined> => {
    const pkg = step.getPackageName();
    if (pkg !== TAOBAO_PACKAGE) {
      log(`当前不在淘宝 (当前: ${pkg})，请手动打开淘宝会员页后重试`);
      return step.repeat({ delayMs: 3000 });
    }
    log('已检测到淘宝');
    await step.delay(1000);
    return step.next(this.probeTree);
  };

  /** 获取并输出控件树 */
  private probeTree = async (step: Step): Promise<Step | undefined> => {
    log('');
    log('正在读取控件树...');
    log('=====================================');

    this.nodeCount = 0;
    this.scrollableNodes = [];

    // 获取所有节点
    const allNodes = await AssistsXAsync.getAllNodes();
    if (!allNodes || allNodes.length === 0) {
      log('未获取到任何节点，可能需要等待页面加载');
      return step.repeat({ delayMs: 2000 });
    }

    log(`共获取 ${allNodes.length} 个节点`);
    log('');

    // 找到根节点（通常是 FrameLayout 或 DecorView）
    // 找到屏幕范围内最大的根节点
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;

    // 找到包含整个屏幕的根节点
    let rootNode: any = null;
    for (const node of allNodes) {
      const b = node.bounds;
      if (b && b.width >= screenW * 0.9 && b.height >= screenH * 0.9) {
        if (!rootNode || (b.width * b.height > rootNode.bounds.width * rootNode.bounds.height)) {
          rootNode = node;
        }
      }
    }

    if (!rootNode) {
      log('未找到合适的根节点，使用第一个节点');
      rootNode = allNodes[0];
    }

    log(`根节点: ${rootNode.className} (${rootNode.viewId || 'no-id'})`);
    log(`根节点 bounds: ${JSON.stringify(rootNode.bounds?.toJSON?.() || rootNode.bounds)}`);
    log('');
    log('--- 控件树结构 ---');
    log('');

    // 从根节点递归输出
    await this.dumpNode(rootNode, 0, screenW, screenH);

    return undefined;
  };

  /** 递归输出节点树 */
  private async dumpNode(node: any, depth: number, screenW: number, screenH: number, skipEmpty = SKIP_EMPTY): Promise<void> {
    if (depth > MAX_DEPTH) return;

    this.nodeCount++;

    const indent = '  '.repeat(depth);
    const className = node.className || '';
    const shortClass = className.split('.').pop() || className;
    const viewId = node.viewId || '';
    const text = node.text || '';
    const des = node.des || '';
    const isScrollable = node.isScrollable;
    const isClickable = node.isClickable;
    const bounds = node.bounds;

    // 构建节点信息行
    const parts: string[] = [shortClass];

    if (viewId) parts.push(`id:${viewId.split('/').pop()}`);
    if (text) parts.push(`text:"${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
    if (des) parts.push(`des:"${des.substring(0, 30)}${des.length > 30 ? '...' : ''}"`);
    if (isScrollable) parts.push('SCROLLABLE');
    if (isClickable) parts.push('clickable');

    if (bounds) {
      const b = bounds.toJSON ? bounds.toJSON() : bounds;
      parts.push(`[${b.left},${b.top} ${b.right - b.left}x${b.bottom - b.top}]`);
    }

    // 如果是可滚动节点，记录详情
    if (isScrollable) {
      let childCount = 0;
      try {
        const children = await node.async.getChildren();
        childCount = children?.length || 0;
      } catch {
        // 忽略
      }

      this.scrollableNodes.push({
        className: shortClass,
        viewId: viewId.split('/').pop() || '',
        text: text.substring(0, 50),
        childCount,
      });
    }

    // 如果 SKIP_EMPTY 且节点无任何有意义的信息，跳过（但仍递归子节点）
    const hasContent = text || des || viewId || isScrollable || isClickable;
    if (skipEmpty && !hasContent && depth > 1) {
      // 仍需递归子节点以找到有内容的子节点
      try {
        const children = await node.async.getChildren();
        if (children && children.length > 0) {
          for (const child of children) {
            await this.dumpNode(child, depth, screenW, screenH);
          }
        }
      } catch {
        // 忽略
      }
      return;
    }

    log(`${indent}${parts.join(' | ')}`);

    // 递归子节点
    try {
      const children = await node.async.getChildren();
      if (children && children.length > 0) {
        // 如果子节点太多，只展示前 20 个
        const maxShow = 20;
        const showing = children.slice(0, maxShow);
        for (const child of showing) {
          await this.dumpNode(child, depth + 1, screenW, screenH);
        }
        if (children.length > maxShow) {
          log(`${indent}  ... 还有 ${children.length - maxShow} 个子节点被省略`);
        }
      }
    } catch (err) {
      log(`${indent}  [获取子节点失败: ${err}]`);
    }
  }

  /** 深度探测 ViewPager 子树结构 */
  private probeSwiperSubtree = async (step: Step): Promise<Step | undefined> => {
    log('');
    log('=====================================');
    log('=== ViewPager 子树深度探测 ===');

    // 查找 ViewPager
    const vpNodes = step.findByTags('androidx.viewpager.widget.ViewPager');
    if (vpNodes.length === 0) {
      log('未找到 ViewPager');
      return undefined;
    }

    for (let vi = 0; vi < vpNodes.length; vi++) {
      const vp = vpNodes[vi];
      const vpBounds = vp.bounds;
      const b = vpBounds?.toJSON?.() || vpBounds;
      log('');
      log(`ViewPager #${vi} id:${vp.viewId || '(无)'} [${b?.left},${b?.top} ${b?.width}x${b?.height}]`);

      // 获取直接子节点
      try {
        const children = await vp.async.getChildren();
        if (!children || children.length === 0) {
          log('  (无子节点)');
          continue;
        }

        log(`  直接子节点: ${children.length} 个`);
        log('');

        // 逐个深度遍历每个子节点
        for (let ci = 0; ci < children.length; ci++) {
          const child = children[ci];
          const cb = child.bounds?.toJSON?.() || child.bounds;
          log(`  --- 子节点 #${ci} [${child.className?.split('.').pop()}] id:${child.viewId || '(无)'} [${cb?.left},${cb?.top} ${cb?.width}x${cb?.height}] scrollable:${child.isScrollable} ---`);

          // 递归输出此子节点的完整子树（不跳过空节点）
          await this.dumpNode(child, 2, b?.width || 1216, b?.height || 2000, false);
          log('');
        }
      } catch (err) {
        log(`  读取子节点失败: ${err}`);
      }
    }

    return undefined;
  };

  /** 输出汇总 */
  private printSummary(): void {
    log('');
    log('=====================================');
    log('=== 汇总 ===');
    log(`总遍历节点数: ${this.nodeCount}`);
    log('');

    if (this.scrollableNodes.length > 0) {
      log(`找到 ${this.scrollableNodes.length} 个可滚动节点:`);
      this.scrollableNodes.forEach((n, i) => {
        log(`  ${i + 1}. [${n.className}] id:${n.viewId} text:"${n.text}" children:${n.childCount}`);
      });
    } else {
      log('未找到可滚动节点');
    }

    log('');
    log('=== 探测结束 ===');
    log('提示: 将以上输出复制给 AI 分析，确定 swiper 组件在控件树中的特征');
  }
}

export const accessibilityTreeProbe = new AccessibilityTreeProbe();
