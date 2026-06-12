import { Step, AssistsXAsync, fileIO } from 'assistsx-js';
import { log, clearLogs } from '../logging/app-log';

// ==================== 配置 ====================

interface FlashSaleConfig {
  /** 最大采集商品数 */
  maxProducts: number;
  /** 每次操作后等待时间 (ms) */
  actionDelayMs: number;
  /** 详情页加载等待时间 (ms) */
  detailLoadDelayMs: number;
  /** 目标店铺名（为空则采集所有店铺） */
  storeName: string;
  /** 最大弹窗清除轮数 */
  maxPopupDismissRounds: number;
  /** 最大返回重试次数 */
  maxBackRetryCount: number;
}

const DEFAULT_CONFIG: FlashSaleConfig = {
  maxProducts: 50,
  actionDelayMs: 2500,
  detailLoadDelayMs: 4000,
  storeName: '',
  maxPopupDismissRounds: 5,
  maxBackRetryCount: 3,
};

// ==================== 数据结构 ====================

interface ProductItem {
  name: string;
  category: string;     // 品类：洗发水、沐浴露等
  quantity: string;
  price: string;
  originalPrice: string; // 原价
  sales: string;         // 销售额/销量
  itemId: string;
  storeName: string;
}

// ==================== 品类关键词 ====================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '洗发水': ['洗发水', '洗发露', '洗发液', '洗头水'],
  '护发素': ['护发素', '护发乳', '润发乳'],
  '发膜': ['发膜', '焗油膏'],
  '沐浴露': ['沐浴露', '沐浴乳', '沐浴液'],
  '身体乳': ['身体乳', '润肤乳', '润肤露'],
  '洗衣液': ['洗衣液', '洗衣露'],
  '洗衣粉': ['洗衣粉'],
  '洗衣凝珠': ['洗衣凝珠', '洗衣珠'],
  '洗洁精': ['洗洁精', '餐具净'],
  '牙膏': ['牙膏'],
  '牙刷': ['牙刷'],
  '面巾纸': ['面巾纸', '抽纸', '纸巾'],
  '卷纸': ['卷纸', '卫生纸'],
  '湿巾': ['湿巾', '湿纸巾'],
  '洗手液': ['洗手液'],
  '消毒液': ['消毒液', '消毒水'],
  '柔顺剂': ['柔顺剂', '护理剂'],
  '香皂': ['香皂', '手工皂'],
  '洗面奶': ['洗面奶', '洁面乳', '洁面膏'],
  '面霜': ['面霜', '保湿霜'],
  '面膜': ['面膜'],
  '防晒': ['防晒霜', '防晒乳', '防晒喷雾'],
};

// ==================== 弹窗处理关键词 ====================

const POPUP_KEYWORDS = [
  '天降消费券', '优惠券', '立即领取', '立即抢', '马上抢',
  '新人专享', '限时优惠', '满减', '折扣', '红包',
  '去使用', '立即使用', '查看', '知道了', '关闭',
  '以后再说', '暂不需要', '不需要', '跳过', '取消',
  '拒绝', '下次再说', '残忍拒绝', '不再提示',
];

const POPUP_CLOSE_KEYWORDS = [
  '关闭', '×', 'X', 'x', '✕', '✖', '拒绝',
  '以后再说', '暂不需要', '不需要', '跳过', '取消',
  '残忍拒绝', '下次再说', '知道了', '不再提示',
];

// ==================== 工具函数 ====================

/** 从节点子树中递归收集所有文本（限制深度） */
function collectAllTexts(node: any, depth = 0, maxDepth = 5): string[] {
  if (depth > maxDepth) return [];
  const texts: string[] = [];

  const t = node.text;
  if (t && t.trim()) texts.push(t.trim());

  const des = node.des;
  if (des && des.trim()) texts.push(des.trim());

  try {
    const children = node.getChildren?.() || [];
    for (const child of children) {
      texts.push(...collectAllTexts(child, depth + 1, maxDepth));
    }
  } catch {
    // 忽略
  }

  return texts;
}

/** 收集节点的直接子节点文本（不递归，用于分析卡片结构） */
function collectChildTexts(node: any): string[] {
  const texts: string[] = [];
  try {
    const children = node.getChildren?.() || [];
    for (const child of children) {
      const t = child.text;
      if (t && t.trim()) texts.push(t.trim());
      const d = child.des;
      if (d && d.trim()) texts.push(d.trim());
    }
  } catch {}
  return texts;
}

/** 直接从 des 属性解析商品信息（秒杀列表页的 des 包含完整信息） */
function parseFromDes(des: string): { name: string; price: string; sales: string } {
  // des 格式示例:
  // "欧莱雅洗发水护发素玻尿酸控油蓬松强韧活力姜大金瓶 79.00..."
  // "欧莱雅小花源护发精油茉莉玫瑰 72.00元 7000+人付款"
  // "【第三代】港版欧莱雅紫熨斗眼霜 81.00元 2万+人付款"

  let name = '';
  let price = '';
  let sales = '';

  // 提取价格: XX.XX元 或 XX.XX 后面跟 ...
  const priceMatch = des.match(/(\d+\.?\d*)\s*元?\s/);
  if (priceMatch) {
    price = priceMatch[1];
  }

  // 提取销量: X人付款 / X万+人付款 / X+人付款
  const salesMatch = des.match(/(\d+[\d.]*\s*万?\+?)\s*人(?:付款|收货|购买)/);
  if (salesMatch) {
    sales = salesMatch[1] + '人付款';
  }

  // 提取商品名: 价格之前的部分
  if (priceMatch) {
    name = des.substring(0, des.indexOf(priceMatch[0])).trim();
  } else {
    // 没有价格，取整个 des（可能被截断）
    name = des.replace(/\.\.\.$/, '').trim();
  }

  // 清理商品名: 去掉前缀标签如【秒杀】
  // 但保留【品牌名】如【第三代】

  return { name, price, sales };
}

