// src/crawler/title-parser.ts
// 从淘宝商品标题中解析品类、品牌、规格等结构化信息

export interface ParsedTitle {
  category: string;       // 品类：洗发水、沐浴露等
  brand: string;          // 品牌：海飞丝、蓝月亮等
  volume: string;         // 规格/容量：750ml、500g等
  attributes: string[];   // 属性标签：去屑、滋润、控油等
}

// 品类关键词映射（按优先级排列，越前面优先级越高）
const CATEGORY_KEYWORDS: Record<string, string[]> = {
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
  '厨房清洁': ['厨房清洁', '油烟净', '去油剂', '厨房湿巾'],
  '地板清洁': ['地板清洁', '地板净', '拖地清洁'],
  '衣物清洁': ['衣物清洁', '去渍', '预涂剂'],
};

// 品牌关键词（常见日化品牌）
const BRAND_KEYWORDS: Record<string, string[]> = {
  // 洗发护发
  '海飞丝': ['海飞丝', 'HeadShoulders'],
  '潘婷': ['潘婷', 'Pantene'],
  '飘柔': ['飘柔', 'Rejoice'],
  '清扬': ['清扬', 'Clear'],
  '沙宣': ['沙宣', 'VS'],
  '施华蔻': ['施华蔻', 'Schwarzkopf'],
  '力士': ['力士', 'Lux'],
  '欧莱雅': ['欧莱雅', 'L\'Oreal'],
  '霸王': ['霸王'],
  '蜂花': ['蜂花'],
  '拉芳': ['拉芳'],
  '好迪': ['好迪'],
  '蒂花之秀': ['蒂花之秀'],
  '舒蕾': ['舒蕾'],
  '美涛': ['美涛'],
  // 沐浴身体
  '舒肤佳': ['舒肤佳', 'Safeguard'],
  '多芬': ['多芬', 'Dove'],
  '六神': ['六神'],
  '半亩花田': ['半亩花田'],
  '可悠然': ['可悠然', 'Kuyura'],
  '三豆': ['三豆'],
  // 洗衣
  '蓝月亮': ['蓝月亮'],
  '奥妙': ['奥妙', 'OMO'],
  '汰渍': ['汰渍', 'Tide'],
  '立白': ['立白'],
  '碧浪': ['碧浪', 'Ariel'],
  '雕牌': ['雕牌'],
  '超能': ['超能'],
  '浪奇': ['浪奇'],
  '白猫': ['白猫'],
  '妈妈壹选': ['妈妈壹选'],
  '金纺': ['金纺', 'Comfort'],
  // 口腔
  '高露洁': ['高露洁', 'Colgate'],
  '佳洁士': ['佳洁士', 'Crest'],
  '云南白药': ['云南白药'],
  '黑人': ['黑人', 'DARLIE', '好来'],
  '舒适达': ['舒适达', 'Sensodyne'],
  '冷酸灵': ['冷酸灵'],
  '两面针': ['两面针'],
  '狮王': ['狮王', 'LION'],
  // 清洁
  '威猛先生': ['威猛先生', 'Mr Muscle'],
  '花王': ['花王', 'Kao'],
  '碧丽珠': ['碧丽珠'],
  '妙洁': ['妙洁'],
  '维达': ['维达', 'Vinda'],
  '清风': ['清风'],
  '心相印': ['心相印'],
  '洁柔': ['洁柔'],
  '得宝': ['得宝', 'Tempo'],
  '德佑': ['德佑'],
  // 护肤
  '百雀羚': ['百雀羚'],
  '自然堂': ['自然堂'],
  '珀莱雅': ['珀莱雅'],
  '薇诺娜': ['薇诺娜'],
  '相宜本草': ['相宜本草'],
  '御泥坊': ['御泥坊'],
  '膜法世家': ['膜法世家'],
  '韩束': ['韩束'],
  '丸美': ['丸美'],
  '欧诗漫': ['欧诗漫'],
};

