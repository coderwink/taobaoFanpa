import { Step, NodeClassValue, AssistsXAsync, fileIO, imageUtils } from 'assistsx-js';
import { log, clearLogs } from '../logging/app-log';
import { backendClient } from './backend-client';
import { computePHash, isSimilar } from './image-hash';

// ==================== 配置 ====================

/** 采集器配置项 */
interface CollectorConfig {
  storeName: string;        // 店铺名称（用户输入）
  maxScreenshots: number;   // 最大截屏次数，防止死循环
  maxSwiperPages: number;   // 单个 Swiper 最大页数
  hashThreshold: number;    // pHash 相似度阈值
  sameHashLimit: number;    // 连续相同 hash 次数认为结束
}

/** 默认配置 */
const DEFAULT_CONFIG: CollectorConfig = {
  storeName: '卡诗官方旗舰店',
  maxScreenshots: 50,
  maxSwiperPages: 20,
  hashThreshold: 10,
  sameHashLimit: 3,
};

// ==================== 主任务类 ====================

class TaobaoMemberCollector {
  private taobaoPackageName = 'com.taobao.taobao';
  private config: CollectorConfig;
  private sessionId: string = '';
  private screenshotPaths: string[] = [];
  private imageHashes: string[] = [];
  private actionHistory: any[] = [];
  private swiperPageHashes: Map<number, string[]> = new Map(); // swiperIndex -> hashes
  private swiperIndex = 0; // 当前 swiper 编号
  private _nextAfterPopup: ((step: Step) => Promise<Step | undefined>) | null = null; // 弹窗清除后的下一步
  private widgets: Array<{ widget_type: string; widget_name: string; is_captured: boolean; screenshot_count: number }> = []; // 已识别的小部件

