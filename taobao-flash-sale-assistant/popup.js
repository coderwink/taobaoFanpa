// popup.js — 插件弹窗逻辑

let collectedProducts = [];
let isAutoScrolling = false;

// ==================== DOM 元素 ====================

const statusBadge = document.getElementById('status-badge');
const pageInfo = document.getElementById('page-info');
const pageUrl = document.getElementById('page-url');
const btnExtract = document.getElementById('btn-extract');
const btnAuto = document.getElementById('btn-auto');
const btnStop = document.getElementById('btn-stop');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const productCount = document.getElementById('product-count');
const productList = document.getElementById('product-list');
const productItems = document.getElementById('product-items');
const exportBar = document.getElementById('export-bar');
const hint = document.getElementById('hint');
const btnSearch = document.getElementById('btn-search');
const btnSearchSubsidy = document.getElementById('btn-search-subsidy');
const storeInput = document.getElementById('store-input');
const btnCopyJson = document.getElementById('btn-copy-json');

// ==================== 页面检测 ====================

async function checkPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';

    if (url.includes('taobao.com') || url.includes('tmall.com')) {
      statusBadge.textContent = '已连接';
      statusBadge.className = 'badge badge-connected';
      pageInfo.classList.remove('hidden');
      pageUrl.textContent = url.length > 60 ? url.substring(0, 60) + '...' : url;
      btnExtract.disabled = false;
      btnAuto.disabled = false;
      hint.classList.add('hidden');

      // 检查 content script 是否已加载
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch {
        // content script 未加载，尝试注入
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      }
    } else {
      statusBadge.textContent = '非淘宝页面';
      statusBadge.className = 'badge badge-idle';
      hint.textContent = '请打开淘宝搜索页面后重试';
    }
  } catch (err) {
    console.error('页面检测失败:', err);
  }
}

// ==================== 发送消息 ====================

async function sendMessageToContent(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('未找到当前标签页');
  return chrome.tabs.sendMessage(tab.id, message);
}

// ==================== 采集 ====================

async function extract() {
  btnExtract.disabled = true;
  statusBadge.textContent = '采集中...';
  statusBadge.className = 'badge badge-scraping';
  statusText.textContent = '正在提取商品数据...';
  statusBar.classList.remove('hidden');

  try {
    const storeFilter = storeInput.value.trim();
    const response = await sendMessageToContent({ action: 'extract', storeFilter, storeKeyword: storeFilter });
    collectedProducts = response.products || [];
    updateUI(response.total || 0, `采集完成 ${collectedProducts.length} 件`);
  } catch (err) {
    statusText.textContent = '采集失败: ' + err.message;
    statusBadge.textContent = '错误';
    statusBadge.className = 'badge badge-idle';
  } finally {
    btnExtract.disabled = false;
  }
}

async function startAutoScroll() {
  btnAuto.classList.add('hidden');
  btnStop.classList.remove('hidden');
  btnExtract.disabled = true;
  isAutoScrolling = true;

  statusBadge.textContent = '自动采集中';
  statusBadge.className = 'badge badge-scraping';
  statusText.textContent = '正在自动滚动采集...';
  statusBar.classList.remove('hidden');

  try {
    const storeFilter = storeInput.value.trim();
    const response = await sendMessageToContent({ action: 'startAutoScroll', storeFilter, storeKeyword: storeFilter });
    collectedProducts = response.products || [];
    const flashCount = collectedProducts.filter(p => p.isFlashSale).length;
    updateUI(response.total || 0, `自动滚动中，秒杀 ${flashCount} 件`);
  } catch (err) {
    statusText.textContent = '启动失败: ' + err.message;
    stopAutoScroll();
  }
}

async function stopAutoScroll() {
  try {
    const response = await sendMessageToContent({ action: 'stopAutoScroll' });
    collectedProducts = response.products || [];
    updateUI(response.total || 0, '已停止');
  } catch {}

  btnStop.classList.add('hidden');
  btnAuto.classList.remove('hidden');
  btnExtract.disabled = false;
  isAutoScrolling = false;
  statusBadge.textContent = '已完成';
  statusBadge.className = 'badge badge-done';
}

