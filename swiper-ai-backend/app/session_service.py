import uuid
from datetime import datetime, timezone
from typing import Optional
from .models import SessionInfo, ScreenshotRecord


# 内存中的会话存储
_sessions: dict[str, dict] = {}


def create_session(store_name: str, target_app: str = "com.taobao.taobao") -> SessionInfo:
    """
    创建新的采集会话

    Args:
        store_name: 店铺名称
        target_app: 目标APP包名

    Returns:
        SessionInfo 对象
    """
    session_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    session_data = {
        "session_id": session_id,
        "store_name": store_name,
        "target_app": target_app,
        "status": "active",
        "screenshot_count": 0,
        "created_at": now,
        "swiper_pages_found": 0,
        "current_phase": "navigating",
        "screenshots": [],
    }

    _sessions[session_id] = session_data

    return SessionInfo(
        session_id=session_id,
        store_name=store_name,
        status="active",
        screenshot_count=0,
        created_at=now,
        swiper_pages_found=0,
        current_phase="navigating",
    )


def get_session(session_id: str) -> Optional[SessionInfo]:
    """
    获取会话信息

    Args:
        session_id: 会话ID

    Returns:
        SessionInfo 对象，不存在则返回 None
    """
    session_data = _sessions.get(session_id)
    if not session_data:
        return None

    return SessionInfo(
        session_id=session_data["session_id"],
        store_name=session_data["store_name"],
        status=session_data["status"],
        screenshot_count=session_data["screenshot_count"],
        created_at=session_data["created_at"],
        swiper_pages_found=session_data["swiper_pages_found"],
        current_phase=session_data["current_phase"],
    )


def add_screenshot(session_id: str, screenshot_record: ScreenshotRecord) -> None:
    """
    添加截图记录到会话

    Args:
        session_id: 会话ID
        screenshot_record: 截图记录

    Raises:
        ValueError: 会话不存在时抛出
    """
    session_data = _sessions.get(session_id)
    if not session_data:
        raise ValueError(f"会话不存在: {session_id}")

    session_data["screenshots"].append(screenshot_record.model_dump())
    session_data["screenshot_count"] = len(session_data["screenshots"])

    # 根据 AI 分析结果更新 swiper 页面计数
    if screenshot_record.ai_result.has_swiper:
        session_data["swiper_pages_found"] += 1


def update_session_status(
    session_id: str,
    status: Optional[str] = None,
    phase: Optional[str] = None,
) -> None:
    """
    更新会话状态

    Args:
        session_id: 会话ID
        status: 新状态（active/completed/error）
        phase: 新阶段（navigating/scrolling/swiper_traversing/completed）

    Raises:
        ValueError: 会话不存在时抛出
    """
    session_data = _sessions.get(session_id)
    if not session_data:
        raise ValueError(f"会话不存在: {session_id}")

    if status is not None:
        session_data["status"] = status
    if phase is not None:
        session_data["current_phase"] = phase


def get_session_screenshots(session_id: str) -> list[ScreenshotRecord]:
    """
    获取会话的所有截图记录

    Args:
        session_id: 会话ID

    Returns:
        截图记录列表

    Raises:
        ValueError: 会话不存在时抛出
    """
    session_data = _sessions.get(session_id)
    if not session_data:
        raise ValueError(f"会话不存在: {session_id}")

    return [ScreenshotRecord(**s) for s in session_data["screenshots"]]


def get_session_result(session_id: str) -> dict:
    """
    获取会话的完整聚合结果

    Args:
        session_id: 会话ID

    Returns:
        包含会话信息和所有 OCR 数据的聚合结果字典

    Raises:
        ValueError: 会话不存在时抛出
    """
    session_data = _sessions.get(session_id)
    if not session_data:
        raise ValueError(f"会话不存在: {session_id}")

    # 聚合所有截图的 OCR 数据
    all_coupons = []
    all_activities = []
    all_products = []
    all_benefits = []
    all_raw_texts = []
    member_level = None

    for screenshot in session_data["screenshots"]:
        ocr_data = screenshot.get("ocr_data")
        if not ocr_data:
            continue

        # 提取会员等级（取第一个非空值）
        if not member_level and ocr_data.get("member_level"):
            member_level = ocr_data["member_level"]

        all_coupons.extend(ocr_data.get("coupons", []))
        all_activities.extend(ocr_data.get("activities", []))
        all_products.extend(ocr_data.get("products", []))
        all_benefits.extend(ocr_data.get("benefits", []))
        all_raw_texts.extend(ocr_data.get("raw_texts", []))

    return {
        "session_id": session_data["session_id"],
        "store_name": session_data["store_name"],
        "status": session_data["status"],
        "current_phase": session_data["current_phase"],
        "screenshot_count": session_data["screenshot_count"],
        "swiper_pages_found": session_data["swiper_pages_found"],
        "created_at": session_data["created_at"],
        "aggregated_data": {
            "member_level": member_level,
            "coupons": all_coupons,
            "activities": all_activities,
            "products": all_products,
            "benefits": all_benefits,
            "raw_texts": all_raw_texts,
        },
        "screenshots": session_data["screenshots"],
    }
