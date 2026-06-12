// content.js — 注入淘宝页面，提取商品数据
// 复用 script-injector.ts 的 link-first 策略，不依赖 CSS 类名

(() => {
  'use strict';

  // ==================== 品类关键词 ====================
  const CATEGORY_KEYWORDS = {
    '洗发水': ['洗发水', '洗发露', '洗发液', '洗头水', '洗发膏'],
    '护发素': ['护发素', '护发乳', '润发乳'],
    '发膜': ['发膜', '焗油膏', '倒膜'],
    '沐浴露': ['沐浴露', '沐浴乳', '沐浴液', '洗澡液'],
    '身体乳': ['身体乳', '润肤乳', '润肤露', '身体霜'],
    '洗衣液': ['洗衣液', '洗衣露'],
    '洗衣粉': ['洗衣粉'],
    '洗衣凝珠': ['洗衣凝珠', '洗衣珠'],
    '洗洁精': ['洗洁精', '餐具净', '果蔬净'],
    '牙膏': ['牙膏'],
    '牙刷': ['牙刷', '软毛牙刷'],
    '面巾纸': ['面巾纸', '抽纸', '纸巾'],
    '卷纸': ['卷纸', '卫生纸', '厕纸'],
    '湿巾': ['湿巾', '湿纸巾', '婴儿湿巾'],
    '洗手液': ['洗手液', '洗手露'],
    '消毒液': ['消毒液', '消毒水', '84消毒液', '衣物消毒液'],
    '柔顺剂': ['柔顺剂', '衣物柔顺剂', '护理剂'],
    '香皂': ['香皂', '手工皂', '洁面皂'],
    '洗面奶': ['洗面奶', '洁面乳', '洁面膏', '洁面慕斯'],
    '面霜': ['面霜', '保湿霜', '日霜', '晚霜'],
    '乳液': ['乳液', '保湿乳', '护肤乳'],
    '精华': ['精华液', '精华露', '精华'],
    '面膜': ['面膜', '贴片面膜', '涂抹面膜'],
    '防晒': ['防晒霜', '防晒乳', '防晒喷雾', '防晒露'],
  };

  // ==================== 品牌关键词 ====================
  const BRAND_KEYWORDS = {
    '海飞丝': ['海飞丝', 'HeadShoulders'],
    '潘婷': ['潘婷', 'Pantene'],
    '飘柔': ['飘柔', 'Rejoice'],
    '清扬': ['清扬', 'Clear'],
    '沙宣': ['沙宣', 'VS'],
    '施华蔻': ['施华蔻', 'Schwarzkopf'],
    '力士': ['力士', 'Lux'],
    '欧莱雅': ['欧莱雅', "L'Oreal"],
    '霸王': ['霸王'],
    '蜂花': ['蜂花'],
    '舒肤佳': ['舒肤佳', 'Safeguard'],
    '多芬': ['多芬', 'Dove'],
    '六神': ['六神'],
    '蓝月亮': ['蓝月亮'],
    '奥妙': ['奥妙', 'OMO'],
    '汰渍': ['汰渍', 'Tide'],
    '立白': ['立白'],
    '碧浪': ['碧浪', 'Ariel'],
    '高露洁': ['高露洁', 'Colgate'],
    '佳洁士': ['佳洁士', 'Crest'],
    '云南白药': ['云南白药'],
    '维达': ['维达', 'Vinda'],
    '清风': ['清风'],
    '心相印': ['心相印'],
    '洁柔': ['洁柔'],
  };

  // ==================== 秒杀关键词 ====================
  const FLASH_SALE_TEXT = '正在秒杀';

  // ==================== 辅助函数 ====================

  function parsePrice(text) {
    const match = text.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }

  function getElementText(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function extractStructuredPrice(container) {
    const scopes = [container, ...Array.from(container.querySelectorAll('[class*="priceWrapper" i], [class*="normalPrice" i], [class*="price--" i]'))];
    for (const scope of scopes) {
      const intEl = scope.querySelector?.('[class*="priceInt" i]');
      if (!intEl) continue;

      const intText = (intEl.textContent || '').replace(/[^\d]/g, '');
      if (!intText) continue;

      const floatEl = scope.querySelector?.('[class*="priceFloat" i]');
      const rawFloat = (floatEl?.textContent || '').trim();
      const floatDigits = rawFloat.replace(/[^\d]/g, '');
      const priceText = floatDigits ? `${intText}.${floatDigits.slice(0, 2)}` : intText;
      const price = parseFloat(priceText);
      if (price > 0 && price < 100000) return price;
    }
    return 0;
  }

  function stripSalesText(text) {
    return (text || '')
      .replace(/\d+(?:\.\d+)?\s*万\+?\s*(?:人付款|人收货|人购买|人想要|已售|售出)/g, '')
      .replace(/\d+\+?\s*(?:人付款|人收货|人购买|人想要|已售|售出)/g, '');
  }

  function extractCurrentPrice(container) {
    // 方法1: 淘宝 2025 搜索卡片会把价格拆成 priceInt / priceFloat，优先读结构化节点
    const structuredPrice = extractStructuredPrice(container);
    if (structuredPrice > 0) return structuredPrice;

    // 方法2: 找 class 包含 price 的元素
    const priceEls = container.querySelectorAll('[class*="price"], [class*="Price"]');
    for (const el of Array.from(priceEls)) {
      const cls = (el.className || '').toLowerCase();
      const tag = el.tagName.toLowerCase();
      if (cls.includes('origin') || cls.includes('del') || cls.includes('cross')
          || cls.includes('sales') || cls.includes('sold') || cls.includes('desc')
          || tag === 'del' || tag === 's') {
        continue;
      }
      const text = stripSalesText(el.textContent?.trim() || '');
      const price = parsePrice(text);
      if (price > 0) return price;
    }

    // 方法3: 遍历文本节点匹配 ¥XX.XX
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent) continue;
      const parentTag = parent.tagName.toLowerCase();
      const parentCls = (parent.className || '').toLowerCase();
      if (parentTag === 'del' || parentTag === 's'
          || parentCls.includes('origin') || parentCls.includes('del') || parentCls.includes('cross')) {
        continue;
      }
      const text = stripSalesText(node.textContent || '');
      if (text.includes('¥') || /\d+\.\d+/.test(text)) {
        const price = parsePrice(text);
        if (price > 0 && price < 100000) return price;
      }
    }
    return 0;
  }

  function extractOriginalPrice(container) {
    const delEls = container.querySelectorAll('del, s, [class*="origin"], [class*="Origin"], [class*="cross"], [class*="del"]');
    for (const el of Array.from(delEls)) {
      const text = el.textContent?.trim() || '';
      const price = parsePrice(text);
      if (price > 0) return price;
    }

    const allEls = container.querySelectorAll('*');
    for (const el of Array.from(allEls)) {
      const style = window.getComputedStyle(el);
      if (style.textDecorationLine === 'line-through' || style.textDecoration.includes('line-through')) {
        const text = el.textContent?.trim() || '';
        const price = parsePrice(text);
        if (price > 0) return price;
      }
    }
    return 0;
  }

  function extractQuantity(text) {
    const patterns = [
      /剩(\d+)\s*件/, /仅剩(\d+)/, /库存(\d+)/, /余(\d+)\s*件/,
      /剩余(\d+)/, /还剩(\d+)/, /限量(\d+)/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return parseInt(match[1], 10);
    }
    return -1;
  }

  function extractSold(text) {
    const wanMatch = text.match(/(\d+(?:\.\d+)?)\s*万\+?\s*(?:人付款|人收货|人购买|已售|售出)/);
    if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);

    const patterns = [
      /已售(\d+)/, /月销(\d+)/, /(\d+)\+?\s*人付款/, /(\d+)\+?\s*人收货/,
      /(\d+)\+?\s*人购买/, /售出(\d+)/, /(\d+)\+?\s*人想要/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return parseInt(match[1], 10);
    }
    return -1;
  }

  function extractCategory(title) {
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (title.includes(kw)) return category;
      }
    }
    return '';
  }

  function extractBrand(title) {
    // 先从【】中提取
    const bracketMatch = title.match(/[【\[]([^\]】]+)[】\]]/);
    if (bracketMatch) {
      const content = bracketMatch[1].trim();
      for (const [brand, aliases] of Object.entries(BRAND_KEYWORDS)) {
        if (aliases.some(a => content.includes(a))) return brand;
      }
      if (content.length >= 2 && content.length <= 6) return content;
    }
    // 再从全文匹配
    for (const [brand, aliases] of Object.entries(BRAND_KEYWORDS)) {
      for (const alias of aliases) {
        if (title.includes(alias)) return brand;
      }
    }
    return '';
  }

  function extractVolume(title) {
    const patterns = [
      /(\d+(?:\.\d+)?)\s*(?:ml|ML|mL)/i,
      /(\d+(?:\.\d+)?)\s*(?:L|l|升)/,
      /(\d+(?:\.\d+)?)\s*(?:g|G|克)/,
      /(\d+(?:\.\d+)?)\s*(?:kg|KG)/i,
      /(\d+)\s*(?:片|包|抽|帖|枚|个)/,
      /(\d+)\s*(?:瓶|支|管|条|盒|袋)/,
      /(\d+)\s*[x×*]\s*(\d+)\s*(ml|g|片|包|支|瓶|袋)/i,
    ];
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) return match[0].trim();
    }
    return '';
  }

  function isBetterProduct(a, b) {
    let scoreA = 0, scoreB = 0;
    if (a.title) scoreA += 2;
    if (b.title) scoreB += 2;
    if (a.price > 0) scoreA += 3;
    if (b.price > 0) scoreB += 3;
    if (a.originalPrice > 0) scoreA += 1;
    if (b.originalPrice > 0) scoreB += 1;
    if (a.image) scoreA += 1;
    if (b.image) scoreB += 1;
    if (a.quantity >= 0) scoreA += 1;
    if (b.quantity >= 0) scoreB += 1;
    if (a.sold >= 0) scoreA += 1;
    if (b.sold >= 0) scoreB += 1;
    return scoreA > scoreB;
  }

  // ==================== 秒杀商品验证 ====================

  function findAllFlashSaleElements() {
    const result = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const text = getElementText(el);
      if (!text.includes(FLASH_SALE_TEXT)) continue;

      const parent = el.parentElement;
      if (parent && getElementText(parent) === text) {
        continue;
      }
      result.push(el);
    }
    return result;
  }

  function isFlashSaleProduct(cardEl, linkEl, flashElements = []) {
    // 只认"正在秒杀"四个字

    // 首先检查 cardEl 和 linkEl
    const scanEls = [cardEl];
    if (linkEl && linkEl !== cardEl) scanEls.push(linkEl);

    for (const el of scanEls) {
      if ((el.textContent || '').includes(FLASH_SALE_TEXT)) {
        return { match: true, reason: '正在秒杀' };
      }
    }

    // 优先用预扫描到的秒杀元素判断，避免扫到整页父级导致误判
    for (const flashEl of flashElements) {
      if (cardEl?.contains(flashEl) || linkEl?.contains(flashEl)) {
        return { match: true, reason: '正在秒杀' };
      }
    }

    // 如果没找到，向上遍历父级（最多 4 层）查找"正在秒杀"
    let el = cardEl?.parentElement;
    for (let depth = 0; depth < 4 && el; depth++) {
      if (el === document.body) break;
      if ((el.textContent || '').includes(FLASH_SALE_TEXT)) {
        return { match: true, reason: '正在秒杀' };
      }
      el = el.parentElement;
    }

    return { match: false };
  }

  // ==================== 智能去重 ====================

  function normalizeTitle(title) {
    // 去除括号内容、特殊符号、多余空格，用于相似度比较
    return title
      .replace(/【[^】]*】/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[（(][^)）]*[)）]/g, '')
      .replace(/[，,。.！!？?、;；：:""''「」『』【】\s]+/g, '')
      .replace(/官方旗舰店|旗舰店|专卖店|专营店|自营店/g, '')
      .toLowerCase();
  }

  function titleSimilarity(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);
    if (na === nb) return 1;
    // 简单的包含关系判断
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    // 字符重叠率
    const setA = new Set(na);
    const setB = new Set(nb);
    let overlap = 0;
    for (const c of setA) { if (setB.has(c)) overlap++; }
    return overlap / Math.max(setA.size, setB.size);
  }

  function deduplicateProducts(products) {
    const result = [];
    for (const p of products) {
      const dup = result.find(r => {
        // 同一ID直接去重
        if (r.id === p.id) return true;
        // 标题高度相似 + 价格相同 → 视为同商品不同链接
        if (r.price === p.price && r.price > 0
          && titleSimilarity(r.title, p.title) > 0.7) return true;
        return false;
      });
      if (!dup) {
        result.push(p);
      } else if (isBetterProduct(p, dup)) {
        // 新的商品数据更完整，替换
        const idx = result.indexOf(dup);
        result[idx] = p;
      }
    }
    return result;
  }

  // ==================== 秒杀筛选 ====================

  function clickFlashSaleFilter() {
    const debug = [];
    debug.push(`URL=${location.href.substring(0, 60)}`);

    // 1. 先横向滚动筛选栏
    const scrollWrapper = document.querySelector('[class*="scrollWrapper"]');
    if (scrollWrapper) {
      for (let i = 0; i < 10; i++) scrollWrapper.scrollLeft += 300;
    }

    // 2. 找所有 filterItem，收集 title
    const items = document.querySelectorAll('[class*="filterItem"]');
    debug.push(`items=${items.length}`);
    const titles = [];
    for (const el of items) {
      const t = (el.getAttribute('title') || '').trim();
      if (t) titles.push(t);
      if (t.includes('秒杀')) {
        el.click();
        return { clicked: true, debug: [...debug, `命中: ${t}`] };
      }
    }
    debug.push(`titles=[${titles.join(',')}]`);

    // 3. 兜底：全页面找 title 含秒杀
    const allEls = document.querySelectorAll('[title*="秒杀"]');
    if (allEls.length > 0) {
      debug.push(`兜底找到${allEls.length}个`);
      allEls[0].click();
      return { clicked: true, debug: [...debug, `兜底命中: ${allEls[0].getAttribute('title')}`] };
    }

    return { clicked: false, debug };
  }

  // ==================== 店铺名提取 ====================

  function cleanShopName(text) {
    return (text || '')
      .replace(/\s+/g, '')
      .replace(/^(?:回头客|粉丝|收藏|关注|已售|月销)\d+(?:\.\d+)?万?\+?/, '')
      .replace(/旺旺在线.*$/, '')
      .trim();
  }

  function extractShopName(container) {
    // 方法1: 优先找最小的 shopNameText 节点，避免外层 a 把"回头客100万"拼进来
    const exactShopEls = container.querySelectorAll('[class*="shopNameText" i]');
    for (const el of exactShopEls) {
      const text = cleanShopName(el.textContent || '');
      if (text.length >= 2 && text.length <= 30 && !/¥|\d{5,}/.test(text)) {
        return text;
      }
    }

    // 方法2: 找 shopName 包裹节点，并清洗可能混入的店铺标签
    const shopEls = container.querySelectorAll('[class*="shopName--" i], [class*="shopName " i]');
    for (const el of shopEls) {
      const text = cleanShopName(el.textContent || '');
      if (text.length >= 2 && text.length <= 30 && !/¥|\d{5,}/.test(text)) {
        return text;
      }
    }
    // 方法3: 找旺旺 data-nick
    const nickEl = container.querySelector('[data-nick]');
    const nick = cleanShopName(nickEl?.getAttribute('data-nick') || '');
    if (nick.length >= 2 && nick.length <= 30) return nick;

    // 方法4: 找包含"店"字的短文本节点
    const allText = container.querySelectorAll('a, span, div');
    for (const el of allText) {
      const text = cleanShopName(el.textContent || '');
      if (text.length >= 3 && text.length <= 25 && /店$/.test(text)
        && !/¥|\d{5,}|件|人|售|旺旺/.test(text)) {
        return text;
      }
    }
    // 方法5: 正则提取旗舰店等模式
    const containerText = container.textContent || '';
    const shopMatch = containerText.match(/([\u4e00-\u9fa5]{2,15}(?:官方旗舰店|旗舰店|专卖店|专营店|自营店|体验店))/);
    if (shopMatch) return shopMatch[1];
    // 方法6: 找链接到店铺的 a 标签
    const shopLinks = container.querySelectorAll('a[href*="shop"], a[href*="store"]');
    for (const a of shopLinks) {
      const text = cleanShopName(a.textContent || '');
      if (text.length >= 2 && text.length <= 30 && !/旺旺|在线/.test(text)) return text;
    }
    return '';
  }

  function extractProductIdFromHref(href) {
    const match = (href || '').match(/[?&](?:id|itemId|item_id|auctionId|nid)=(\d+)/i);
    return match ? match[1] : '';
  }

  function extractProductId(el, container) {
    const attrNames = ['data-item', 'data-item-id', 'data-itemid', 'data-id', 'data-nid', 'data-auction-id'];
    for (const target of [el, container]) {
      if (!target) continue;
      for (const attr of attrNames) {
        const value = target.getAttribute?.(attr);
        if (/^\d{6,}$/.test(value || '')) return value;
      }
      const child = target.querySelector?.(attrNames.map(attr => `[${attr}]`).join(','));
      if (child) {
        for (const attr of attrNames) {
          const value = child.getAttribute(attr);
          if (/^\d{6,}$/.test(value || '')) return value;
        }
      }
    }

    const href = el?.href || el?.closest?.('a')?.href || '';
    return extractProductIdFromHref(href);
  }

  function findProductContainer(candidateEl) {
    let container = null;
    const selfText = candidateEl.textContent || '';
    if (/[¥￥]?\s*\d+\.?\d*/.test(selfText) && candidateEl.querySelector?.('img')) {
      container = candidateEl;
    }
    if (!container) {
      let el = candidateEl.parentElement;
      for (let depth = 0; depth < 8 && el && el !== document.body; depth++) {
        const text = el.textContent || '';
        const hasPrice = /[¥￥]?\s*\d+\.?\d*/.test(text);
        const hasImg = !!el.querySelector('img');
        const hasFlashSale = text.includes(FLASH_SALE_TEXT);
        const hasProductId = !!extractProductId(candidateEl, el);
        if (hasImg && hasPrice && (hasFlashSale || hasProductId)) {
          container = el;
          break;
        }
        el = el.parentElement;
      }
    }
    return container || candidateEl.parentElement;
  }

  function findProductCandidates() {
    const selectors = [
      'a[href*="item.taobao.com"]',
      'a[href*="detail.tmall.com"]',
      'a[href*="item.htm?id="]',
      'a[href*="detail.htm?id="]',
      'a[href*="itemId="]',
      'a[href*="item_id="]',
      '[data-item]',
      '[data-item-id]',
      '[data-itemid]',
      '[data-nid]',
      '[data-auction-id]',
    ];

    const candidates = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => candidates.add(el));
    }
    return candidates;
  }

  // ==================== 核心提取 ====================

  function isShopMatchKeyword(shop, title, keyword) {
    if (!keyword) return true; // 没有关键词则不过滤
    const kw = keyword.toLowerCase().trim();
    const shopLower = (shop || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();

    // 移除常见的店铺后缀进行比较
    const cleanShop = shopLower.replace(/官方旗舰店|旗舰店|专卖店|专营店|自营店|体验店/g, '');
    const cleanKw = kw.replace(/官方旗舰店|旗舰店|专卖店|专营店|自营店|体验店/g, '');

    // 店铺名包含关键词（精确匹配）
    if (cleanShop.includes(cleanKw) || cleanKw.includes(cleanShop)) {
      return true;
    }

    // 标题中包含店铺名关键词（用于匹配店铺名在标题中的情况）
    // 但要求关键词长度 >= 2，避免太短的关键词误匹配
    if (cleanKw.length >= 2 && titleLower.includes(cleanKw)) {
      return true;
    }

    return false;
  }

  function extractProducts(storeKeyword) {
    // 1. 查找所有商品候选节点：商品直链 + 淘宝广告卡片里的 data-item
    const allLinks = findProductCandidates();

    // 找到推荐区域的边界，排除推荐商品
    // 使用 TreeWalker 遍历文本节点，精确匹配分隔文字
    let recommendSeparator = null;
    let recommendSeparatorY = Infinity;

    // 先找到所有商品链接的 Y 坐标范围
    let firstLinkY = Infinity;
    let lastLinkY = 0;
    for (const linkEl of allLinks) {
      const rect = linkEl.getBoundingClientRect();
      const y = rect.top + window.scrollY;
      if (y < firstLinkY) firstLinkY = y;
      if (y > lastLinkY) lastLinkY = y;
    }
    console.log(`[淘宝秒杀采集] 商品链接 Y 范围: ${firstLinkY} - ${lastLinkY}`);

    // 查找所有分隔文字，记录最靠上的那个（在商品列表中间或之前的分隔文字）
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = (node.textContent || '').trim();
      if (text === '相关商品较少，为您推荐以下商品' || text === '为您推荐以下商品') {
        // 获取分隔文字在页面中的位置
        const range = document.createRange();
        range.selectNode(node);
        const rect = range.getBoundingClientRect();
        const y = rect.top + window.scrollY;

        console.log(`[淘宝秒杀采集] 找到分隔文字 Y: ${y}`);

        // 记录最靠上的分隔文字（在商品列表中间的）
        if (y < recommendSeparatorY) {
          recommendSeparator = node;
          recommendSeparatorY = y;
        }
      }
    }

    const seen = new Map();

    console.log(`[淘宝秒杀采集] 找到 ${allLinks.size} 个商品链接`);
    console.log(`[淘宝秒杀采集] 推荐分隔文字: ${recommendSeparator ? '找到' : '未找到'}, Y坐标: ${recommendSeparatorY}`);

    // 预先查找页面中所有包含"正在秒杀"的元素
    const flashElements = findAllFlashSaleElements();
    console.log(`[淘宝秒杀采集] 找到 ${flashElements.length} 个秒杀元素`);

    for (const linkEl of allLinks) {
      // 跳过推荐区域内的链接：如果分隔文字存在，检查链接是否在分隔文字之后
      if (recommendSeparator) {
        // 获取链接在页面中的位置
        const linkRect = linkEl.getBoundingClientRect();
        const linkY = linkRect.top + window.scrollY;

        // 如果链接在分隔文字之后或同一行，跳过（推荐区域）
        if (linkY >= recommendSeparatorY) {
          console.log(`[淘宝秒杀采集] 跳过推荐区域链接: ${(linkEl.href || '').substring(0, 50)} (Y: ${linkY} >= ${recommendSeparatorY})`);
          continue;
        }
      }

      // 找卡片容器：先检查 linkEl 本身（淘宝 <a> 包裹整个卡片），
      // 再向上遍历父级
      const container = findProductContainer(linkEl);
      if (!container) continue;

      const href = linkEl.href || linkEl.closest?.('a')?.href || '';

      // 提取商品 ID
      const productId = extractProductId(linkEl, container);
      if (!productId) continue;
      if (seen.has(productId)) continue;

      // 提取标题
      let title = linkEl.getAttribute('title')
        || linkEl.querySelector('img')?.getAttribute('alt')
        || '';
      if (!title || title.length < 5) {
        const textNodes = container.querySelectorAll('[class*="title"], [class*="Title"], h3, h4');
        for (const node of Array.from(textNodes)) {
          const t = node.textContent?.trim() || '';
          if (t.length > title.length) title = t;
        }
      }
      if (!title || title.length < 3) {
        title = linkEl.textContent?.trim() || '';
      }

      // 提取价格
      const price = extractCurrentPrice(container);
      const originalPrice = extractOriginalPrice(container);

      // 提取图片
      const img = container.querySelector('img');
      let image = img?.getAttribute('src')
        || img?.getAttribute('data-src')
        || img?.getAttribute('data-lazy-src')
        || img?.getAttribute('data-ks-lazyload')
        || '';
      if (image.startsWith('//')) image = 'https:' + image;

      // 提取库存和销量
      const containerText = container.textContent || '';
      const quantity = extractQuantity(containerText);
      const sold = extractSold(containerText);

      // 平台
      const platform = href.includes('tmall.com') ? 'tmall' : 'taobao';
      let normalizedLink = href.startsWith('//') ? 'https:' + href : href;
      if (!extractProductIdFromHref(normalizedLink)) {
        normalizedLink = `https://item.taobao.com/item.htm?id=${productId}`;
      }

      // 品类/品牌/规格
      const category = extractCategory(title);
      const brand = extractBrand(title);
      const volume = extractVolume(title);

      // 提取店铺名
      const shop = extractShopName(container);

      // 验证是否属于秒杀商品
      const flashCheck = isFlashSaleProduct(container, linkEl, flashElements);

      console.log(`[淘宝秒杀采集] 商品: ${title.substring(0, 30)}... | 秒杀: ${flashCheck.match} | 原因: ${flashCheck.reason || '无'}`);

      const candidate = {
        id: productId,
        title: title.substring(0, 200),
        price,
        originalPrice,
        quantity,
        sold,
        link: normalizedLink,
        image,
        platform,
        shop,
        category,
        brand,
        volume,
        isFlashSale: flashCheck.match,
        flashSaleReason: flashCheck.reason || '',
        searchKeyword: storeKeyword || '',
        collectedAt: new Date().toISOString(),
      };

      const existing = seen.get(productId);
      if (!existing || isBetterProduct(candidate, existing)) {
        seen.set(productId, candidate);
      }
    }

    // 1. 智能去重  2. 秒杀商品 + 店铺名联合过滤
    const allProducts = Array.from(seen.values());
    const deduped = deduplicateProducts(allProducts);

    // 调试日志
    console.log(`[淘宝秒杀采集] 总商品数: ${allProducts.length}, 去重后: ${deduped.length}`);
    console.log('[淘宝秒杀采集] 所有商品:', deduped.map(p => ({
      title: p.title.substring(0, 30),
      shop: p.shop,
      isFlashSale: p.isFlashSale,
      flashSaleReason: p.flashSaleReason
    })));

    // 第一步：只保留秒杀商品（有"正在秒杀"标记的商品）
    const flashSaleProducts = deduped.filter(p => p.isFlashSale);
    console.log(`[淘宝秒杀采集] 秒杀商品数: ${flashSaleProducts.length}`);

    if (!storeKeyword) {
      // 没有搜索关键词：返回所有秒杀商品
      return flashSaleProducts;
    }

    // 第二步：在秒杀商品中，筛选出符合店铺搜索关键词的商品
    const filtered = flashSaleProducts.filter(p => {
      return isShopMatchKeyword(p.shop, p.title, storeKeyword);
    });
    console.log(`[淘宝秒杀采集] 店铺筛选后: ${filtered.length}`);
    return filtered;
  }

  // ==================== 自动滚动 ====================

  let autoScrollTimer = null;
  let lastCount = 0;
  let stableRounds = 0;
  let currentStoreFilter = '';
  let searchStoreKeyword = ''; // 搜索关键词，用于店铺关联验证

  function autoScrollStep(callback) {
    window.scrollBy(0, window.innerHeight);
    setTimeout(() => {
      let products = extractProducts(searchStoreKeyword);
      if (currentStoreFilter) {
        const kw = currentStoreFilter.toLowerCase();
        products = products.filter(p => (p.shop || '').toLowerCase().includes(kw) || (p.title || '').toLowerCase().includes(kw));
      }
      const currentCount = products.length;

      if (currentCount > lastCount) {
        lastCount = currentCount;
        stableRounds = 0;
        callback({ products, status: 'scrolling', total: currentCount });
        autoScrollTimer = setTimeout(() => autoScrollStep(callback), 1500);
      } else {
        stableRounds++;
        if (stableRounds >= 3) {
          callback({ products, status: 'done', total: currentCount });
          autoScrollTimer = null;
        } else {
          callback({ products, status: 'scrolling', total: currentCount });
          autoScrollTimer = setTimeout(() => autoScrollStep(callback), 1500);
        }
      }
    }, 1500);
  }

  function startAutoScroll(sendResponse, storeFilter) {
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }
    lastCount = 0;
    stableRounds = 0;
    currentStoreFilter = storeFilter || '';
    if (storeFilter) searchStoreKeyword = storeFilter;

    // 先提取一次
    let products = extractProducts(searchStoreKeyword);
    if (currentStoreFilter) {
      const kw = currentStoreFilter.toLowerCase();
      products = products.filter(p => (p.shop || '').toLowerCase().includes(kw) || (p.title || '').toLowerCase().includes(kw));
    }
    lastCount = products.length;
    sendResponse({ products, status: 'started', total: lastCount });

    // 开始自动滚动
    autoScrollTimer = setTimeout(() => autoScrollStep((data) => {
      // 通知 popup 更新状态
      chrome.runtime.sendMessage({ type: 'scrollUpdate', ...data }).catch(() => {});
    }), 1500);
  }

  function stopAutoScroll(sendResponse) {
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }
    const products = extractProducts(searchStoreKeyword);
    sendResponse({ products, status: 'stopped', total: products.length });
  }

  // ==================== 消息监听 ====================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'extract': {
        if (message.storeKeyword) searchStoreKeyword = message.storeKeyword;
        let products = extractProducts(searchStoreKeyword);
        if (message.storeFilter) {
          currentStoreFilter = message.storeFilter.trim();
          const kw = currentStoreFilter.toLowerCase();
          products = products.filter(p => (p.shop || '').toLowerCase().includes(kw) || (p.title || '').toLowerCase().includes(kw));
        }
        sendResponse({ products, total: products.length });
        break;
      }
      case 'startAutoScroll': {
        currentStoreFilter = message.storeFilter || '';
        startAutoScroll(sendResponse, currentStoreFilter);
        break;
      }
      case 'stopAutoScroll': {
        stopAutoScroll(sendResponse);
        break;
      }
      case 'ping': {
        sendResponse({ ok: true });
        break;
      }
      case 'clickFlashSaleFilter': {
        if (message.storeKeyword) searchStoreKeyword = message.storeKeyword;
        const result = clickFlashSaleFilter();
        sendResponse(result);
        break;
      }
      default:
        sendResponse({ error: 'unknown action' });
    }
    return true; // 保持 sendResponse 通道
  });

  console.log('[淘宝秒杀采集] content.js 已加载');
})();