// ==================== UI 更新 ====================

function updateUI(count, text) {
  productCount.textContent = count + ' 件商品';
  statusText.textContent = text;
  statusBar.classList.remove('hidden');

  if (collectedProducts.length > 0) {
    productList.classList.remove('hidden');
    exportBar.classList.remove('hidden');
    renderProducts();
  }
}

function renderProducts() {
  productItems.innerHTML = '';
  for (const p of collectedProducts.slice(0, 50)) {
    const div = document.createElement('div');
    div.className = 'product-item';

    const imgSrc = p.image ? (p.image.startsWith('//') ? 'https:' + p.image : p.image) : '';
    const priceStr = p.price > 0 ? `¥${p.price}` : '';
    const origStr = p.originalPrice > 0 ? `<span class="product-original-price">¥${p.originalPrice}</span>` : '';
    const tag = p.platform === 'tmall' ? '<span class="product-tag">天猫</span>' : '';
    const flashTag = p.isFlashSale ? '<span class="product-tag" style="background:#ff4400;color:#fff">秒杀</span>' : '';
    const subsidyTag = p.isSubsidy ? '<span class="product-tag" style="background:#ff4d4f;color:#fff">百亿补贴</span>' : '';
    const shopTag = p.shop ? `<span class="product-tag" style="background:#f0f0f0;color:#333">${escapeHtml(p.shop)}</span>` : '';
    const quantityStr = p.quantity >= 0 ? `<span class="product-tag" style="background:#e6f7ff;color:#1890ff">库存${p.quantity}</span>` : '';
    const soldStr = p.sold >= 0 ? `<span class="product-tag" style="background:#f6ffed;color:#52c41a">已售${p.sold}</span>` : '';

    div.innerHTML = `
      ${imgSrc ? `<img class="product-img" src="${imgSrc}" alt="" loading="lazy">` : '<div class="product-img"></div>'}
      <div class="product-info">
        <div class="product-title">${escapeHtml(p.title)}</div>
        <div class="product-meta">
          <span class="product-price">${priceStr}</span>
          ${origStr}
          ${flashTag}
          ${subsidyTag}
          ${shopTag}
          ${quantityStr}
          ${soldStr}
          <span class="product-id">ID: ${p.id}</span>
          ${tag}
        </div>
      </div>
    `;
    productItems.appendChild(div);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 导出 ====================

function copyJSON() {
  // 按店铺分组
  const grouped = {};
  for (const p of collectedProducts) {
    const shop = p.shop || '未知店铺';
    if (!grouped[shop]) {
      grouped[shop] = [];
    }
    grouped[shop].push(p);
  }

  const output = {
    total: collectedProducts.length,
    shopCount: Object.keys(grouped).length,
    collectedAt: new Date().toISOString(),
    shops: Object.entries(grouped).map(([shop, products]) => ({
      shop,
      count: products.length,
      products,
    })),
  };

  const data = JSON.stringify(output, null, 2);
  navigator.clipboard.writeText(data).then(() => {
    statusText.textContent = '已复制 ' + collectedProducts.length + ' 条商品 JSON 到剪贴板';
    statusBar.classList.remove('hidden');
  }).catch(() => {
    statusText.textContent = '复制失败';
    statusBar.classList.remove('hidden');
  });
}

function copyCSV() {
  if (collectedProducts.length === 0) {
    statusText.textContent = '没有可导出的数据';
    statusBar.classList.remove('hidden');
    return;
  }

  // 生成 HTML 表格，Excel 粘贴时自动识别列和格式
  const ths = ['商品ID', '商品标题', '售价', '原价', '库存', '已售', '平台', '店铺', '品牌', '分类', '关键词', '秒杀', '百亿补贴', '链接', '图片', '采集时间'];
  const trs = collectedProducts.map(p => {
    const tds = [
      p.id, p.title, p.price, p.originalPrice, p.quantity, p.sold,
      p.platform === 'tmall' ? '天猫' : '淘宝',
      p.shop, p.brand, p.category, p.searchKeyword,
      p.isFlashSale ? '是' : '否',
      p.isSubsidy ? '是' : '否',
      p.link, p.image, p.collectedAt,
    ];
    return '<tr>' + tds.map((td, i) => {
      // 商品ID列：加 Excel 文本格式，防止科学计数法
      const style = i === 0 ? ` style="mso-number-format:'\\@'"` : '';
      return '<td' + style + '>' + escapeHtml(String(td ?? '')) + '</td>';
    }).join('') + '</tr>';
  }).join('');

  const html = '<table>'
    + '<tr>' + ths.map(h => '<th>' + h + '</th>').join('') + '</tr>'
    + trs
    + '</table>';

  // 同时写入 HTML 和纯文本，Excel 优先读 HTML
  const plainText = [ths.join('\t'), ...collectedProducts.map(p =>
    [p.id, p.title, p.price, p.originalPrice, p.quantity, p.sold,
      p.platform === 'tmall' ? '天猫' : '淘宝',
      p.shop, p.brand, p.category, p.searchKeyword,
      p.isFlashSale ? '是' : '否',
      p.isSubsidy ? '是' : '否',
      p.link, p.image, p.collectedAt,
    ].join('\t')
  )].join('\n');

  const blob = new Blob([html], { type: 'text/html' });
  const textBlob = new Blob([plainText], { type: 'text/plain' });
  const clipboardItem = new ClipboardItem({
    'text/html': blob,
    'text/plain': textBlob,
  });

  navigator.clipboard.write([clipboardItem]).then(() => {
    statusText.textContent = '已复制 ' + collectedProducts.length + ' 条到剪贴板，粘贴到 Excel 自动分列';
    statusBar.classList.remove('hidden');
  }).catch(() => {
    statusText.textContent = '复制失败';
    statusBar.classList.remove('hidden');
  });
}

function openInTab() {
  if (collectedProducts.length === 0) {
    statusText.textContent = '没有可导出的数据';
    statusBar.classList.remove('hidden');
    return;
  }

  // 按店铺分组
  const grouped = {};
  for (const p of collectedProducts) {
    const shop = p.shop || '未知店铺';
    if (!grouped[shop]) grouped[shop] = [];
    grouped[shop].push(p);
  }

  const shopCount = Object.keys(grouped).length;
  const timestamp = new Date().toLocaleString('zh-CN');

  let tableRows = '';
  let idx = 0;
  for (const [shop, products] of Object.entries(grouped)) {
    for (const p of products) {
      idx++;
      const flashTag = p.isFlashSale
        ? '<span style="color:#fff;background:#ff4d4f;padding:1px 6px;border-radius:3px;font-size:12px">秒杀</span>'
        : '';
      const subsidyTag = p.isSubsidy
        ? '<span style="color:#fff;background:#ff4d4f;padding:1px 6px;border-radius:3px;font-size:12px">百亿补贴</span>'
        : '';
      const platformTag = p.platform === 'tmall'
        ? '<span style="color:#fff;background:#1890ff;padding:1px 6px;border-radius:3px;font-size:12px">天猫</span>'
        : '';
      tableRows += `<tr>
        <td>${idx}</td>
        <td>${escapeHtml(shop)}</td>
        <td title="${escapeHtml(p.id)}">${escapeHtml(p.title)}</td>
        <td style="color:#ff4d4f;font-weight:bold">¥${p.price}</td>
        <td style="color:#999;text-decoration:line-through">¥${p.originalPrice}</td>
        <td>${p.quantity}</td>
        <td>${p.sold}</td>
        <td>${platformTag} ${flashTag} ${subsidyTag}</td>
        <td>${escapeHtml(p.brand || '')}</td>
        <td><a href="${p.link}" target="_blank" style="color:#1890ff">查看</a></td>
      </tr>`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>商品数据 - ${timestamp}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
    .header { background: #fff; padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { font-size: 18px; color: #333; margin-bottom: 8px; }
    .meta { font-size: 13px; color: #666; display: flex; gap: 20px; }
    .meta span { display: inline-flex; align-items: center; gap: 4px; }
    .meta strong { color: #ff4d4f; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #fafafa; padding: 10px 12px; text-align: left; font-size: 13px; color: #666; border-bottom: 1px solid #f0f0f0; white-space: nowrap; }
    td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #333; }
    tr:hover td { background: #fafafa; }
    a { text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>淘宝商品数据</h1>
    <div class="meta">
      <span>商品总数: <strong>${collectedProducts.length}</strong> 件</span>
      <span>店铺数: <strong>${shopCount}</strong> 家</span>
      <span>采集时间: ${timestamp}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>店铺</th><th>商品</th><th>售价</th><th>原价</th><th>库存</th><th>已售</th><th>状态</th><th>品牌</th><th>链接</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url });

  statusText.textContent = '已在新标签页打开数据';
  statusBar.classList.remove('hidden');
}

// ==================== 监听滚动更新 ====================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'scrollUpdate') {
    collectedProducts = message.products || [];
    updateUI(message.total || 0,
      message.status === 'done' ? `采集完成 ${collectedProducts.length} 件` : `已滚动 ${collectedProducts.length} 件`
    );
    if (message.status === 'done') {
      btnStop.classList.add('hidden');
      btnAuto.classList.remove('hidden');
      btnExtract.disabled = false;
      isAutoScrolling = false;
      statusBadge.textContent = '已完成';
      statusBadge.className = 'badge badge-done';
    }
  }
});

// ==================== 店铺搜索 + 秒杀筛选 ====================

// 点击百亿补贴筛选按钮
async function clickSubsidyFilterWithRetry(tabId, storeKeyword, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'clickSubsidyFilter', storeKeyword });
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// 采集单个店铺的百亿补贴商品
async function collectStoreSubsidyProducts(tabId, storeName) {
  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(storeName)}`;

  // 跳转到搜索页
  await chrome.tabs.update(tabId, { url: searchUrl });
  await waitForPageLoad(tabId);
  await new Promise(r => setTimeout(r, 5000)); // 等页面渲染

  // 确保 content script 已注入
  const injected = await ensureContentScript(tabId);
  if (!injected) throw new Error('注入 content script 失败');

  // 点击百亿补贴筛选
  const filterRes = await clickSubsidyFilterWithRetry(tabId, storeName);

  // 如果没有找到百亿补贴筛选按钮，说明该店铺没有百亿补贴商品，直接返回空结果
  if (!filterRes?.clicked) {
    return {
      store: storeName,
      products: [],
      filterClicked: false,
      noSubsidy: true,
    };
  }

  // 等待筛选生效
  await new Promise(r => setTimeout(r, 3000));

  // 提取商品
  const products = await chrome.tabs.sendMessage(tabId, {
    action: 'extract',
    storeFilter: storeName,
    storeKeyword: storeName,
  });

  return {
    store: storeName,
    products: products.products || [],
    filterClicked: true,
  };
}

// 批量采集多个店铺的百亿补贴商品
async function batchCollectSubsidyStores(storeNames) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('未找到当前标签页');

  const allProducts = [];
  const results = [];

  for (let i = 0; i < storeNames.length; i++) {
    const storeName = storeNames[i];
    statusText.textContent = `(${i + 1}/${storeNames.length}) 正在采集: ${storeName}`;
    statusBadge.textContent = '采集中';
    statusBadge.className = 'badge badge-scraping';
    pageInfo.classList.remove('hidden');
    pageUrl.textContent = `第 ${i + 1} 个店铺: ${storeName}`;

    try {
      const result = await collectStoreSubsidyProducts(tab.id, storeName);
      results.push(result);
      allProducts.push(...result.products);
      if (result.noSubsidy) {
        statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: 无百亿补贴商品`;
      } else {
        statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: ${result.products.length} 件`;
      }
    } catch (err) {
      results.push({ store: storeName, products: [], error: err.message });
      statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: 失败 - ${err.message}`;
    }

    // 店铺之间间隔一下
    if (i < storeNames.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { allProducts, results };
}

// 搜索百亿补贴
async function searchSubsidy() {
  const inputValue = storeInput.value.trim();
  if (!inputValue) {
    statusText.textContent = '请输入店铺名';
    statusBar.classList.remove('hidden');
    return;
  }

  // 检查是否是批量模式（包含 | 分隔符）
  const storeNames = inputValue.split('|').map(s => s.trim()).filter(s => s);

  btnSearchSubsidy.disabled = true;
  btnSearchSubsidy.textContent = '搜索中...';
  statusBar.classList.remove('hidden');

  try {
    if (storeNames.length > 1) {
      // 批量模式
      btnSearchSubsidy.textContent = `批量采集 (${storeNames.length})`;
      const { allProducts, results } = await batchCollectSubsidyStores(storeNames);

      collectedProducts = allProducts;
      const successCount = results.filter(r => !r.error && !r.noSubsidy).length;
      const noSubsidyCount = results.filter(r => r.noSubsidy).length;
      const failCount = results.filter(r => r.error).length;
      updateUI(allProducts.length, `批量完成: ${successCount} 有百亿补贴, ${noSubsidyCount} 无百亿补贴, ${failCount} 失败`);

      // 显示各店铺结果摘要
      const summary = results.map(r => {
        if (r.error) return `${r.store}: 失败`;
        if (r.noSubsidy) return `${r.store}: 无百亿补贴`;
        return `${r.store}: ${r.products.length}件`;
      }).join(' | ');
      pageUrl.textContent = summary;
    } else {
      // 单店铺模式
      const storeName = storeNames[0];
      statusText.textContent = `正在采集: ${storeName}...`;
      statusBadge.textContent = '跳转中';
      statusBadge.className = 'badge badge-scraping';

      const result = await collectStoreSubsidyProducts(
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id,
        storeName
      );

      collectedProducts = result.products;
      if (result.noSubsidy) {
        updateUI(0, `${storeName}: 无百亿补贴商品`);
      } else {
        updateUI(result.products.length, `${storeName}: ${result.products.length} 件`);
      }
    }

    hint.classList.add('hidden');
    pageInfo.classList.remove('hidden');
    btnExtract.disabled = false;
    btnAuto.disabled = false;
  } catch (err) {
    statusText.textContent = '采集失败: ' + err.message;
    statusBadge.textContent = '错误';
    statusBadge.className = 'badge badge-idle';
  } finally {
    btnSearchSubsidy.disabled = false;
    btnSearchSubsidy.textContent = '搜索百亿补贴';
  }
}

// 等待页面加载完成
function waitForPageLoad(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeout);
  });
}