/** 检查节点子树中是否有图片 */
function hasImage(node: any, depth = 0, maxDepth = 3): boolean {
  if (depth > maxDepth) return false;
  try {
    const children = node.getChildren?.() || [];
    for (const child of children) {
      const cls = child.className || '';
      if (cls.includes('ImageView') || cls.includes('Image') || cls.includes('img')) {
        return true;
      }
      // 检查 des 是否像图片描述
      const des = child.des || '';
      if (des && (des.includes('图片') || des.includes('照片') || des.includes('image'))) {
        return true;
      }
      if (hasImage(child, depth + 1, maxDepth)) return true;
    }
  } catch {}
  return false;
}

/** 从店铺名中提取品牌关键词（用于商品过滤） */
function extractBrandFromStoreName(storeName: string): string {
  // "欧莱雅美发官方旗舰店" → "欧莱雅"
  // "卡诗官方旗舰店" → "卡诗"
  // "薇姿旗舰店" → "薇姿"
  // 去掉常见后缀：官方旗舰店、旗舰店、专营店、专卖店、海外旗舰店 等
  let brand = storeName
    .replace(/海外官方旗舰店?$/, '')
    .replace(/官方旗舰店?$/, '')
    .replace(/旗舰店?$/, '')
    .replace(/专营店?$/, '')
    .replace(/专卖店?$/, '')
    .replace(/海外专营店?$/, '')
    .trim();
  // 如果还有"美发"、"美妆"等品类修饰词，也去掉
  brand = brand.replace(/美发|美妆|个护|家居|食品|母婴|服饰/, '');
  return brand.trim();
}

/** 识别品类 */
function identifyCategory(texts: string[]): string {
  const allText = texts.join(' ');
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (allText.includes(kw)) return category;
    }
  }
  return '';
}

/** 从文本中提取价格 */
function extractPrice(texts: string[]): string {
  for (const t of texts) {
    // ¥XX.XX 或 ￥XX.XX
    const m1 = t.match(/[¥￥]\s*(\d+\.?\d*)/);
    if (m1) return m1[1];
    // XX.XX元
    const m2 = t.match(/(\d+\.?\d*)\s*元/);
    if (m2) return m2[1];
  }
  return '';
}

/** 从文本中提取原价（划线价） */
function extractOriginalPrice(texts: string[]): string {
  for (const t of texts) {
    // 原价XX.XX
    const m0 = t.match(/原价\s*[¥￥]?\s*(\d+\.?\d*)/);
    if (m0) return m0[1];
    // ¥XX.XX 在 del/s 标记附近（无障碍树中可能表现为特定文本格式）
    // 划线价通常带有删除线，在无障碍树中可能显示为特殊格式
    const m1 = t.match(/~~[¥￥]?\s*(\d+\.?\d*)~~/);
    if (m1) return m1[1];
    // "原价" 或 "¥" 后跟数字，且文本较短（划线价通常单独显示）
    const m2 = t.match(/^[¥￥]\s*(\d+\.?\d*)$/);
    if (m2 && texts.some(t2 => t2 !== t && /[¥￥]\s*\d/.test(t2))) {
      // 如果有多个价格，较短的那个可能是原价
      return m2[1];
    }
  }
  return '';
}

/** 从文本中提取数量/销量 */
function extractQuantity(texts: string[]): string {
  for (const t of texts) {
    // 已抢XX件
    const m1 = t.match(/已抢\s*(\d+[\d.]*\s*[万+]?\s*件)/);
    if (m1) return m1[1];
    // 已售XX件
    const m2 = t.match(/已售\s*(\d+[\d.]*\s*[万+]?\s*件)/);
    if (m2) return m2[1];
    // XX人付款
    const m3 = t.match(/(\d+[\d.]*\s*[万+]?)\s*人付款/);
    if (m3) return m3[1] + '人付款';
    // XX人想要
    const m4 = t.match(/(\d+[\d.]*\s*[万+]?)\s*人想要/);
    if (m4) return m4[1] + '人想要';
    // 库存XX
    const m5 = t.match(/库存\s*(\d+)/);
    if (m5) return '库存' + m5[1];
    // 限量XX
    const m6 = t.match(/限量\s*(\d+)/);
    if (m6) return '限量' + m6[1];
    // 已售罄
    if (t.includes('已售罄') || t.includes('售罄') || t.includes('已抢光')) {
      return '已售罄';
    }
    // XX万+ 已售
    const m7 = t.match(/(\d+\.?\d*)\s*万\+?\s*(?:已售|售出|人付款|人想要)/);
    if (m7) return m7[1] + '万+';
    // 月销XX
    const m8 = t.match(/月销\s*(\d+[\d.]*)/);
    if (m8) return '月销' + m8[1];
    // 销量XX
    const m9 = t.match(/销量\s*(\d+[\d.]*)/);
    if (m9) return '销量' + m9[1];
    // XXX+人付款（不带空格）
    const m10 = t.match(/(\d+\.?\d*万?\+?)\s*人(?:付款|收货|购买)/);
    if (m10) return m10[1] + '人';
  }
  return '';
}