  constructor(config?: Partial<CollectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 设置店铺名称（从 UI 调用） */
  setStoreName(name: string): void {
    this.config.storeName = name;
  }

  // ==================== 主入口 ====================

  /** 任务启动入口 */
  start = async (): Promise<void> => {
    clearLogs();

    // 重置状态
    this.sessionId = '';
    this.screenshotPaths = [];
    this.imageHashes = [];
    this.actionHistory = [];
    this.swiperPageHashes = new Map();
    this.swiperIndex = 0;
    this.widgets = [];

    // 从 sessionStorage 读取店铺名称
    try {
      const stored = sessionStorage.getItem('memberCollectStoreName');
      if (stored) {
        this.config.storeName = stored;
        sessionStorage.removeItem('memberCollectStoreName');
      }
    } catch {
      // 忽略
    }

    log('=== 淘宝会员页采集系统启动 ===');
    log(`目标店铺: ${this.config.storeName}`);

    try {
      // 1. 检查后端健康状态
      log('正在检查后端服务...');
      const healthy = await backendClient.checkHealth();
      if (!healthy) {
        log('错误：后端服务不可用，请先启动 Python 后端！');
        return;
      }

      // 2. 在后端创建采集会话
      log('正在创建采集会话...');
      try {
        const session = await backendClient.createSession(this.config.storeName);
        this.sessionId = session.session_id;
        log(`会话已创建: ${this.sessionId}`);
      } catch {
        log('创建会话失败，将继续采集但不上传到后端');
        this.sessionId = '';
      }

      // 3. 启动导航流程
      await Step.run(this.launchTaobao);
      log('=== 淘宝会员页采集系统结束 ===');
    } catch (error) {
      log('采集任务执行失败：' + error);
    }
  };

  // ==================== 导航步骤 ====================

  /** 步骤1: 启动淘宝 */
  private launchTaobao = async (step: Step): Promise<Step | undefined> => {
    log('正在启动淘宝...');
    step.launchApp(this.taobaoPackageName);
    // 等待 App 启动
    await step.delay(3000);
    return step.next(this.backToHome);
  };

  /** 步骤2: 回到首页 */
  private backToHome = async (step: Step): Promise<Step | undefined> => {
    log('正在确保进入首页(点击底部最左侧按钮)...');

    await step.delay(1500);

    try {
      const screenSize = await AssistsXAsync.getScreenSize();
      const width = screenSize?.width || screenSize?.screenWidth;
      const height = screenSize?.height || screenSize?.screenHeight;

      if (width && height) {
        // 点击底部导航栏最左侧按钮（X 取 10%，Y 取 96%）
        const clickX = Math.floor(width * 0.1);
        const clickY = Math.floor(height * 0.96);
        log(`执行全局点击: X=${clickX}, Y=${clickY}`);
        await AssistsXAsync.clickByGesture(clickX, clickY, 50);
      } else {
        log('无法获取屏幕尺寸，使用备用坐标点击左下角...');
        await AssistsXAsync.clickByGesture(100, 2200, 50);
      }
    } catch (err) {
      log('点击坐标失败：' + err);
    }

    await step.delay(2000);
    return step.next(this.searchStore);
  };

  /** 步骤3: 搜索店铺 */
  private searchStore = async (step: Step): Promise<Step | undefined> => {
    log('寻找首页顶部的"搜索"按钮...');

    await step.delay(1500);

    const searchBtns = step.findByTextAllMatch('搜索');

    if (searchBtns.length > 0) {
      log('找到"搜索"按钮，计算边界并点击其左侧的搜索框区域...');
      const btn = searchBtns[0];
      const bounds = await AssistsXAsync.getBoundsInScreen(btn);

      if (bounds && bounds.bottom > bounds.top) {
        // 点击按钮左侧（搜索框区域），Y 轴对齐
        const clickX = Math.floor(bounds.left / 2);
        const clickY = Math.floor(bounds.centerY);
        log(`在搜索框中央点击: X=${clickX}, Y=${clickY}`);
        await AssistsXAsync.clickByGesture(clickX, clickY, 50);
      } else {
        log('无法获取按钮边界，尝试盲点顶部区域...');
        const screenSize = await AssistsXAsync.getScreenSize();
        const width = screenSize?.width || screenSize?.screenWidth || 1080;
        await AssistsXAsync.clickByGesture(Math.floor(width / 2), 150, 50);
      }

      await step.delay(3000);

      log(`输入搜索关键词: ${this.config.storeName}`);
      await step.delay(1500);
      const editTexts = step.findByTags('android.widget.EditText');
      if (editTexts.length > 0) {
        const searchInput = editTexts[0];
        // 使用底层无感赋值，避免弹窗
        AssistsXAsync.setNodeText(searchInput, this.config.storeName);
        await step.delay(1000);

        // 直接通过无障碍节点找到"搜索"按钮并点击
        log('通过无障碍节点查找搜索按钮...');
        const searchConfirmBtns = step.findByTextAllMatch('搜索');
        let clicked = false;
        for (const b of searchConfirmBtns) {
          const bnd = await AssistsXAsync.getBoundsInScreen(b);
          if (bnd && bnd.centerX > 0 && bnd.centerY > 0) {
            // 搜索按钮在输入框右侧，取 X 最大的那个
            log(`找到搜索按钮节点，点击: (${Math.floor(bnd.centerX)}, ${Math.floor(bnd.centerY)})`);
            await AssistsXAsync.clickByGesture(Math.floor(bnd.centerX), Math.floor(bnd.centerY), 50);
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          log('未找到可点击的搜索按钮，尝试 IME 搜索...');
        }
      } else {
        log('未找到 EditText，尝试直接在搜索栏输入...');
        const innerSearch = step.findByTextAllMatch('搜索');
        if (innerSearch.length > 0) {
          AssistsXAsync.setNodeText(innerSearch[0], this.config.storeName);
        }
      }
      await step.delay(1000);
      try {
        const { ime } = await import('assistsx-js');
        await ime.performEditorAction(3); // ImeAction.SEARCH
      } catch {
        // 忽略
      }

      // 等待搜索结果加载
      await step.delay(3000);
      return step.next(this.enterStore);
    }

    const retryCount = (step.state.searchRetry || 0) + 1;
    step.state.searchRetry = retryCount;
    if (retryCount > 3) {
      log('多次未找到首页搜索框，可能是页面结构特殊或弹窗遮挡。');
    }

    return step.repeat({ delayMs: 2000 });
  };

  /**
   * 辅助方法：通过获取节点真实的物理边界来模拟物理点击，
   * 专门用于解决无障碍节点本身不可点击的问题
   */
  private async clickNodeByGesture(node: any): Promise<boolean> {
    const bounds = await AssistsXAsync.getBoundsInScreen(node);
    if (bounds && bounds.centerX > 0 && bounds.centerY > 0) {
      await AssistsXAsync.clickByGesture(Math.floor(bounds.centerX), Math.floor(bounds.centerY), 50);
      return true;
    }
    return false;
  }

  /** 步骤4: 进入店铺 */
  private enterStore = async (step: Step): Promise<Step | undefined> => {
    log('等待搜索结果并寻找"进店"按钮...');
    await step.delay(1500);
    const enterBtns = step.findByTextAllMatch('进店');
    if (enterBtns.length > 0) {
      log('找到"进店"按钮，使用物理坐标点击进入...');
      await this.clickNodeByGesture(enterBtns[0]);
      await step.delay(4000); // 进店通常加载内容较多
      // 先处理弹窗，完成后跳转到 openMemberTab
      this._nextAfterPopup = this.openMemberTab;
      return step.next(this.dismissPopups);
    }

    const retryCount = (step.state.enterStoreRetry || 0) + 1;
    step.state.enterStoreRetry = retryCount;
    if (retryCount > 10) {
      log('长时间未找到"进店"按钮，终止任务。');
      return undefined;
    }

    return step.repeat({ delayMs: 2000 });
  };

  // ==================== 弹窗处理 ====================

  /** 淘宝常见弹窗关键词 */
  private readonly POPUP_KEYWORDS = [
    '天降消费券', '优惠券', '立即领取', '立即抢', '马上抢',
    '新人专享', '限时优惠', '满减', '折扣', '红包',
    '去使用', '立即使用', '查看', '知道了', '关闭',
    '以后再说', '暂不需要', '不需要', '跳过', '取消',
    '拒绝', '下次再说', '残忍拒绝',
  ];

  /** 弹窗关闭按钮关键词 */
  private readonly POPUP_CLOSE_KEYWORDS = [
    '关闭', '×', 'X', 'x', '✕', '✖', '拒绝',
    '以后再说', '暂不需要', '不需要', '跳过', '取消',
    '残忍拒绝', '下次再说', '知道了',
  ];

  /** 最大弹窗清除轮数 */
  private readonly MAX_POPUP_DISMISS_ROUNDS = 5;

  /**
   * 步骤4.5: 自动清除弹窗
   * 进店后可能弹出"天降消费券"、"新人优惠"等弹窗，需要先关闭
   */
  private dismissPopups = async (step: Step): Promise<Step | undefined> => {
    log('检查是否有弹窗遮挡...');

    let dismissCount = 0;

    for (let round = 0; round < this.MAX_POPUP_DISMISS_ROUNDS; round++) {
      await step.delay(800);

      // 通过无障碍树查找关闭按钮
      let dismissed = await this.tryCloseByAccessibility(step);
      if (dismissed) {
        dismissCount++;
        log(`弹窗已关闭 (第${dismissCount}个)，等待渲染...`);
        await step.delay(1500);
        continue;
      }

      // 没有检测到弹窗，跳出循环
      break;
    }

    if (dismissCount > 0) {
      log(`共清除了 ${dismissCount} 个弹窗`);
    } else {
      log('未检测到弹窗');
    }

    // 弹窗清除后，跳转到调用者指定的下一步
    if (this._nextAfterPopup) {
      const next = this._nextAfterPopup;
      this._nextAfterPopup = null;
      return step.next(next);
    }
    return step.next(this.openMemberTab);
  };

  /**
   * 通过无障碍树查找并关闭弹窗
   * 只精确匹配关闭按钮文本，不做任何坐标盲点
   */
  private async tryCloseByAccessibility(step: Step): Promise<boolean> {
    try {
      // 先检查是否有弹窗关键词（确认弹窗存在）
      let hasPopup = false;
      for (const keyword of this.POPUP_KEYWORDS) {
        const nodes = step.findByTextAllMatch(keyword);
        if (nodes.length > 0) {
          hasPopup = true;
          log(`检测到弹窗关键词: "${keyword}"`);
          break;
        }
      }

      if (!hasPopup) return false;

      // 只通过文本精确匹配关闭按钮，点击第一个匹配的
      for (const closeKeyword of this.POPUP_CLOSE_KEYWORDS) {
        const closeNodes = step.findByTextAllMatch(closeKeyword);
        if (closeNodes.length > 0) {
          log(`找到关闭按钮: "${closeKeyword}"，点击关闭...`);
          await this.clickNodeByGesture(closeNodes[0]);
          return true;
        }
      }

      // 没有找到关闭按钮文本，不盲目点击，返回 false
      log('检测到弹窗但未找到关闭按钮文本，跳过');
      return false;
    } catch (err) {
      log('弹窗检测失败: ' + err);
      return false;
    }
  }

  /** 步骤5: 打开会员 Tab */
  private openMemberTab = async (step: Step): Promise<Step | undefined> => {
    log('寻找店铺"会员"Tab...');
    await step.delay(1500);
    const memberTabs = step.findByTextAllMatch('会员');
    if (memberTabs.length > 0) {
      log('使用物理坐标点击会员 Tab...');
      await this.clickNodeByGesture(memberTabs[memberTabs.length - 1]);
      await step.delay(3000); // 等待会员页加载
      return step.next(this.checkAndJoinMember);
    }

    const retryCount = (step.state.memberTabRetry || 0) + 1;
    step.state.memberTabRetry = retryCount;
    if (retryCount > 5) {
      log('多次未找到"会员"Tab，直接尝试进行下一步采集...');
      this._nextAfterPopup = this.startCollectionLoop;
      return step.next(this.dismissPopups);
    }

    return step.repeat({ delayMs: 2000 });
  };

  /** 步骤6: 检查并加入会员 */
  private checkAndJoinMember = async (step: Step): Promise<Step | undefined> => {
    log('检查是否需要加入会员...');

    await step.delay(1500);

    const joinNodes = [
      ...step.findByTextAllMatch('立即加入会员'),
      ...step.findByTextAllMatch('0元入会'),
      ...step.findByTextAllMatch('加入会员'),
    ];

    if (joinNodes.length > 0) {
      log('发现入会按钮，使用物理坐标点击入会...');
      await this.clickNodeByGesture(joinNodes[0]);
      await step.delay(2000);

      log('尝试勾选同意协议...');
      await step.delay(1500);
      const agreeNodes = step.findByTextAllMatch('同意');
      if (agreeNodes.length > 0) {
        await this.clickNodeByGesture(agreeNodes[0]);
      } else {
        const readNodes = step.findByTextAllMatch('我已阅读');
        if (readNodes.length > 0) await this.clickNodeByGesture(readNodes[0]);
      }
      await step.delay(1000);

      log('尝试使用物理坐标点击确认授权开通...');
      await step.delay(1500);
      const confirmNodes = [
        ...step.findByTextAllMatch('开通平台会员'),
        ...step.findByTextAllMatch('确认授权'),
        ...step.findByTextAllMatch('授权并开通'),
        ...step.findByTextAllMatch('确认'),
      ];

      if (confirmNodes.length > 0) {
        await this.clickNodeByGesture(confirmNodes[confirmNodes.length - 1]);
      }

      log('入会操作完成，等待页面刷新...');
      await step.delay(4000);
    } else {
      log('未检测到加入会员按钮，假设已经是会员。');
    }

    // 开始采集前，清除会员页可能存在的悬浮窗
    this._nextAfterPopup = this.startCollectionLoop;
    return step.next(this.dismissPopups);
  };

  // ==================== 采集循环 ====================

  /** 步骤7: 启动 AI 驱动的采集循环 */
  private startCollectionLoop = async (step: Step): Promise<Step | undefined> => {
    const packageName = step.getPackageName();
    if (packageName !== this.taobaoPackageName) {
      log('检测到当前不在淘宝，请手动切换到目标页面...');
      return step.repeat({ delayMs: 2000 });
    }

    log('开始 AI 驱动的采集循环...');

    // 获取屏幕尺寸
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;
    log(`屏幕尺寸: ${screenW}x${screenH}`);

    // 计算裁剪区域
    const cropTop = Math.floor(screenH * 0.08);
    const cropBottom = Math.floor(screenH * 0.06);

    let screenshotCount = 0;
    let consecutiveSameHash = 0;
    let lastHash = '';

    // 主循环
    while (screenshotCount < this.config.maxScreenshots) {
      screenshotCount++;
      log(`--- 第 ${screenshotCount} 轮采集 ---`);

      // 1. 截屏
      const imagePath = await AssistsXAsync.takeScreenshotSave();
      if (!imagePath) {
        log('截屏失败，重试...');
        await step.delay(1000);
        continue;
      }
      log(`截图已保存: ${imagePath}`);
      this.screenshotPaths.push(imagePath);

      // 2. 读取图片转 base64
      const base64 = await fileIO.readFile2BytesByStream(imagePath);
      if (!base64) {
        log('读取图片失败');
        continue;
      }

      // 3. 计算 pHash 并检查重复
      let currentHash = '';
      try {
        currentHash = await computePHash(base64);
        this.imageHashes.push(currentHash);
        log(`pHash: ${currentHash}`);

        // 检查与上一帧是否相同
        if (lastHash && isSimilar(currentHash, lastHash, this.config.hashThreshold)) {
          consecutiveSameHash++;
          log(`连续相同 hash: ${consecutiveSameHash}/${this.config.sameHashLimit}`);
          if (consecutiveSameHash >= this.config.sameHashLimit) {
            log('连续多次相同画面，可能已到底部，结束采集');
            break;
          }
        } else {
          consecutiveSameHash = 0;
        }
        lastHash = currentHash;
      } catch (err) {
        log('pHash 计算失败: ' + err);
      }

      // 4. 上传截图到后端会话
      if (this.sessionId) {
        try {
          await backendClient.uploadScreenshot(this.sessionId, base64);
        } catch {
          log('上传截图到会话失败，继续采集');
        }
      }

      // 5. 调用 Widget Agent 分析截图（识别小部件类型 + 决策下一步动作）
      log('正在调用 Widget Agent 分析...');
      const agentResult = await backendClient.getWidgetDecision(
        base64,
        this.actionHistory,
        this.widgets,
        this.actionHistory.length > 0
          ? this.actionHistory[this.actionHistory.length - 1].page_description || ''
          : '',
      );
      log(`Agent 决策: ${agentResult.action_type} | ${agentResult.reason}`);
      log(`Widget: ${agentResult.widget_type || 'N/A'} - ${agentResult.widget_name || 'N/A'}`);

      // 记录操作历史
      this.actionHistory.push({
        round: screenshotCount,
        hash: currentHash,
        action_type: agentResult.action_type,
        widget_type: agentResult.widget_type,
        widget_name: agentResult.widget_name,
        widget_finished: agentResult.widget_finished,
        page_description: agentResult.page_description,
        reason: agentResult.reason,
        timestamp: Date.now(),
      });

      // 更新 widgets 列表
      if (agentResult.widget_type && agentResult.widget_type !== 'unknown') {
        const existing = this.widgets.find(w => w.widget_type === agentResult.widget_type && !w.is_captured);
        if (existing) {
          existing.screenshot_count++;
          if (agentResult.widget_finished) existing.is_captured = true;
        } else {
          this.widgets.push({
            widget_type: agentResult.widget_type,
            widget_name: agentResult.widget_name || '未命名',
            is_captured: agentResult.widget_finished || false,
            screenshot_count: 1,
          });
          log(`新识别 Widget: [${agentResult.widget_type}] ${agentResult.widget_name}`);
        }
      }

      // 6. 同时调用 OCR 提取文字（不阻塞主流程）
      this.extractOCRAsync(base64, screenshotCount);

      // 7. 根据 Agent 决策执行动作
      // 核心原则：滚动是默认行为，AI 只在特殊情况下介入
      if (agentResult.action_type === 'done') {
        log('Agent 判断: 所有内容已采集完成');
        break;
      } else if (agentResult.action_type === 'swipe_right') {
        // Agent 检测到 Swiper → 进入遍历模式，遍历完后继续向下滚动
        log('Agent 检测到 Swiper，进入遍历模式...');
        this.swiperIndex++;
        await this.traverseSwiper(step, screenW, screenH, cropTop, cropBottom, currentHash);
        log('Swiper 遍历完成，继续向下滚动...');
      } else if (agentResult.action_type === 'click' && agentResult.target_x != null && agentResult.target_y != null) {
        // Agent 要求点击某个元素
        await AssistsXAsync.clickByGesture(agentResult.target_x, agentResult.target_y, 50);
        log(`Agent 点击: (${agentResult.target_x}, ${agentResult.target_y})`);
        await step.delay(2000);
      } else if (agentResult.action_type === 'wait' && agentResult.confidence > 0.5) {
        // AI 高置信度认为需要等待（如加载中）
        log('AI 高置信度等待，暂不滚动');
        await step.delay(3000);
      }
      // 其他所有情况（wait低置信度/swipe_left/swipe_down/无效响应）→ 默认向下滚动
      // 保证页面一定会滚动，不会卡住

      // 始终向下滚动（除非是 done 或高置信度 wait）
      if (agentResult.action_type !== 'done' &&
          !(agentResult.action_type === 'wait' && agentResult.confidence > 0.5)) {
        await this.performSwipe('down', screenW, screenH, cropTop, cropBottom);
      }

      await step.delay(1500); // 等待页面渲染
    }

    log(`采集循环结束，共截取 ${this.screenshotPaths.length} 张截图`);

    // 输出识别到的小部件汇总
    if (this.widgets.length > 0) {
      log(`识别到 ${this.widgets.length} 个小部件:`);
      this.widgets.forEach((w, i) => {
        const status = w.is_captured ? '已完成' : '未完成';
        log(`  #${i + 1} [${w.widget_type}] ${w.widget_name} - ${w.screenshot_count}张 - ${status}`);
      });
    } else {
      log('未识别到特殊小部件');
    }

    // 拼接所有截图为长图
    if (this.screenshotPaths.length > 1) {
      await this.stitchAndSaveImages(cropTop, cropBottom);
    }

    // 获取会话结果
    if (this.sessionId) {
      try {
        const result = await backendClient.getSessionResult(this.sessionId);
        log(`会话采集结果: ${JSON.stringify(result)}`);
      } catch {
        log('获取会话结果失败');
      }
    }

    log('采集任务完成！');
    return undefined;
  };

  // ==================== Swiper 遍历 ====================

  /**
   * Swiper 遍历模式
   * 检测到 Swiper 后，持续向右滑动直到：
   * 1. pHash 与当前 Swiper 中已有的某个 hash 匹配（循环回来了）
   * 2. 连续 N 次相同 hash（卡住了）
   * 3. 达到最大页数限制
   */
  private async traverseSwiper(
    step: Step,
    screenW: number,
    screenH: number,
    cropTop: number,
    cropBottom: number,
    firstHash: string,
  ): Promise<void> {
    const swiperHashes: string[] = [firstHash];
    this.swiperPageHashes.set(this.swiperIndex, swiperHashes);

    let pageCount = 0;
    let consecutiveSame = 0;
    let prevHash = firstHash;

    log(`=== Swiper #${this.swiperIndex} 遍历开始 ===`);

    while (pageCount < this.config.maxSwiperPages) {
      pageCount++;

      // 向右滑动（手指从右向左）
      await this.performSwipe('right', screenW, screenH, cropTop, cropBottom);
      await step.delay(1500);

      // 截屏
      const imagePath = await AssistsXAsync.takeScreenshotSave();
      if (!imagePath) {
        log('Swiper 截屏失败');
        continue;
      }
      this.screenshotPaths.push(imagePath);

      // 读取图片
      const base64 = await fileIO.readFile2BytesByStream(imagePath);
      if (!base64) {
        log('Swiper 图片读取失败');
        continue;
      }

      // 计算 pHash
      let currentHash = '';
      try {
        currentHash = await computePHash(base64);
        log(`Swiper #${this.swiperIndex} 第${pageCount}页 pHash: ${currentHash}`);
      } catch (err) {
        log('Swiper pHash 计算失败: ' + err);
        continue;
      }

      // 上传截图到会话
      if (this.sessionId) {
        try {
          await backendClient.uploadScreenshot(this.sessionId, base64);
        } catch {
          // 忽略上传失败
        }
      }

      // 检查是否与当前 Swiper 中已有的 hash 匹配（循环检测）
      const duplicateFound = swiperHashes.some(h => isSimilar(currentHash, h, this.config.hashThreshold));
      if (duplicateFound) {
        log(`Swiper #${this.swiperIndex} 检测到重复页面，遍历完成（共 ${pageCount} 页）`);
        break;
      }

      // 检查连续相同 hash
      if (isSimilar(currentHash, prevHash, this.config.hashThreshold)) {
        consecutiveSame++;
        if (consecutiveSame >= this.config.sameHashLimit) {
          log(`Swiper #${this.swiperIndex} 连续${consecutiveSame}次相同画面，遍历结束`);
          break;
        }
      } else {
        consecutiveSame = 0;
      }

      swiperHashes.push(currentHash);
      prevHash = currentHash;

      // 同时做 OCR 提取
      this.extractOCRAsync(base64, -pageCount); // 负数标记为 Swiper 内的页
    }

    log(`=== Swiper #${this.swiperIndex} 遍历结束，共 ${swiperHashes.length} 页 ===`);
  }

  // ==================== 手势操作 ====================

  /**
   * 执行滑动手势
   * - 'right': 向右滑（手指从右向左，用于翻到下一个 Swiper 页）
   * - 'left': 向左滑（手指从左向右，用于翻到上一个 Swiper 页）
   * - 'down': 向下滚动（手指从下向上）
   */
  private async performSwipe(
    direction: 'right' | 'left' | 'down',
    screenW: number,
    screenH: number,
    cropTop: number,
    cropBottom: number,
  ): Promise<void> {
    const centerY = Math.floor(screenH / 2);
    const centerX = Math.floor(screenW / 2);

    try {
      switch (direction) {
        case 'right':
          // 向右滑动：手指从右往左滑，展示下一页
          await AssistsXAsync.performLinearGesture(
            { x: screenW - 30, y: centerY },
            { x: 30, y: centerY },
            { duration: 800 },
          );
          log('已向右滑动');
          break;

        case 'left':
          // 向左滑动：手指从左往右滑
          await AssistsXAsync.performLinearGesture(
            { x: 30, y: centerY },
            { x: screenW - 30, y: centerY },
            { duration: 800 },
          );
          log('已向左滑动');
          break;

        case 'down':
        default: {
          // 向下滚动：手指从下往上滑
          // 起点避开底部导航栏（约占屏幕6%），终点避开顶部状态栏（约占8%）
          const scrollStartY = Math.floor(screenH * 0.75);
          const scrollEndY = Math.floor(screenH * 0.25);
          log(`滚动坐标: (${centerX}, ${scrollStartY}) → (${centerX}, ${scrollEndY}), screenH=${screenH}`);
          await AssistsXAsync.performLinearGesture(
            { x: centerX, y: scrollStartY },
            { x: centerX, y: scrollEndY },
            { duration: 1200 },
          );
          log('已向下滑动');
          break;
        }
      }
    } catch (err) {
      log('滑动失败: ' + err);
    }
  }

  // ==================== OCR 异步提取 ====================

  /** 异步调用 OCR，不阻塞主流程 */
  private extractOCRAsync(base64: string, roundIndex: number): void {
    backendClient.extractOCR(base64).then(result => {
      if (result.raw_texts.length > 0) {
        log(`OCR [第${roundIndex}屏] 提取到 ${result.raw_texts.length} 条文本`);
      }
    }).catch(() => {
      // OCR 失败不影响主流程
    });
  }

  // ==================== 图片拼接 ====================

  /**
   * 将所有截图拼接为长图并保存到相册
   * 复用 taobao-long-screenshot.ts 的拼接逻辑
   */
  private async stitchAndSaveImages(cropTop: number, cropBottom: number): Promise<void> {
    log(`开始拼接 ${this.screenshotPaths.length} 张截图...`);

    try {
      const stitchedBase64 = await this.stitchImages(this.screenshotPaths, cropTop, cropBottom);

      const firstPath = this.screenshotPaths[0];
      const dir = firstPath.substring(0, firstPath.lastIndexOf('/'));
      const savePath = `${dir}/member_collect_${Date.now()}.jpg`;

      await fileIO.writeFileFromBytesByStream(savePath, stitchedBase64);
      await imageUtils.save2Album(savePath);

      log('长图拼接完成！已保存到系统相册。');
    } catch (err) {
      log('长图拼接失败：' + err);
    }
  }

  /**
   * 将多张全屏截图拼接为长图。
   * 第1张：保留 [0, H - cropBottom]（含顶部导航，去底部 TabBar）
   * 第2张起：跳过 cropTop + overlap 像素（导航栏 + 重叠），保留到 H - cropBottom
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

    if (images.length === 0) throw new Error('没有可供拼接的图片');

    const W = images[0].width;
    const H = images[0].height;

    // 重叠量
    const overlap = 0;

    // 第一张保留高度（含顶部导航，去底部 TabBar）
    const firstKeep = H - cropBottom;
    // 后续每张：跳过导航栏 + 重叠部分，保留到 TabBar 之前
    const restStart = cropTop + overlap;
    const restKeep = H - cropBottom - restStart;
    const totalHeight = firstKeep + Math.max(restKeep, 0) * (images.length - 1);

    log(`拼接: W=${W}, H=${H}, overlap=${overlap}, firstKeep=${firstKeep}, restStart=${restStart}, restKeep=${restKeep}, total=${totalHeight}`);

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

    log('Canvas 绘制完成，导出 JPEG...');
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  };

  // ==================== 辅助方法 ====================

  /**
   * 查找页面中最大的可滚动内容区域节点
   */
  private findContentNode(step: Step): any | null {
    const candidates = [
      ...step.findByTags('androidx.recyclerview.widget.RecyclerView'),
      ...step.findByTags(NodeClassValue.ScrollView),
      ...step.findByTags('android.widget.ListView'),
      ...step.findByTags('android.webkit.WebView'),
    ];

    if (candidates.length > 0) {
      let best = candidates[0];
      let bestArea = best.bounds.width * best.bounds.height;
      for (let i = 1; i < candidates.length; i++) {
        const area = candidates[i].bounds.width * candidates[i].bounds.height;
        if (area > bestArea) {
          best = candidates[i];
          bestArea = area;
        }
      }
      return best;
    }
    return null;
  }
}

/** 全局单例 */
export const taobaoMemberCollector = new TaobaoMemberCollector();
