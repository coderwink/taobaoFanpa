from pydantic import BaseModel
from typing import Optional
from enum import Enum


class ScrollDirection(str, Enum):
    """滑动方向"""
    RIGHT = "right"
    LEFT = "left"
    DOWN = "down"
    NONE = "none"


class AnalyzeResponse(BaseModel):
    """AI 分析响应"""
    has_swiper: bool
    swiper_not_finished: bool
    need_scroll_down: bool
    scroll_direction: ScrollDirection
    confidence: float
    description: str


class ScreenshotRequest(BaseModel):
    """截屏分析请求"""
    image_base64: str
    context: Optional[str] = None  # 可选的上下文信息


class TaskStatus(BaseModel):
    """任务状态"""
    task_id: str
    status: str
    message: str


class SessionCreate(BaseModel):
    """创建采集会话请求"""
    store_name: str  # 店铺名称
    target_app: str = "com.taobao.taobao"  # 目标APP包名


class SessionInfo(BaseModel):
    """采集会话信息"""
    session_id: str
    store_name: str
    status: str  # "active" | "completed" | "error"
    screenshot_count: int
    created_at: str
    swiper_pages_found: int
    current_phase: str  # "navigating" | "scrolling" | "swiper_traversing" | "completed"


class ScreenshotRecord(BaseModel):
    """截图记录"""
    index: int
    image_hash: str
    ai_result: AnalyzeResponse
    ocr_data: Optional[dict] = None
    timestamp: str


class OCRRequest(BaseModel):
    """OCR 提取请求"""
    image_base64: str
    extract_type: str = "member_page"  # "member_page" | "coupon" | "product" | "general"


class OCRResult(BaseModel):
    """OCR 提取结果"""
    member_level: Optional[str] = None
    coupons: list = []
    activities: list = []
    products: list = []
    benefits: list = []
    raw_texts: list = []
    confidence: float = 0.0


class AgentDecisionRequest(BaseModel):
    """Agent 决策请求"""
    image_base64: str
    history: list = []  # 历史操作记录
    goal: str = "collect_member_page"  # 当前目标
    current_page_description: str = ""  # 当前页面描述


class WidgetDecisionRequest(BaseModel):
    """Widget Agent 决策请求"""
    image_base64: str
    history: list = []  # 历史操作记录
    widgets: list = []  # 已识别的小部件列表
    current_page_description: str = ""  # 当前页面描述


class WidgetInfo(BaseModel):
    """识别到的小部件信息"""
    widget_type: str  # "swiper" | "scrollable_list" | "expandable" | "tab_panel" | "image_gallery" | "unknown"
    widget_name: str = ""  # 小部件的描述性名称
    is_captured: bool = False  # 是否已完成截图采集
    screenshot_count: int = 0  # 已截取的页面数


class AgentAction(BaseModel):
    """Agent 决策结果"""
    action_type: str  # "swipe_left" | "swipe_right" | "swipe_down" | "click" | "wait" | "back" | "done"
    target_x: Optional[int] = None
    target_y: Optional[int] = None
    reason: str
    confidence: float
    page_description: str  # AI对当前页面的描述
    widget_type: Optional[str] = None  # 当前识别到的小部件类型
    widget_name: Optional[str] = None  # 当前小部件的描述性名称
    widget_finished: Optional[bool] = None  # 当前小部件是否已采集完成