// 属性关键词
const ATTRIBUTE_KEYWORDS: string[] = [
  // 功效
  '去屑', '控油', '滋润', '保湿', '清爽', '柔顺', '修复', '强韧',
  '防脱', '固发', '生发', '蓬松', '顺滑', '亮泽', '滋养', '舒缓',
  '美白', '淡斑', '抗皱', '紧致', '抗敏', '温和', '深层清洁',
  '除菌', '抑菌', '杀菌', '消毒', '去污', '去渍', '去油',
  '除螨', '留香', '持久留香', '香氛', '清新',
  // 适用人群
  '男士', '女士', '儿童', '婴儿', '孕妇', '敏感肌', '油性', '干性',
  '中性', '混合性',
  // 成分
  '氨基酸', '玻尿酸', '烟酰胺', '水杨酸', '果酸', '维C', '维E',
  '茶树', '薄荷', '柠檬', '椰子', '燕麦', '芦荟', '蜂蜜',
  '牛奶', '乳木果', '橄榄', '樱花', '玫瑰',
  // 其他
  '家庭装', '大瓶装', '补充装', '替换装', '套装', '组合装',
  '便携装', '旅行装', '小样', '正品', '官方', '旗舰店',
];

/**
 * 从淘宝商品标题中解析结构化信息
 */
export function parseTitle(title: string): ParsedTitle {
  const result: ParsedTitle = {
    category: '',
    brand: '',
    volume: '',
    attributes: [],
  };

  if (!title) return result;

  // 1. 提取品牌：优先从【】中提取
  result.brand = extractBrandFromBrackets(title) || extractBrandFromText(title);

  // 2. 提取品类
  result.category = extractCategory(title);

  // 3. 提取规格/容量
  result.volume = extractVolume(title);

  // 4. 提取属性标签
  result.attributes = extractAttributes(title);

  return result;
}

/**
 * 从【品牌名】括号中提取品牌
 */
function extractBrandFromBrackets(title: string): string {
  // 匹配 【品牌】 或 [品牌] 或 〔品牌〕
  const bracketMatch = title.match(/[【\[]([^\]】]+)[】\]]/);
  if (bracketMatch) {
    const bracketContent = bracketMatch[1].trim();
    // 检查括号内容是否是已知品牌
    for (const [brand, aliases] of Object.entries(BRAND_KEYWORDS)) {
      if (aliases.some(alias => bracketContent.includes(alias))) {
        return brand;
      }
    }
    // 如果不是已知品牌，但括号内容较短（<6个字），可能是品牌名
    if (bracketContent.length <= 6 && bracketContent.length >= 2) {
      return bracketContent;
    }
  }
  return '';
}

/**
 * 从标题文本中匹配品牌
 */
function extractBrandFromText(title: string): string {
  for (const [brand, aliases] of Object.entries(BRAND_KEYWORDS)) {
    for (const alias of aliases) {
      if (title.includes(alias)) {
        return brand;
      }
    }
  }
  return '';
}

/**
 * 提取品类
 */
function extractCategory(title: string): string {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (title.includes(keyword)) {
        return category;
      }
    }
  }
  return '';
}

/**
 * 提取规格/容量
 */
function extractVolume(title: string): string {
  // 匹配各种容量格式
  const volumePatterns = [
    // ml 格式
    /(\d+(?:\.\d+)?)\s*(?:ml|ML|mL|亳升)/i,
    // L 格式
    /(\d+(?:\.\d+)?)\s*(?:L|l|升)/,
    // g 格式
    /(\d+(?:\.\d+)?)\s*(?:g|G|克)/,
    // kg 格式
    /(\d+(?:\.\d+)?)\s*(?:kg|KG|Kg|千克)/,
    // 片/包/抽 格式（面巾纸等）
    /(\d+)\s*(?:片|包|抽|帖|枚|个)/,
    // 瓶/支/管 格式
    /(\d+)\s*(?:瓶|支|管|条|盒|袋)/,
    // 组合格式：数字x数字
    /(\d+)\s*[x×*]\s*(\d+)\s*(ml|g|片|包|支|瓶|袋)/i,
  ];

  for (const pattern of volumePatterns) {
    const match = title.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return '';
}

/**
 * 提取属性标签
 */
function extractAttributes(title: string): string[] {
  const found: string[] = [];
  for (const attr of ATTRIBUTE_KEYWORDS) {
    if (title.includes(attr) && !found.includes(attr)) {
      found.push(attr);
    }
  }
  return found;
}
