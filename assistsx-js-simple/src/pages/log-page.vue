<script setup lang="ts">
import {
  float,
  log,
  LogStream,
  Step,
  useStepStore,
  type LogUpdateEvent,
  type LogUploadResult,
} from "assistsx-js";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { runTaskByQuery } from "@/core/task-runners";
import { getLogUploadEnv } from "@/config/log-upload-env";

const route = useRoute();
const stepStore = useStepStore();
const originalTitle = document.title;

const logUploadEnv = getLogUploadEnv();

/** 浮窗打开（无 inline=1）时为 true */
const isFloatingLog = computed(() => {
  const q = route.query.inline;
  const isInline = q === "1" || (Array.isArray(q) && q[0] === "1");
  return !isInline;
});

/** 步骤仍在运行时可停止 */
const showStopButton = computed(
  () => stepStore.status !== "completed" && stepStore.status !== "error",
);

const lines = ref<string[]>([]);
const clearing = ref(false);
const uploading = ref(false);
const outputRef = ref<HTMLElement | null>(null);

const displayText = computed(() =>
  lines.value.length > 0 ? lines.value.join("\n") : "暂无日志内容。",
);

function scrollToBottom() {
  void nextTick(() => {
    const el = outputRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

function onLogUpdate(ev: LogUpdateEvent) {
  if (ev.code !== 0 || !ev.data) {
    return;
  }
  const { stream, text } = ev.data;
  if (stream === LogStream.entireLogText) {
    lines.value = text ? text.split(/\r?\n/) : [];
  } else {
    const line = text.trimEnd();
    if (line) {
      lines.value = [...lines.value, line];
    }
  }
  scrollToBottom();
}

async function loadLogFromBridge() {
  try {
    const t = (await log.readAllText()).trimEnd();
    if (t) {
      lines.value = t.split(/\r?\n/);
    }
  } catch {
    // 无 assistsxLog 桥接时忽略
  } finally {
    scrollToBottom();
  }
}

function formatUploadFailureForLog(result: LogUploadResult): string {
  const parts: string[] = ["[上传失败]"];
  parts.push(`message: ${result.message}`);
  if (result.httpCode !== undefined) {
    parts.push(`httpCode: ${String(result.httpCode)}`);
  }
  if (result.causeMessage) {
    parts.push(`causeMessage: ${result.causeMessage}`);
  }
  if (result.responseBody) {
    parts.push(`responseBody: ${result.responseBody}`);
  }
  if (result.localLogFilePath) {
    parts.push(`localLogFilePath: ${result.localLogFilePath}`);
  }
  if (result.localScreenshotFilePath) {
    parts.push(`localScreenshotFilePath: ${result.localScreenshotFilePath}`);
  }
  if (result.localNodeTreeFilePath) {
    parts.push(`localNodeTreeFilePath: ${result.localNodeTreeFilePath}`);
  }
  if (result.data !== undefined) {
    const s =
      typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2);
    parts.push(`data: ${s}`);
  }
  return parts.join("\n");
}

async function onUploadClick() {
  if (uploading.value) {
    return;
  }
  uploading.value = true;
  try {
    const result = await log.uploadLogs({
      timeout: 120,
      uploadKey: logUploadEnv.uploadKey,
      ...(logUploadEnv.logServiceBaseUrl
        ? { baseUrl: logUploadEnv.logServiceBaseUrl }
        : {}),
    });
    if (result.success) {
      let displayBaseUrl = logUploadEnv.logServiceBaseUrl;
      if (!displayBaseUrl) {
        try {
          displayBaseUrl = (await log.getLogServiceBaseUrl()).trim();
        } catch {
          // ignore
        }
      }
      const testAccountNote =
        "测试账号：test，密码：123321。测试账号日志仅保留 10 分钟且最多 10 条。";
      const line = displayBaseUrl
        ? `日志已成功上传，请访问 ${displayBaseUrl} 管理后台查看日志。\n${testAccountNote}`
        : `日志已成功上传，请访问日志服务管理后台查看日志。\n${testAccountNote}`;
      log.appendTimestampedEntry(line);
    } else {
      log.appendTimestampedEntry(formatUploadFailureForLog(result));
    }
  } catch (e) {
    const detail =
      e instanceof Error
        ? `${e.message}${e.stack ? `\n${e.stack}` : ""}`
        : String(e);
    log.appendTimestampedEntry(`[上传异常]\n${detail}`);
  } finally {
    uploading.value = false;
  }
}

async function onClearLog() {
  if (clearing.value) {
    return;
  }
  clearing.value = true;
  try {
    const ok = await log.clear();
    if (ok) {
      lines.value = [];
      void float.toast("已清空日志", 1800).catch(() => {});
    } else {
      void float.toast("清空失败", 2200).catch(() => {});
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "清空失败";
    void float.toast(msg, 2200).catch(() => {});
  } finally {
    clearing.value = false;
  }
}

const stopStep = () => {
  Step.stop();
  void log.appendTimestampedEntry("主动停止");
};

onMounted(async () => {
  document.title = "执行日志";
  log.addLogUpdateListener(onLogUpdate);
  scrollToBottom();
  await loadLogFromBridge();

  const raw = route.query.task;
  let task: string | undefined;
  if (typeof raw === "string") {
    task = raw;
  } else if (Array.isArray(raw)) {
    const first = raw[0];
    task = first === null || first === undefined ? undefined : String(first);
  } else {
    task = undefined;
  }

  const rawStore = route.query.storeName;
  let storeName: string | undefined;
  if (typeof rawStore === "string") {
    storeName = rawStore;
  } else if (Array.isArray(rawStore)) {
    storeName = rawStore[0] ?? undefined;
  }

  await runTaskByQuery(task, storeName);
});

onUnmounted(() => {
  document.title = originalTitle;
  log.removeLogUpdateListener(onLogUpdate);
});
</script>

<template>
  <div class="log-page" :class="{ 'log-page--floating': isFloatingLog }">
    <div v-if="showStopButton" class="log-toolbar">
      <div class="log-toolbar-start">
        <button type="button" class="stop-button" @click="stopStep">
          停止
        </button>
      </div>
    </div>
    <pre ref="outputRef" class="log-output" aria-live="polite">{{
      displayText
    }}</pre>
    <footer class="log-actions">
      <button
        type="button"
        class="log-btn"
        :disabled="clearing"
        @click="onClearLog"
      >
        {{ clearing ? "清空中…" : "清空日志" }}
      </button>
      <button
        type="button"
        class="log-btn"
        :disabled="uploading"
        @click="onUploadClick"
      >
        {{ uploading ? "上传中…" : "上传日志" }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.log-page {
  display: flex;
  flex-direction: column;
  height: 100svh;
  max-height: 100svh;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
  background: transparent;
}

.log-page--floating {
  background: transparent;
}

.log-toolbar {
  flex: 0 0 auto;
  padding: 8px 10px 0;
}

.log-toolbar-start {
  display: flex;
  gap: 10px;
  align-items: center;
}

.stop-button {
  padding: 6px 12px;
  background-color: #dc2626;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.log-output {
  flex: 1 1 0;
  min-height: 0;
  margin: 0;
  padding: 12px 14px;
  overflow: auto;
  font-family: ui-monospace, monospace;
  font-size: 0.6875rem;
  line-height: 1.45;
  color: #e2e8f0;
  background: transparent;
  border: none;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-actions {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
}

.log-btn {
  font: inherit;
  font-weight: 600;
  font-size: 0.75rem;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  color: #fff;
  border: 1px solid #7c3aed;
  background: linear-gradient(165deg, #7c3aed 0%, #6366f1 100%);
}

.log-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
