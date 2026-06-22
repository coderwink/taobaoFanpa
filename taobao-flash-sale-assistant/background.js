// background.js — Service Worker

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('[淘宝秒杀采集] 插件已安装');
});

// 监听来自 content script 的消息（滚动更新转发给 popup）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'scrollUpdate') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }
  return false;
});
