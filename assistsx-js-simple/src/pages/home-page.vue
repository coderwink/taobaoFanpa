<script setup lang="ts">
import { float } from 'assistsx-js'
import { ElMessageBox } from 'element-plus'
import { onMounted } from 'vue'
import { buildLogPanelFloatUrl, buildTestPanelFloatUrl } from '@/core/float-log-url'

/** 仅开发模式展示首页「测试」入口 */
const isDev = import.meta.env.DEV

onMounted(() => {
  document.title = 'Assists Web示例'
})

async function openLogFloat(task: string) {
  const url = buildLogPanelFloatUrl({ task })
  await float.open(url, { showBottomOperationArea: true })
}

/** 点赞朋友圈：先风险提示，确认后再打开浮窗 */
async function openMomentLikeWithDisclaimer(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '该功能为测试功能。短时间频繁点赞可能触发平台风控，请勿频繁使用。因使用本功能导致的账号风控等后果由用户自行承担。',
      '风险提示',
      {
        type: 'warning',
        confirmButtonText: '已知悉并继续',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true,
      },
    )
  } catch {
    return
  }
  await openLogFloat('momentLike')
}

/** 截屏功能 */

async function openTestFloat() {
  const url = buildTestPanelFloatUrl()
  await float.open(url, { showBottomOperationArea: true })
}
</script>

<template>
  <div class="home">
    <header class="home-header">
      <h1 class="home-title">Assists Web 示例</h1>
      <p class="home-desc">
        下方任务将在浮窗中打开日志面板并自动执行；日志写入独立 Web 实例，与宿主首页隔离。
      </p>
      <p class="home-version" role="note">
        目前测试通过版本为 WX8.0.65。
      </p>
    </header>

    <section class="home-actions" aria-label="快捷操作">
      <button
        type="button"
        class="action action--taobao"
        @click="openLogFloat('taobaoLongScreenshot')"
      >
        <span class="action-title">淘宝长截图</span>
        <span class="action-sub">自动滚动并截图全页</span>
      </button>
      <button
        type="button"
        class="action action--account"
        @click="openLogFloat('accountInfo')"
      >
        <span class="action-title">获取WX账号信息</span>
        <span class="action-sub">读取账号相关元数据</span>
      </button>
      <button
        type="button"
        class="action action--moment"
        @click="openLogFloat('collectMoment')"
      >
        <span class="action-title">收集朋友圈</span>
        <span class="action-sub">浏览并采集朋友圈内容</span>
      </button>
      <button
        type="button"
        class="action action--like"
        @click="openMomentLikeWithDisclaimer"
      >
        <span class="action-title">点赞朋友圈</span>
        <span class="action-sub">进入朋友圈并尝试点赞</span>
      </button>
      <button
        type="button"
        class="action action--unfollow"
        @click="openLogFloat('collectOfficial')"
      >
        <span class="action-title">批量取关公众号</span>
        <span class="action-sub">先采集列表，再在子页勾选取关</span>
      </button>


      <button
        v-if="isDev"
        type="button"
        class="action action--test"
        @click="openTestFloat"
      >
        <span class="action-title">测试</span>
        <span class="action-sub">浮窗打开测试面板（测试 / 日志）</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.home {
  min-height: 100%;
  padding: clamp(16px, 4vw, 28px);
  overflow-y: auto;
  box-sizing: border-box;
  color: #e8eaef;
  background:
    radial-gradient(ellipse 120% 80% at 50% -20%, rgba(100, 108, 255, 0.35), transparent 55%),
    linear-gradient(165deg, #12131a 0%, #0a0b0f 100%);
}

.home-header {
  max-width: 560px;
  margin-bottom: clamp(20px, 5vw, 32px);
}

.home-title {
  font-size: clamp(1.5rem, 4vw, 1.85rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 10px;
  color: #f4f5f8;
}

.home-desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgba(232, 234, 239, 0.72);
}

.home-version {
  margin: 12px 0 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(251, 191, 36, 0.92);
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(251, 191, 36, 0.28);
  background: rgba(251, 191, 36, 0.08);
  max-width: 560px;
}

.home-actions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: 12px;
  max-width: 720px;
}

.action {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px 16px;
  min-height: 76px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}

.action:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
}

.action:active {
  transform: translateY(0);
}

.action-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
}

.action-sub {
  font-size: 0.72rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.55);
}

.action--account {
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
}

.action--moment {
  background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
}

.action--like {
  background: linear-gradient(135deg, #db2777 0%, #ec4899 100%);
}

.action--unfollow {
  background: linear-gradient(135deg, #c2410c 0%, #ea580c 100%);
}

.action--taobao {
  background: linear-gradient(135deg, #ff8c00 0%, #ff5000 100%);
}

.action--test {
  background: linear-gradient(135deg, #52525b 0%, #71717a 100%);
}
</style>
