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
    filterClicked: filterRes?.clicked || false,
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
      statusText.textContent = `(${i + 1}/${storeNames.length}) ${storeName}: ${result.products.length} 件`;
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
      const successCount = results.filter(r => !r.error).length;
      const failCount = results.filter(r => r.error).length;
      updateUI(allProducts.length, `批量完成: ${successCount} 成功, ${failCount} 失败`);

      // 显示各店铺结果摘要
      const summary = results.map(r =>
        r.error ? `${r.store}: 失败` : `${r.store}: ${r.products.length}件`
      ).join(' | ');
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
      updateUI(result.products.length, `${storeName}: ${result.products.length} 件`);
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
document.getElementById('btn-copy-json').addEventListener('click', copyJSON);

// ==================== 初始化 ====================

checkPage();
