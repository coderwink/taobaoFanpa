import { log } from '../logging/app-log';

// 后端 API 客户端
// 默认后端地址可配置
const DEFAULT_BACKEND_URL = 'http://192.168.200.153:8000';

// ==================== 接口定义 ====================

/** AI 截图分析响应 */
export interface AIResponse {
  has_swiper: boolean;
  swiper_not_finished: boolean;
  need_scroll_down: boolean;
  scroll_direction: 'right' | 'left' | 'down' | 'none';
  confidence: number;
  description: string;
}

/** OCR 文字提取结果 */
export interface OCRResult {
  member_level: string | null;
  coupons: Array<{ title: string; condition: string; amount: string }>;
  activities: Array<{ title: string; description: string }>;
  products: Array<{ name: string; price: string; original_price: string }>;
  benefits: string[];
  raw_texts: string[];
  confidence: number;
}

/** Agent 决策动作 */
export interface AgentAction {
  action_type: 'swipe_left' | 'swipe_right' | 'swipe_down' | 'click' | 'wait' | 'back' | 'done';
  target_x?: number;
  target_y?: number;
  reason: string;
  confidence: number;
  page_description: string;
  widget_type?: string;
  widget_name?: string;
  widget_finished?: boolean;
}

/** 会话信息 */
export interface SessionInfo {
  session_id: string;
  store_name: string;
  status: string;
  screenshot_count: number;
  created_at: string;
  swiper_pages_found: number;
  current_phase: string;
}

// ==================== 客户端实现 ====================

class BackendClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DEFAULT_BACKEND_URL;
  }

  /** 更新后端地址 */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /** 获取当前后端地址 */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ===== 健康检查 =====

  /** 检查后端服务是否可用 */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        log(`后端健康检查失败: ${res.status} ${res.statusText}`);
        return false;
      }
      log('后端健康检查通过');
      return true;
    } catch (err) {
      log('后端连接失败: ' + err);
      return false;
    }
  }

  // ===== AI 截图分析 =====

  /** 发送截图给 AI 进行分析 */
  async analyzeScreenshot(imageBase64: string, context?: string): Promise<AIResponse> {
    try {
      const body: Record<string, unknown> = { image_base64: imageBase64 };
      if (context) body.context = context;

      const res = await fetch(`${this.baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`API 请求失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`AI 分析完成，置信度: ${data.confidence}`);
      return data as AIResponse;
    } catch (err) {
      log('AI 分析失败: ' + err);
      // 返回默认值：向下滑动
      return {
        has_swiper: false,
        swiper_not_finished: false,
        need_scroll_down: true,
        scroll_direction: 'down',
        confidence: 0,
        description: 'AI 分析失败，默认向下滑动',
      };
    }
  }

  // ===== OCR 文字提取 =====

  /** 发送截图进行 OCR 文字提取 */
  async extractOCR(imageBase64: string, extractType?: string): Promise<OCRResult> {
    try {
      const body: Record<string, unknown> = { image_base64: imageBase64 };
      if (extractType) body.extract_type = extractType;

      const res = await fetch(`${this.baseUrl}/api/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`OCR 请求失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`OCR 提取完成，原始文本数: ${data.raw_texts?.length || 0}`);
      return data as OCRResult;
    } catch (err) {
      log('OCR 提取失败: ' + err);
      return {
        member_level: null,
        coupons: [],
        activities: [],
        products: [],
        benefits: [],
        raw_texts: [],
        confidence: 0,
      };
    }
  }

  // ===== Agent 决策 =====

  /** 获取 AI Agent 的下一步操作决策 */
  async getAgentDecision(imageBase64: string, history: any[], goal?: string): Promise<AgentAction> {
    try {
      const body: Record<string, unknown> = {
        image_base64: imageBase64,
        action_history: history,
      };
      if (goal) body.goal = goal;

      const res = await fetch(`${this.baseUrl}/api/agent/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Agent 请求失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`Agent 决策: ${data.action_type} - ${data.reason}`);
      return data as AgentAction;
    } catch (err) {
      log('Agent 决策失败: ' + err);
      return {
        action_type: 'wait',
        reason: 'Agent 决策失败，等待重试',
        confidence: 0,
        page_description: '',
      };
    }
  }

  /** 获取 Widget Agent 的下一步操作决策（增强版，专注于小部件识别） */
  async getWidgetDecision(
    imageBase64: string,
    history: any[],
    widgets: Array<{ widget_type: string; widget_name: string; is_captured: boolean; screenshot_count: number }>,
    currentPageDescription?: string,
  ): Promise<AgentAction> {
    try {
      const body: Record<string, unknown> = {
        image_base64: imageBase64,
        history: history,
        widgets: widgets,
      };
      if (currentPageDescription) body.current_page_description = currentPageDescription;

      const res = await fetch(`${this.baseUrl}/api/agent/widget-decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Widget Agent 请求失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`Widget Agent 决策: ${data.action_type} - ${data.reason}`);
      return data as AgentAction;
    } catch (err) {
      log('Widget Agent 决策失败: ' + err);
      return {
        action_type: 'wait',
        reason: 'Widget Agent 决策失败，等待重试',
        confidence: 0,
        page_description: '',
      };
    }
  }

  // ===== 会话管理 =====

  /** 创建新的采集会话 */
  async createSession(storeName: string): Promise<SessionInfo> {
    try {
      const res = await fetch(`${this.baseUrl}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_name: storeName }),
      });

      if (!res.ok) {
        throw new Error(`创建会话失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`会话创建成功: ${data.session_id}`);
      return data as SessionInfo;
    } catch (err) {
      log('创建会话失败: ' + err);
      throw err;
    }
  }

  /** 获取会话信息 */
  async getSession(sessionId: string): Promise<SessionInfo> {
    try {
      const res = await fetch(`${this.baseUrl}/api/session/${sessionId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`获取会话失败: ${res.status} ${res.statusText}`);
      }

      return (await res.json()) as SessionInfo;
    } catch (err) {
      log('获取会话失败: ' + err);
      throw err;
    }
  }

  /** 上传截图到会话 */
  async uploadScreenshot(sessionId: string, imageBase64: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imageBase64 }),
      });

      if (!res.ok) {
        throw new Error(`上传截图失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`截图已上传到会话 ${sessionId}`);
      return data;
    } catch (err) {
      log('上传截图失败: ' + err);
      throw err;
    }
  }

  /** 获取会话采集结果 */
  async getSessionResult(sessionId: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/api/session/${sessionId}/result`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`获取结果失败: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      log(`会话 ${sessionId} 结果已获取`);
      return data;
    } catch (err) {
      log('获取会话结果失败: ' + err);
      throw err;
    }
  }
}

/** 全局单例后端客户端 */
export const backendClient = new BackendClient();
