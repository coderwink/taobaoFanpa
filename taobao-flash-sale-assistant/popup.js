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

function exportJSON() {
  const data = JSON.stringify(collectedProducts, null, 2);
  downloadFile(data, 'taobao-products.json', 'application/json');
}

function exportCSV() {
  const header = '商品ID,商品名称,现价,原价,店铺,搜索关键词,秒杀,秒杀原因,品类,品牌,规格,库存,已售,平台,链接,采集时间';
  const rows = collectedProducts.map(p => {
    return [
      p.id,
      `"${(p.title || '').replace(/"/g, '""')}"`,
      p.price,
      p.originalPrice,
      `"${(p.shop || '').replace(/"/g, '""')}"`,
      `"${(p.searchKeyword || '').replace(/"/g, '""')}"`,
      p.isFlashSale ? '是' : '否',
      `"${(p.flashSaleReason || '').replace(/"/g, '""')}"`,
      p.category,
      p.brand,
      p.volume,
      p.quantity >= 0 ? p.quantity : '',
      p.sold >= 0 ? p.sold : '',
      p.platform,
      p.link,
      p.collectedAt,
    ].join(',');
  });
  const csv = '\uFEFF' + [header, ...rows].join('\n');
  downloadFile(csv, 'taobao-products.csv', 'text/csv;charset=utf-8');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify',
  }, (downloadId) => {
    if (chrome.runtime.lastError || !downloadId) {
      statusText.textContent = '导出失败: ' + (chrome.runtime.lastError?.message || '未知错误');
      statusBar.classList.remove('hidden');
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

function copyJSON() {
  const data = JSON.stringify(collectedProducts, null, 2);
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

async function searchFlashSale() {
  const storeName = storeInput.value.trim();
  if (!storeName) {
    statusText.textContent = '请输入店铺名';
    statusBar.classList.remove('hidden');
    return;
  }

  btnSearch.disabled = true;
  btnSearch.textContent = '搜索中...';
  statusBadge.textContent = '跳转中';
  statusBadge.className = 'badge badge-scraping';
  statusText.textContent = '正在打开淘宝搜索页...';
  statusBar.classList.remove('hidden');

  const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(storeName)}`;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.update(tab.id, { url: searchUrl });

    // 等待页面加载完成
    await new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 20000);
    });

    // 等页面渲染
    await new Promise(r => setTimeout(r, 5000));

    // 先确保 content script 已注入
    try {
      statusText.textContent = '检查 content script...';
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      statusText.textContent = 'ping 成功，content script 已存在';
    } catch (pingErr) {
      statusText.textContent = 'ping 失败: ' + pingErr.message + '，尝试注入...';
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        statusText.textContent = '注入结果: ' + JSON.stringify(result?.map(r => r.result));
        await new Promise(r => setTimeout(r, 2000));
      } catch (injectErr) {
        statusText.textContent = '注入失败: ' + injectErr.message;
        statusBadge.textContent = '错误';
        statusBadge.className = 'badge badge-idle';
        btnSearch.disabled = false;
        btnSearch.textContent = '搜索秒杀';
        return;
      }
    }

    // 轮询发送消息，最多重试 5 次
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        statusText.textContent = `第${attempt}次发送消息...`;
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'clickFlashSaleFilter', storeKeyword: storeName });
        statusBadge.textContent = '已连接';
        statusBadge.className = 'badge badge-connected';
        if (res?.clicked) {
          statusText.textContent = '已筛选秒杀商品，可以采集了';
        } else if (res?.debug) {
          statusText.textContent = res.debug.join(' | ');
        } else {
          statusText.textContent = '返回: ' + JSON.stringify(res);
        }
        hint.classList.add('hidden');
        pageInfo.classList.remove('hidden');
        pageUrl.textContent = searchUrl;
        btnExtract.disabled = false;
        btnAuto.disabled = false;
        break;
      } catch (err) {
        if (attempt < 5) {
          statusText.textContent = `第${attempt}次失败: ${err.message}，重试...`;
          await new Promise(r => setTimeout(r, 2000));
        } else {
          statusText.textContent = `5次均失败: ${err.message}`;
          statusBadge.textContent = '错误';
          statusBadge.className = 'badge badge-idle';
        }
      }
    }
  } catch (err) {
    statusText.textContent = '搜索失败: ' + err.message;
    statusBadge.textContent = '错误';
    statusBadge.className = 'badge badge-idle';
  } finally {
    btnSearch.disabled = false;
    btnSearch.textContent = '搜索秒杀';
  }
}

// ==================== 事件绑定 ====================

btnExtract.addEventListener('click', extract);
btnAuto.addEventListener('click', startAutoScroll);
btnStop.addEventListener('click', stopAutoScroll);
btnSearch.addEventListener('click', searchFlashSale);
document.getElementById('btn-export-json').addEventListener('click', exportJSON);
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
document.getElementById('btn-copy-json').addEventListener('click', copyJSON);

// ==================== 初始化 ====================

checkPage();