// 确保 content script 已注入
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      await new Promise(r => setTimeout(r, 2000));
      return true;
    } catch {
      return false;
    }
  }
}

// 点击秒杀筛选按钮
async function clickFlashSaleFilterWithRetry(tabId, storeKeyword, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { action: 'clickFlashSaleFilter', storeKeyword });
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// 采集单个店铺的秒杀商品
async function collectStoreProducts(tabId, storeName) {
  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(storeName)}`;

  // 跳转到搜索页
  await chrome.tabs.update(tabId, { url: searchUrl });
  await waitForPageLoad(tabId);
  await new Promise(r => setTimeout(r, 5000)); // 等页面渲染

  // 确保 content script 已注入
  const injected = await ensureContentScript(tabId);
  if (!injected) throw new Error('注入 content script 失败');

  // 点击秒杀筛选
  const filterRes = await clickFlashSaleFilterWithRetry(tabId, storeName);

  // 如果没有找到秒杀筛选按钮，说明该店铺没有秒杀商品，直接返回空结果
  if (!filterRes?.clicked) {
    return {
      store: storeName,
      products: [],
      filterClicked: false,
      noFlashSale: true,
    };
  }

  // 等待筛选生效
  await new Promise(r => setTimeout(r, 3000));

  // 提取商品
  const products = await chrome.tabs.sendMessage(tabId, {
    action: 'extract',
    storeFilter: storeName,
    storeKeyword: storeName,
  });

  return {
    store: storeName,
    products: products.products || [],
    filterClicked: true,
  };
}

// 批量采集多个店铺
async function batchCollectStores(storeNames) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('未找到当前标签页');

  const allProducts = [];
  const results = [];

  for (let i = 0; i < storeNames.length; i++) {
    const storeName = storeNames[i];
    statusText.textContent = `(${i + 1}/${storeNames.length}) 正在采集: ${storeName}`;
    statusBadge.textContent = '采集中';
    statusBadge.className = 'badge badge-scraping';
    pageInfo.classList.remove('hidden');
    pageUrl.textContent = `第 ${i + 1} 个店铺: ${storeName}`;

    try {
      const result = await collectStoreProducts(tab.id, storeName);
      results.push(result);
      allProducts.push(...result.products);
      if (result.noFlashSale) {
        statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: 无秒杀商品`;
      } else {
        statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: ${result.products.length} 件`;
      }
    } catch (err) {
      results.push({ store: storeName, products: [], error: err.message });
      statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: 失败 - ${err.message}`;
    }

    // 店铺之间间隔一下
    if (i < storeNames.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { allProducts, results };
}