/** 从详情页文本中提取销售额（如果有） */
function extractSales(texts: string[]): string {
  for (const t of texts) {
    // 销售额XXX
    const m1 = t.match(/销售额\s*[¥￥]?\s*(\d+[\d.]*\s*[万亿]?\s*元?)/);
    if (m1) return '¥' + m1[1];
    // 已售XXX件 + 单价 → 可以算出销售额（但这里只取已售数量）
    const m2 = t.match(/已售\s*(\d+[\d.]*\s*[万+]?\s*件)/);
    if (m2) return m2[1];
  }
  return '';
}

/** 从详情页文本中提取商品ID */
function extractItemIdFromTexts(texts: string[]): string {
  // 淘宝商品ID通常是9-12位纯数字
  for (const t of texts) {
    // 匹配纯数字ID（9-15位）
    const m = t.match(/\b(\d{9,15})\b/);
    if (m) return m[1];
  }
  // 也尝试从 des 中提取
  for (const t of texts) {
    if (t.startsWith('[des:')) {
      const m = t.match(/id[=:]\s*(\d{9,15})/i);
      if (m) return m[1];
    }
  }
  // 尝试匹配 "商品ID: XXXXX" 或 "id: XXXXX" 等格式
  for (const t of texts) {
    const m = t.match(/(?:商品ID|商品id|item_id|itemid|goods_id|goodsid|产品ID)[=:：\s]*(\d{6,15})/i);
    if (m) return m[1];
  }
  return '';
}

/** 从详情页文本中提取店铺名 */
function extractStoreName(texts: string[]): string {
  for (const t of texts) {
    if (t.includes('旗舰店')) return t;
    if (t.includes('专营店')) return t;
    if (t.includes('专卖店')) return t;
    if (t.includes('官方') && t.length < 20) return t;
  }
  for (const t of texts) {
    if (t.includes('店铺') && t.length < 15) return t;
  }
  return '';
}

