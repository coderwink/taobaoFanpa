from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
import base64
import hashlib
from datetime import datetime, timezone
from .models import (
    AnalyzeResponse, ScreenshotRequest,
    SessionCreate, SessionInfo, ScreenshotRecord,
    OCRRequest, OCRResult,
    AgentDecisionRequest, AgentAction,
    WidgetDecisionRequest,
)
from .ai_service import analyze_screenshot, analyze_screenshot_with_context, SWIPER_PROMPT
from .ocr_service import extract_ocr
from .agent_service import get_agent_decision, get_widget_agent_decision
from . import session_service

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_image(request: ScreenshotRequest):
    """
    分析截图，判断是否需要滑动

    接收 base64 编码的图片，调用 AI 分析，返回滑动指令
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="图片数据不能为空")

    result = await analyze_screenshot(
        image_base64=request.image_base64,
        custom_prompt=request.context,
    )
    return result


@router.post("/analyze/upload", response_model=AnalyzeResponse)
async def analyze_uploaded_image(file: UploadFile = File(...)):
    """
    通过文件上传分析截图

    接收上传的图片文件，调用 AI 分析，返回滑动指令
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    content = await file.read()
    image_base64 = base64.b64encode(content).decode("utf-8")

    result = await analyze_screenshot(image_base64=image_base64)
    return result


@router.get("/prompt")
async def get_prompt():
    """获取当前使用的 Prompt"""
    return {"prompt": SWIPER_PROMPT}


@router.post("/prompt")
async def update_prompt(prompt: str):
    """更新 Prompt（重启后失效，如需持久化请修改 ai_service.py）"""
    # 这里只是示例，实际应该持久化到配置文件
    return {"message": "Prompt 已更新（当前会话有效）"}


@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "service": "swiper-ai-backend"}


# ==================== 会话管理接口 ====================


@router.post("/session", response_model=SessionInfo)
async def create_session(request: SessionCreate):
    """
    创建新的采集会话

    初始化一个新的数据采集会话，用于跟踪截图和分析结果
    """
    session = session_service.create_session(
        store_name=request.store_name,
        target_app=request.target_app,
    )
    return session


@router.get("/session/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str):
    """
    获取会话信息

    返回指定会话的当前状态和统计信息
    """
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"会话不存在: {session_id}")
    return session


@router.post("/session/{session_id}/screenshot")
async def upload_session_screenshot(session_id: str, request: ScreenshotRequest):
    """
    上传截图到会话

    上传截图后自动进行 AI 分析和 OCR 提取，并记录到会话中
    """
    # 检查会话是否存在
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"会话不存在: {session_id}")

    if not request.image_base64:
        raise HTTPException(status_code=400, detail="图片数据不能为空")

    # 获取历史截图描述，用于上下文分析
    try:
        history_screenshots = session_service.get_session_screenshots(session_id)
        history_descriptions = [
            s.ai_result.description for s in history_screenshots
        ]
    except ValueError:
        history_descriptions = []

    # 使用带上下文的 AI 分析
    ai_result = await analyze_screenshot_with_context(
        image_base64=request.image_base64,
        history_descriptions=history_descriptions,
        custom_prompt=request.context,
    )

    # 进行 OCR 提取
    ocr_result = await extract_ocr(
        image_base64=request.image_base64,
        extract_type="member_page",
    )

    # 计算图片哈希（用于去重）
    image_hash = hashlib.md5(request.image_base64.encode()).hexdigest()[:16]

    # 创建截图记录
    screenshot_record = ScreenshotRecord(
        index=session.screenshot_count,
        image_hash=image_hash,
        ai_result=ai_result,
        ocr_data=ocr_result.model_dump(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    # 保存到会话
    try:
        session_service.add_screenshot(session_id, screenshot_record)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # 根据 AI 分析结果更新会话阶段
    if ai_result.has_swiper and ai_result.swiper_not_finished:
        session_service.update_session_status(session_id, phase="swiper_traversing")
    elif ai_result.need_scroll_down:
        session_service.update_session_status(session_id, phase="scrolling")

    return {
        "screenshot_index": screenshot_record.index,
        "image_hash": image_hash,
        "ai_result": ai_result.model_dump(),
        "ocr_result": ocr_result.model_dump(),
    }


@router.get("/session/{session_id}/result")
async def get_session_result(session_id: str):
    """
    获取会话的完整聚合结果

    返回会话中所有截图的 OCR 数据聚合结果
    """
    try:
        result = session_service.get_session_result(session_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==================== OCR 接口 ====================


@router.post("/ocr", response_model=OCRResult)
async def ocr_extract(request: OCRRequest):
    """
    独立的 OCR 文字提取

    使用 MiMo 视觉模型从截图中提取结构化文字信息
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="图片数据不能为空")

    result = await extract_ocr(
        image_base64=request.image_base64,
        extract_type=request.extract_type,
    )
    return result


# ==================== Agent 决策接口 ====================


@router.post("/agent/decide", response_model=AgentAction)
async def agent_decide(request: AgentDecisionRequest):
    """
    获取 Agent 的下一步操作决策

    根据当前截图和历史操作记录，返回智能 Agent 推荐的下一步操作
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="图片数据不能为空")

    result = await get_agent_decision(
        image_base64=request.image_base64,
        history=request.history,
        goal=request.goal,
        current_page_description=request.current_page_description,
    )
    return result


@router.post("/agent/widget-decide", response_model=AgentAction)
async def widget_agent_decide(request: WidgetDecisionRequest):
    """
    获取 Widget Agent 的下一步操作决策（增强版）

    专注于小部件识别和采集，根据当前截图、历史操作和已识别的小部件列表，
    返回包含 widget 信息的下一步操作决策。
    """
    if not request.image_base64:
        raise HTTPException(status_code=400, detail="图片数据不能为空")

    result = await get_widget_agent_decision(
        image_base64=request.image_base64,
        history=request.history,
        widgets=request.widgets,
        current_page_description=request.current_page_description,
    )
    return result