// 单店铺采集（原有逻辑）
async function searchFlashSale() {
  const inputValue = storeInput.value.trim();
  if (!inputValue) {
    statusText.textContent = '请输入店铺名';
    statusBar.classList.remove('hidden');
    return;
  }

  // 检查是否是批量模式（包含 | 分隔符）
  const storeNames = inputValue.split('|').map(s => s.trim()).filter(s => s);

  btnSearch.disabled = true;
  btnSearch.textContent = '搜索中...';
  statusBar.classList.remove('hidden');
  btnCopyJson.disabled = true;

  try {
    if (storeNames.length > 1) {
      // 批量模式
      btnSearch.textContent = `批量采集 (${storeNames.length})`;
      const { allProducts, results } = await batchCollectStores(storeNames);

      collectedProducts = allProducts;
      const successCount = results.filter(r => !r.error && !r.noFlashSale).length;
      const noFlashCount = results.filter(r => r.noFlashSale).length;
      const failCount = results.filter(r => r.error).length;
      updateUI(allProducts.length, `批量完成: ${successCount} 有秒杀, ${noFlashCount} 无秒杀, ${failCount} 失败`);

      // 显示各店铺结果摘要
      const summary = results.map(r => {
        if (r.error) return `${r.store}: 失败`;
        if (r.noFlashSale) return `${r.store}: 无秒杀`;
        return `${r.store}: ${r.products.length}件`;
      }).join(' | ');
      pageUrl.textContent = summary;
    } else {
      // 单店铺模式
      const storeName = storeNames[0];
      statusText.textContent = `正在采集: ${storeName}...`;
      statusBadge.textContent = '跳转中';
      statusBadge.className = 'badge badge-scraping';

      const result = await collectStoreProducts(
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id,
        storeName
      );

      collectedProducts = result.products;
      if (result.noFlashSale) {
        updateUI(0, `${storeName}: 无秒杀商品`);
      } else {
        updateUI(result.products.length, `${storeName}: ${result.products.length} 件`);
      }
    }

    hint.classList.add('hidden');
    pageInfo.classList.remove('hidden');
    btnExtract.disabled = false;
    btnAuto.disabled = false;
    btnCopyJson.disabled = false;
  } catch (err) {
    statusText.textContent = '采集失败: ' + err.message;
    statusBadge.textContent = '错误';
    statusBadge.className = 'badge badge-idle';
  } finally {
    btnSearch.disabled = false;
    btnSearch.textContent = '搜索秒杀';
    btnCopyJson.disabled = false;
  }
}

// ==================== 事件绑定 ====================

btnExtract.addEventListener('click', extract);
btnAuto.addEventListener('click', startAutoScroll);
btnStop.addEventListener('click', stopAutoScroll);
btnSearch.addEventListener('click', searchFlashSale);
btnSearchSubsidy.addEventListener('click', searchSubsidy);
document.getElementById('btn-copy-json').addEventListener('click', copyJSON);
document.getElementById('btn-copy-csv').addEventListener('click', copyCSV);
document.getElementById('btn-open-tab').addEventListener('click', openInTab);

// ==================== 初始化 ====================

checkPage();
