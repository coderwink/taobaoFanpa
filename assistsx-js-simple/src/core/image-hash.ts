// 图像感知哈希工具
// 用于检测 Swiper 页面是否重复

/**
 * 计算图片的感知哈希 (pHash)
 * 流程: 加载图片 → 缩放到 8x8 → 灰度化 → 计算均值 → 生成 64-bit 二进制 → 转十六进制
 */
export async function computePHash(base64: string): Promise<string> {
  // 1. 加载 base64 图片到 Image 元素
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (e) => reject(new Error('图片加载失败: ' + e));
    // 兼容有无 data URI 前缀
    image.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  });

  // 2. 绘制到 8x8 画布并获取灰度像素
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');

  ctx.drawImage(img, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  const pixels = imageData.data; // RGBA 格式，每个像素 4 字节

  // 3. 转为灰度值数组并计算均值
  const grayValues: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    // 标准灰度权重: R*0.299 + G*0.587 + B*0.114
    const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    grayValues.push(gray);
  }

  const avg = grayValues.reduce((sum, v) => sum + v, 0) / grayValues.length;

  // 4. 生成二进制 hash：像素 > 均值为 '1'，否则 '0'
  let binaryHash = '';
  for (const v of grayValues) {
    binaryHash += v > avg ? '1' : '0';
  }

  // 5. 二进制转十六进制（每 4 位一组）
  let hexHash = '';
  for (let i = 0; i < binaryHash.length; i += 4) {
    const nibble = binaryHash.substring(i, i + 4);
    hexHash += parseInt(nibble, 2).toString(16);
  }

  return hexHash;
}

/**
 * 计算两个哈希之间的汉明距离
 * 汉明距离 = 对应位不同的数量
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    // 长度不同时按较短的比较，差异部分算作不同
    const maxLen = Math.max(hash1.length, hash2.length);
    const minLen = Math.min(hash1.length, hash2.length);
    let distance = maxLen - minLen; // 长度差直接算作差异

    // 将十六进制转回二进制比较
    const bin1 = hexToBinary(hash1.substring(0, minLen));
    const bin2 = hexToBinary(hash2.substring(0, minLen));
    for (let i = 0; i < bin1.length; i++) {
      if (bin1[i] !== bin2[i]) distance++;
    }
    return distance;
  }

  // 长度相同，逐位比较二进制
  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);
  let distance = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) distance++;
  }
  return distance;
}

/**
 * 判断两张图片是否相似
 * @param threshold 汉明距离阈值，默认 10（64-bit hash 中容差约 15.6%）
 */
export function isSimilar(hash1: string, hash2: string, threshold: number = 10): boolean {
  return hammingDistance(hash1, hash2) < threshold;
}

/** 十六进制字符串转二进制字符串 */
function hexToBinary(hex: string): string {
  let binary = '';
  for (const ch of hex) {
    binary += parseInt(ch, 16).toString(2).padStart(4, '0');
  }
  return binary;
}