/** 从详情页文本中提取商品名称 */
function extractProductName(texts: string[]): string {
  const excludePatterns = [
    /^[¥￥]\s*\d/,
    /^\d+\.?\d*元$/,
    /已抢|已售|人付款|人想要|售罄|抢光/,
    /旗舰店|专营店|专卖店/,
    /加入购物车|立即购买|收藏|立即抢|马上抢/,
    /分享|客服|店铺|进店/,
    /^\d+$/,
    /月销|销量|评价|评论|好评/,
    /包邮|顺丰|快递|发货|物流/,
    /7天|15天|30天|退换|退货|退款/,
    /正品|保证|品质|官方/,
    /规格|型号|颜色|尺寸|尺码/,
    /库存|限量|抢购|秒杀/,
    /领券|满减|优惠|折扣|直降|降价/,
    /促销|活动|限时|特惠|特价/,
    /已选|请选择|选规格/,
    /参数|详情|介绍|品牌/,
    /^\[des:/, // 过滤 des 标记
    /^-$/, // 分隔线
    /^\|$/, // 分隔符
  ];

  const candidates = texts.filter(t => {
    if (t.length < 4) return false; // 商品名通常至少4个字
    for (const p of excludePatterns) {
      if (p.test(t)) return false;
    }
    return true;
  });

  if (candidates.length === 0) return '';

  // 分离包含中文和不包含中文的候选
  const withChinese = candidates.filter(t => /[\u4e00-\u9fa5]/.test(t));
  const withoutChinese = candidates.filter(t => !/[\u4e00-\u9fa5]/.test(t));

  // 优先选择包含中文的
  const preferred = withChinese.length > 0 ? withChinese : withoutChinese;

  // 按长度排序，但排除过长的（可能是描述文本而非商品名）
  preferred.sort((a, b) => {
    // 商品名通常在 5-60 个字符之间
    const lenA = a.length;
    const lenB = b.length;
    // 优先选择 5-60 字符的
    const scoreA = (lenA >= 5 && lenA <= 60) ? 100 : (lenA < 5 ? 0 : 50);
    const scoreB = (lenB >= 5 && lenB <= 60) ? 100 : (lenB < 5 ? 0 : 50);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return lenB - lenA;
  });

  return preferred[0] || '';
}

/** 生成CSV内容 */
function toCSV(items: ProductItem[]): string {
  const header = '商品名称,品类,数量,价格,原价,销售额,商品ID,店铺名称';
  const rows = items.map(item =>
    [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      `"${item.quantity.replace(/"/g, '""')}"`,
      `"${item.price.replace(/"/g, '""')}"`,
      `"${item.originalPrice.replace(/"/g, '""')}"`,
      `"${item.sales.replace(/"/g, '""')}"`,
      `"${item.itemId.replace(/"/g, '""')}"`,
      `"${item.storeName.replace(/"/g, '""')}"`,
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

// ==================== 主任务 ====================

class TaobaoFlashSaleCollector {
  private config = DEFAULT_CONFIG;
  private collectedItems: ProductItem[] = [];
  private visitedIds = new Set<string>();
  private brandKeyword = '';

  setStoreName(name: string) {
    this.config.storeName = name;
  }

  start = async (): Promise<void> => {
    clearLogs();
    log('=== 淘宝秒杀商品采集（智能识别模式）===');
    log(`目标店铺: ${this.config.storeName || '(全部)'}`);
    log(`最大采集数: ${this.config.maxProducts}`);
    log('请先手动打开淘宝秒杀页面');
    log('');

    this.collectedItems = [];
    this.visitedIds = new Set();
    this.brandKeyword = '';

    await Step.run(this.checkApp);
    await Step.run(this.mainLoop);
    await this.exportCSV();
  };

  /** 检查是否在淘宝，并自动读取搜索栏中的店铺名 */
  private checkApp = async (step: Step): Promise<Step | undefined> => {
    const pkg = step.getPackageName();
    if (pkg !== 'com.taobao.taobao') {
      log(`当前不在淘宝 (当前: ${pkg})，请手动打开秒杀页面`);
      return step.repeat({ delayMs: 3000 });
    }
    log('已检测到淘宝');
    await step.delay(1000);

    // 如果没有手动指定店铺名，尝试从搜索栏自动读取
    if (!this.config.storeName) {
      try {
        const allNodes = await AssistsXAsync.getAllNodes();
        if (allNodes) {
          for (const node of allNodes) {
            const viewId = (node as any).viewId || '';
            const text = node.text || '';
            // 搜索栏 viewId:searchEdit 包含搜索关键词（店铺名）
            if (viewId === 'searchEdit' && text && text.trim().length > 1) {
              this.config.storeName = text.trim();
              log(`从搜索栏读取到店铺名: "${this.config.storeName}"`);
              break;
            }
          }
        }
      } catch (e) {
        log(`读取搜索栏失败: ${e}`);
      }
    }

    if (this.config.storeName) {
      log(`目标店铺: ${this.config.storeName}`);
    } else {
      log('未指定店铺，将采集所有商品');
    }

    return step.next(this.mainLoop);
  };

  /** 判断详情页店铺名是否匹配目标店铺 */
  private storeNameMatches(detailStore: string, targetStore: string): boolean {
    if (!detailStore || !targetStore) return false;
    // 双向包含匹配（详情页可能显示"XX旗舰店"，搜索栏是"XX美发官方旗舰店"）
    return detailStore.includes(targetStore) || targetStore.includes(detailStore)
      // 也尝试品牌关键词匹配（去掉"旗舰店"等后缀后比较）
      || extractBrandFromStoreName(detailStore) === extractBrandFromStoreName(targetStore);
  }

  /**
   * 主循环：每轮处理一个商品卡片
   * 流程：找卡片 → 取第一个未处理的 → 点击进详情 → 验证店铺 → 返回 → 重复
   * 关键：每次从详情页返回后，无障碍树已重建，必须重新读取
   */
  private mainLoop = async (step: Step): Promise<Step | undefined> => {
    const state = (step.data || {}) as {
      scrollCount: number;
      noNewCardCount: number;
      triedKeys: string[]; // 本轮已尝试过的去重键，避免重复点击
    };
    state.scrollCount = state.scrollCount || 0;
    state.noNewCardCount = state.noNewCardCount || 0;
    state.triedKeys = state.triedKeys || [];
    step.data = state;

    // 终止条件
    if (this.collectedItems.length >= this.config.maxProducts) {
      log(`已达最大采集数 (${this.config.maxProducts})，停止`);
      return undefined;
    }
    if (state.scrollCount >= 30) {
      log('滚动次数过多，停止');
      return undefined;
    }
    if (state.noNewCardCount >= 5) {
      log('连续5次未找到新商品，停止');
      return undefined;
    }

    // 1. 获取屏幕尺寸
    const screenSize = await AssistsXAsync.getScreenSize();
    const screenW = screenSize?.width || screenSize?.screenWidth || 1080;
    const screenH = screenSize?.height || screenSize?.screenHeight || 2400;

    // 2. 读取无障碍树，查找商品卡片（每次都是全新的树）
    const allNodes = await AssistsXAsync.getAllNodes();
    if (!allNodes || allNodes.length === 0) {
      log('未获取到节点，等待...');
      return step.repeat({ delayMs: 2000 });
    }

    const cards = this.findProductCards(allNodes, screenW, screenH);
    if (cards.length === 0) {
      log('当前页面未找到商品卡片，向下滚动...');
      await this.scrollDown(step, screenW, screenH);
      state.scrollCount++;
      state.noNewCardCount++;
      state.triedKeys = [];
      step.data = state;
      return step.repeat({ delayMs: 2000 });
    }

    // 3. 找第一个未处理过的卡片
    let targetCard: any = null;
    let targetPreview: ProductItem | null = null;
    for (const card of cards) {
      const preview = this.extractFromCardNode(card, allNodes);
      if (!preview || !preview.name || !preview.price) continue;
      const key = `${preview.name}_${preview.price}`;
      if (this.visitedIds.has(key) || state.triedKeys.includes(key)) continue;
      targetCard = card;
      targetPreview = preview;
      break;
    }

    // 如果当前屏幕没有新卡片，滚动后重试
    if (!targetCard || !targetPreview) {
      state.noNewCardCount++;
      log(`当前屏幕无新商品 (${state.noNewCardCount}/5)，向下滚动...`);
      await this.scrollDown(step, screenW, screenH);
      await step.delay(2000);
      state.scrollCount++;
      state.triedKeys = []; // 滚动后重置，新出现的卡片可以尝试
      step.data = state;
      return step.repeat({ delayMs: 1500 });
    }

    const dedupeKey = `${targetPreview.name}_${targetPreview.price}`;
    state.triedKeys.push(dedupeKey);
    state.noNewCardCount = 0;
    step.data = state;

    // 4. 点击进入详情页
    log(`验证: ${targetPreview.name} - ${targetPreview.price}元`);
    const clicked = await this.clickCard(targetCard, screenW, screenH);
    if (!clicked) {
      log('点击失败，跳过');
      return step.repeat({ delayMs: 1500 });
    }

    // 等待详情页加载
    await step.delay(this.config.detailLoadDelayMs);

    // 5. 从详情页提取完整信息
    const detailItem = await this.extractFromDetailPage(step);

    // 6. 返回列表页（这里无障碍树会重建）
    await this.goBackToList(step);
    await step.delay(2500); // 多等一会让列表页完全恢复

    if (!detailItem || (!detailItem.name && !detailItem.price)) {
      log('详情页提取失败，跳过');
      this.visitedIds.add(dedupeKey); // 标记为已处理，避免反复点击
      return step.repeat({ delayMs: 1500 });
    }

    // 7. 验证店铺名是否匹配
    if (this.config.storeName) {
      const matched = this.storeNameMatches(detailItem.storeName, this.config.storeName);
      if (!matched) {
        log(`[跳过-店铺不匹配] ${detailItem.name} | 详情页: "${detailItem.storeName}" ≠ 目标: "${this.config.storeName}"`);
        this.visitedIds.add(dedupeKey);
        return step.repeat({ delayMs: 1500 });
      }
      log(`店铺匹配: "${detailItem.storeName}"`);
    }

    // 8. 采集成功
    this.visitedIds.add(dedupeKey);
    const finalItem: ProductItem = {
      name: detailItem.name || targetPreview.name,
      category: detailItem.category || targetPreview.category || identifyCategory([detailItem.name || '']),
      quantity: detailItem.quantity || '-',
      price: detailItem.price || targetPreview.price,
      originalPrice: detailItem.originalPrice || '-',
      sales: detailItem.sales || targetPreview.sales || '-',
      itemId: detailItem.itemId || '-',
      storeName: detailItem.storeName || this.config.storeName || '-',
    };

    this.collectedItems.push(finalItem);
    log(`[采集] ${finalItem.name} | 品类:${finalItem.category || '-'} | ${finalItem.price}元 | 销量:${finalItem.sales || '-'} | ID:${finalItem.itemId} | ${finalItem.storeName}`);

    // 继续处理下一个（直接 repeat，不滚动 — 返回后可能还有新卡片可见）
    return step.repeat({ delayMs: 1500 });
  };

  /**
   * 智能查找商品卡片
   * 策略：基于无障碍树实际结构识别商品卡片
   *
   * 淘宝秒杀列表页结构：
   *   RecyclerView (scrollable)
   *     └── FrameLayout | id:dynamic_container
   *           └── View | des:"商品名 XX.XX元 X人付款" | clickable
   *
   * des 属性包含完整的商品信息：名称、价格、销量
   */
  private findProductCards(
    allNodes: any[],
    screenW: number,
    screenH: number,
  ): any[] {
    const cards: any[] = [];

    for (const node of allNodes) {
      const bounds = node.bounds;
      if (!bounds) continue;
      const b = bounds.toJSON ? bounds.toJSON() : bounds;

      // 必须在屏幕可见区域内
      if (b.top < 0 || b.top > screenH) continue;
      if (b.bottom < 0) continue;

      // 必须有一定大小（不是小按钮）
      const width = b.right - b.left;
      const height = b.bottom - b.top;
      if (width < screenW * 0.35 || height < 80) continue;

      // 核心识别：检查 des 属性是否包含价格信息
      // 淘宝秒杀列表页的 des 格式: "商品名 XX.XX元 X+人付款" 或 "商品名 XX.XX..."
      const des = node.des || '';
      if (!des) continue;

      // des 中包含数字+价格特征（XX.XX 或 XX.XX元）
      const hasPriceInDes = /\d+\.?\d*\s*元?/.test(des) && des.length > 10;
      if (!hasPriceInDes) continue;

      // des 中包含中文（商品名）
      const hasChineseInDes = /[\u4e00-\u9fa5]/.test(des);
      if (!hasChineseInDes) continue;

      // 品牌过滤：从店铺名提取品牌关键词，检查商品名是否包含
      if (this.config.storeName) {
        if (!this.brandKeyword) {
          this.brandKeyword = extractBrandFromStoreName(this.config.storeName);
          log(`品牌关键词: "${this.brandKeyword}" (来自店铺: "${this.config.storeName}")`);
        }
        if (this.brandKeyword && !des.includes(this.brandKeyword)) continue;
      }

      // 必须可点击
      if (!node.isClickable) continue;

      cards.push(node);
    }

    // 按位置排序（从上到下）
    cards.sort((a, b) => {
      const ba = a.bounds?.toJSON?.() || a.bounds || {};
      const bb = b.bounds?.toJSON?.() || b.bounds || {};
      return (ba.top || 0) - (bb.top || 0);
    });

    // 调试：输出前3个卡片的完整属性（帮助排查ID提取问题）
    if (cards.length > 0) {
      log(`[调试] 找到 ${cards.length} 个商品卡片，前3个属性:`);
      for (let i = 0; i < Math.min(3, cards.length); i++) {
        const c = cards[i];
        const b = c.bounds?.toJSON?.() || c.bounds || {};
        log(`  卡片#${i}: viewId="${c.viewId || ''}" className="${(c.className || '').split('.').pop()}" des="${(c.des || '').substring(0, 60)}" text="${(c.text || '').substring(0, 30)}" clickable=${c.isClickable} bounds=[${b.left},${b.top} ${b.right - b.left}x${b.bottom - b.top}]`);
        // 输出子节点
        try {
          const children = c.getChildren?.() || [];
          for (let j = 0; j < Math.min(5, children.length); j++) {
            const child = children[j];
            log(`    子#${j}: viewId="${child.viewId || ''}" text="${(child.text || '').substring(0, 40)}" des="${(child.des || '').substring(0, 40)}" class="${(child.className || '').split('.').pop()}"`);
          }
        } catch {}
      }
    }

    return cards;
  }

  /**
   * 从列表页的商品卡片节点中直接提取信息
   * 核心：直接从 des 属性解析，不需要递归遍历子树
   */
  private extractFromCardNode(card: any, allNodes: any[]): ProductItem | null {
    const des = card.des || '';
    if (des && des.length > 5) {
      const parsed = parseFromDes(des);
      if (parsed.name || parsed.price) {
        const category = identifyCategory([des]);

        // 多策略提取商品ID
        let itemId = this.extractItemIdFromCard(card, des);

        const storeName = this.config.storeName || '-';

        return {
          name: parsed.name || '(未识别)',
          category,
          quantity: '-',
          price: parsed.price || '-',
          originalPrice: '-',
          sales: parsed.sales || '-',
          itemId,
          storeName,
        };
      }
    }

    // 兜底：从子节点的 des 中查找
    try {
      const children = card.getChildren?.() || [];
      for (const child of children) {
        const childDes = child.des || '';
        if (childDes && childDes.length > 5 && /\d+\.?\d*/.test(childDes)) {
          const parsed = parseFromDes(childDes);
          if (parsed.name || parsed.price) {
            const category = identifyCategory([childDes]);
            const itemId = this.extractItemIdFromCard(card, childDes);
            return {
              name: parsed.name || '(未识别)',
              category,
              quantity: '-',
              price: parsed.price || '-',
              originalPrice: '-',
              sales: parsed.sales || '-',
              itemId,
              storeName: this.config.storeName || '-',
            };
          }
        }
      }
    } catch {}

    return null;
  }

  /**
   * 从卡片节点多策略提取商品ID
   * 策略优先级：
   * 1. 从 des 属性中匹配 9-15 位数字
   * 2. 从子节点的 text 属性中匹配 9-15 位数字
   * 3. 从子节点的 viewId 中提取可能的 ID
   * 4. 从子节点的 des 属性中匹配
   * 5. 从所有子节点文本中匹配 "ID"/"id" 关键词附近的数字
   */
  private extractItemIdFromCard(card: any, des: string): string {
    // 策略1: 从 des 本身提取 9-15 位数字
    const desIdMatch = des.match(/\b(\d{9,15})\b/);
    if (desIdMatch) return desIdMatch[1];

    // 策略2: 遍历子节点，从 text/des/viewId 中提取
    try {
      const children = card.getChildren?.() || [];
      for (const child of children) {
        // 从 text 中提取
        const childText = child.text || '';
        const textMatch = childText.match(/\b(\d{9,15})\b/);
        if (textMatch) return textMatch[1];

        // 从 des 中提取
        const childDes = child.des || '';
        const desMatch = childDes.match(/\b(\d{9,15})\b/);
        if (desMatch) return desMatch[1];

        // 从 viewId 中提取数字部分（某些 viewId 包含 ID）
        const viewId = child.viewId || '';
        const viewIdMatch = viewId.match(/(\d{9,15})/);
        if (viewIdMatch) return viewIdMatch[1];

        // 检查文本中是否有 "id" 关键词
        const idKeyMatch = childText.match(/(?:id|ID|商品号)[=:\s]*(\d{6,15})/i);
        if (idKeyMatch) return idKeyMatch[1];

        // 深层子节点（第二层）
        try {
          const grandChildren = child.getChildren?.() || [];
          for (const gc of grandChildren) {
            const gcText = gc.text || '';
            const gcMatch = gcText.match(/\b(\d{9,15})\b/);
            if (gcMatch) return gcMatch[1];
            const gcDes = gc.des || '';
            const gcDesMatch = gcDes.match(/\b(\d{9,15})\b/);
            if (gcDesMatch) return gcDesMatch[1];
          }
        } catch {}
      }
    } catch {}

    return '-';
  }

  /**
   * 从剪贴板中提取商品ID
   * 淘宝分享链接格式：
   *   https://item.taobao.com/item.htm?id=123456789
   *   https://detail.tmall.com/item.htm?id=123456789
   *   复制的文本中可能包含 商品名 ¥XX.XX https://...?id=123456789
   */
  private async extractIdFromClipboard(): Promise<string> {
    try {
      const clipboardText = await AssistsXAsync.getClipboardText();
      if (!clipboardText) return '-';

      log(`[调试] 剪贴板内容: "${clipboardText.substring(0, 100)}"`);

      // 从 URL 中提取 id 参数
      const urlIdMatch = clipboardText.match(/[?&]id=(\d{6,15})/);
      if (urlIdMatch) {
        log(`从剪贴板URL提取到商品ID: ${urlIdMatch[1]}`);
        return urlIdMatch[1];
      }

      // 从文本中提取纯数字ID（链接后面可能紧跟数字）
      const numMatch = clipboardText.match(/(\d{9,15})/);
      if (numMatch) {
        log(`从剪贴板数字提取到可能的商品ID: ${numMatch[1]}`);
        return numMatch[1];
      }
    } catch (e) {
      // 剪贴板读取失败，忽略
    }
    return '-';
  }

  /** 点击商品卡片 */
  private async clickCard(card: any, screenW: number, screenH: number): Promise<boolean> {
    try {
      const bounds = card.bounds;
      if (bounds) {
        const b = bounds.toJSON ? bounds.toJSON() : bounds;
        const centerX = Math.floor((b.left + b.right) / 2);
        const centerY = Math.floor((b.top + b.bottom) / 2);

        log(`点击坐标: (${centerX}, ${centerY})`);

        await AssistsXAsync.clickByGesture(centerX, centerY, 100);
        return true;
      }
    } catch (err) {
      log(`点击失败: ${err}`);
    }
    return false;
  }

  /** 在详情页提取商品信息 */
  private async extractFromDetailPage(step: Step): Promise<ProductItem | null> {
    // 等待页面稳定
    let loadingDetected = false;
    for (let i = 0; i < 5; i++) {
      await step.delay(500);
      const allNodes = await AssistsXAsync.getAllNodes();
      if (allNodes && allNodes.length > 0) {
        const hasLoading = allNodes.some(node => {
          const texts = collectAllTexts(node, 0, 1);
          return texts.some(t => /加载中|正在加载|loading/i.test(t));
        });
        if (hasLoading) {
          loadingDetected = true;
          log('检测到加载中状态，等待...');
          continue;
        }
      }
      break;
    }

    if (loadingDetected) {
      log('加载时间较长，继续等待...');
      await step.delay(1000);
    }

    const allNodes = await AssistsXAsync.getAllNodes();
    if (!allNodes || allNodes.length === 0) {
      log('详情页未获取到节点');
      return null;
    }

    // 收集所有文本
    const allTexts: string[] = [];
    for (const node of allNodes) {
      allTexts.push(...collectAllTexts(node, 0, 4));
    }

    if (allTexts.length === 0) {
      log('详情页无文本内容');
      return null;
    }

    // 提取各项信息
    const name = extractProductName(allTexts);
    const price = extractPrice(allTexts);
    const originalPrice = extractOriginalPrice(allTexts);
    const quantity = extractQuantity(allTexts);
    const sales = extractSales(allTexts);
    const category = identifyCategory(allTexts);
    let itemId = extractItemIdFromTexts(allTexts);
    const storeName = extractStoreName(allTexts);

    // 备选策略：从剪贴板读取（如果用户之前复制过商品链接）
    if (itemId === '-') {
      itemId = await this.extractIdFromClipboard();
    }

    log(`详情页文本数: ${allTexts.length}`);
    log(`提取结果: name="${name}", category="${category}", price="${price}", originalPrice="${originalPrice}", store="${storeName}", id="${itemId}", sales="${sales}"`);

    // 调试：输出详情页中所有包含数字的文本（帮助排查 ID 问题）
    const numericTexts = allTexts.filter(t => /\d{6,}/.test(t));
    if (numericTexts.length > 0) {
      log(`[调试] 包含数字的文本 (${numericTexts.length}条):`);
      for (const t of numericTexts.slice(0, 15)) {
        log(`  "${t.substring(0, 80)}"`);
      }
    }

    // 调试：输出所有节点的 viewId（可能包含商品ID）
    const nodesWithViewId = allNodes.filter((n: any) => n.viewId && /\d{6,}/.test(n.viewId));
    if (nodesWithViewId.length > 0) {
      log(`[调试] viewId 包含数字的节点 (${nodesWithViewId.length}个):`);
      for (const n of nodesWithViewId.slice(0, 10)) {
        log(`  viewId="${n.viewId}" text="${(n.text || '').substring(0, 30)}"`);
      }
    }

    if (!name && !price) return null;

    return {
      name: name || '(未识别)',
      category,
      quantity: quantity || '-',
      price: price || '-',
      originalPrice: originalPrice || '-',
      sales: sales || '-',
      itemId: itemId || '-',
      storeName: storeName || '-',
    };
  }

  /** 返回列表页 — 详情页按一次 back 即可，不反复重试 */
  private async goBackToList(step: Step): Promise<void> {
    log('返回列表页...');
    await step.back();
    await step.delay(2000); // 等列表页恢复

    // 如果不在淘宝了（可能弹出了广告页），再按一次
    const pkg = step.getPackageName();
    if (pkg !== 'com.taobao.taobao') {
      log('返回后不在淘宝，再次返回');
      await step.back();
      await step.delay(1500);
    }
  }

  /** 清除弹窗 */
  private async dismissPopups(step: Step): Promise<void> {
    log('检查是否有弹窗...');
    let dismissCount = 0;
    for (let round = 0; round < this.config.maxPopupDismissRounds; round++) {
      await step.delay(500);
      let dismissed = await this.tryClosePopupByAccessibility(step);
      if (dismissed) {
        dismissCount++;
        log(`弹窗已关闭 (第${dismissCount}个)`);
        await step.delay(800);
        continue;
      }
      break;
    }
    if (dismissCount > 0) {
      log(`共清除了 ${dismissCount} 个弹窗`);
    }
  }

  /** 通过无障碍树查找并关闭弹窗 */
  private async tryClosePopupByAccessibility(step: Step): Promise<boolean> {
    try {
      let hasPopup = false;
      for (const keyword of POPUP_KEYWORDS) {
        const nodes = step.findByTextAllMatch(keyword);
        if (nodes.length > 0) {
          hasPopup = true;
          log(`检测到弹窗关键词: "${keyword}"`);
          break;
        }
      }
      if (!hasPopup) return false;

      for (const closeKeyword of POPUP_CLOSE_KEYWORDS) {
        const closeNodes = step.findByTextAllMatch(closeKeyword);
        if (closeNodes.length > 0) {
          log(`找到关闭按钮: "${closeKeyword}"，点击关闭...`);
          await this.clickNodeByGesture(closeNodes[0]);
          return true;
        }
      }
      log('检测到弹窗但未找到关闭按钮文本，跳过');
      return false;
    } catch (err) {
      log('弹窗检测失败: ' + err);
      return false;
    }
  }

  /** 通过手势点击节点 */
  private async clickNodeByGesture(node: any): Promise<void> {
    try {
      const bounds = node.bounds;
      if (bounds) {
        const b = bounds.toJSON ? bounds.toJSON() : bounds;
        const centerX = Math.floor((b.left + b.right) / 2);
        const centerY = Math.floor((b.top + b.bottom) / 2);
        await AssistsXAsync.clickByGesture(centerX, centerY, 50);
      }
    } catch (err) {
      log('点击节点失败: ' + err);
    }
  }

  /** 向下滚动 */
  private async scrollDown(step: Step, screenW: number, screenH: number): Promise<void> {
    const centerX = Math.floor(screenW / 2);
    const startY = Math.floor(screenH * 0.8);
    const endY = Math.floor(screenH * 0.2);
    await AssistsXAsync.performLinearGesture(
      { x: centerX, y: startY },
      { x: centerX, y: endY },
      { duration: 600 },
    );
  }

  /** 导出数据并持久化 */
  private exportCSV = async (): Promise<void> => {
    log('');
    log('=====================================');
    log(`=== 采集完成，共 ${this.collectedItems.length} 件商品 ===`);

    if (this.collectedItems.length === 0) {
      log('未采集到任何商品');
      log('提示: 请先手动导航到秒杀页面，确保页面上有商品列表');
      return;
    }

    // 统计品类
    const categoryMap = new Map<string, number>();
    for (const item of this.collectedItems) {
      const cat = item.category || '(未识别)';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    }
    log('');
    log('品类统计:');
    for (const [cat, count] of Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])) {
      log(`  ${cat}: ${count} 件`);
    }

    // 打印表格
    log('');
    log('商品名称 | 品类 | 数量 | 价格 | 原价 | 销量 | 商品ID | 店铺');
    log('-'.repeat(80));
    for (const item of this.collectedItems) {
      log(`${item.name} | ${item.category || '-'} | ${item.quantity} | ${item.price}元 | ${item.originalPrice || '-'} | ${item.sales || '-'} | ${item.itemId} | ${item.storeName}`);
    }

    // 生成CSV和JSON
    const csv = toCSV(this.collectedItems);
    const jsonData = {
      collectedAt: new Date().toISOString(),
      totalItems: this.collectedItems.length,
      categorySummary: Object.fromEntries(categoryMap),
      items: this.collectedItems,
    };
    const jsonStr = JSON.stringify(jsonData, null, 2);

    // 持久化到手机存储
    await this.saveToStorage(csv, jsonStr);

    // 打印CSV内容供复制
    log('');
    log('--- CSV 内容 ---');
    log(csv);

    // 保存到剪贴板
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(csv);
        log('');
        log('CSV 已复制到剪贴板');
      }
    } catch {
      log('剪贴板复制失败');
    }
  }

  /** 将字符串转为 base64（支持中文） */
  private toBase64(str: string): string {
    // 先用 encodeURIComponent 转义，再用 atob 解码为二进制字符串，最后 btoa 编码
    const encoded = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
    return btoa(encoded);
  }

  /** 保存数据到手机 Download 目录（文件管理器可直接查看） */
  private async saveToStorage(csv: string, jsonStr: string): Promise<void> {
    try {
      const dir = '/sdcard/Download';
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '');

      // 保存 CSV
      const csvPath = `${dir}/flash_sale_${dateStr}_${timeStr}.csv`;
      await fileIO.writeFileFromBytesByStream(csvPath, this.toBase64(csv));
      log(`CSV 已保存: ${csvPath}`);

      // 保存 JSON
      const jsonPath = `${dir}/flash_sale_${dateStr}_${timeStr}.json`;
      await fileIO.writeFileFromBytesByStream(jsonPath, this.toBase64(jsonStr));
      log(`JSON 已保存: ${jsonPath}`);

      log('数据已保存到手机 Download 文件夹，打开「文件管理」即可查看');
    } catch (err) {
      log(`持久化保存失败: ${err}`);
    }
  }
}

export const taobaoFlashSaleCollector = new TaobaoFlashSaleCollector();
