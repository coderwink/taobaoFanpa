import json
import re
from .ai_service import call_xiaomimimo
from .models import AgentAction


# ==================== Widget 识别的 Prompt 模板 ====================

WIDGET_AGENT_PROMPT = """分析截图。识别小部件类型(swiper/scrollable_list/expandable/tab_panel)。
看到轮播就返回swipe_right，到底部就done，否则swipe_down。
已识别: {widgets_info}
返回: {{"action_type":"swipe_right或swipe_down或done","reason":"原因","widget_type":"类型","widget_name":"名称","widget_finished":false}}
只返回JSON。"""


# ==================== 通用 Agent Prompt（兼容旧接口）====================

AGENT_PROMPT = """你是一个智能自动化 Agent，负责在手机 APP 中采集会员页面的数据。
请根据当前截图和历史操作记录，决定下一步应该执行什么操作。

当前目标: {goal}

历史操作记录:
{history}

当前页面描述（来自上一次分析）:
{current_page_description}

请按以下 JSON 格式返回你的决策：
{{
  "action_type": "操作类型",
  "target_x": null,
  "target_y": null,
  "reason": "做出这个决策的原因",
  "confidence": 0.0-1.0,
  "page_description": "对当前页面内容的详细描述"
}}

可选的 action_type：
- "swipe_left": 向左滑动（查看 swiper 下一页）
- "swipe_right": 向右滑动（查看 swiper 上一页）
- "swipe_down": 向下滑动（滚动页面查看更多内容）
- "click": 点击某个元素（需要提供 target_x 和 target_y 坐标）
- "wait": 等待页面加载完成
- "back": 返回上一页
- "done": 采集完成，所有内容已获取

判断逻辑：
1. 如果页面有弹窗（广告、通知等），优先关闭弹窗
2. 如果检测到加载中的状态，选择 "wait"
3. 如果页面有可左右滑动的 swiper 组件，逐页滑动查看
4. 如果 swiper 已经滑到最后一页（指示器到末尾），继续向下滚动
5. 如果发现 "查看更多"、"展开全部" 等可点击元素，选择 "click" 并提供坐标
6. 如果页面已经滚动到底部且所有内容已采集，选择 "done"
7. 如果当前操作与之前重复（连续相同的操作），考虑切换策略
8. 如果出现错误页面或异常状态，选择 "back" 返回

请只返回 JSON，不要添加其他说明文字。"""


def _format_history(history: list) -> str:
    """
    格式化历史操作记录，供 prompt 使用

    Args:
        history: 历史操作记录列表

    Returns:
        格式化后的文本
    """
    if not history:
        return "（暂无历史操作记录，这是第一步）"

    lines = []
    for i, item in enumerate(history[-10:], 1):  # 只取最近10条记录
        if isinstance(item, dict):
            action = item.get("action_type", "unknown")
            reason = item.get("reason", "")
            lines.append(f"  {i}. {action} - {reason}")
        else:
            lines.append(f"  {i}. {item}")

    return "\n".join(lines)


def parse_agent_response(content: str) -> AgentAction:
    """
    解析 AI 返回的 Agent 决策结果

    Args:
        content: AI 返回的文本内容

    Returns:
        解析后的 AgentAction 对象
    """
    # 尝试从内容中提取 JSON
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        try:
            json_str = json_match.group(0)
            data = json.loads(json_str)
            return AgentAction(
                action_type=data.get("action_type", "wait"),
                target_x=data.get("target_x"),
                target_y=data.get("target_y"),
                reason=data.get("reason", ""),
                confidence=data.get("confidence", 0.5),
                page_description=data.get("page_description", ""),
                widget_type=data.get("widget_type"),
                widget_name=data.get("widget_name"),
                widget_finished=data.get("widget_finished"),
            )
        except (json.JSONDecodeError, ValueError):
            pass

    # 解析失败，返回安全的默认操作
    return AgentAction(
        action_type="wait",
        reason=f"无法解析AI响应，原始内容: {content[:100]}",
        confidence=0.1,
        page_description="解析失败",
    )


async def get_agent_decision(
    image_base64: str,
    history: list = [],
    goal: str = "collect_member_page",
    current_page_description: str = "",
) -> AgentAction:
    """
    获取 Agent 的下一步操作决策

    Args:
        image_base64: 当前截图的 base64 编码
        history: 历史操作记录列表
        goal: 当前目标
        current_page_description: 当前页面描述

    Returns:
        AgentAction 对象，包含下一步操作的决策
    """
    # 格式化 prompt
    prompt = AGENT_PROMPT.format(
        goal=goal,
        history=_format_history(history),
        current_page_description=current_page_description or "（暂无描述）",
    )

    try:
        content = await call_xiaomimimo(image_base64, prompt)
        return parse_agent_response(content)
    except Exception as e:
        # 出错时返回安全的等待操作
        return AgentAction(
            action_type="wait",
            reason=f"Agent 决策失败: {str(e)}",
            confidence=0.0,
            page_description="决策服务异常",
        )


def _format_widgets_info(widgets: list) -> str:
    """
    格式化已识别小部件信息，供 widget prompt 使用

    Args:
        widgets: 小部件信息列表

    Returns:
        格式化后的文本
    """
    if not widgets:
        return "（暂无已识别的小部件，请仔细分析当前页面）"

    lines = []
    for i, w in enumerate(widgets, 1):
        status = "已完成" if w.get("is_captured", False) else f"已截取{w.get('screenshot_count', 0)}张"
        lines.append(
            f"  {i}. [{w.get('widget_type', 'unknown')}] {w.get('widget_name', '未命名')} - {status}"
        )

    return "\n".join(lines)


async def get_widget_agent_decision(
    image_base64: str,
    history: list = [],
    widgets: list = [],
    current_page_description: str = "",
) -> AgentAction:
    """
    获取 Widget Agent 的下一步操作决策（增强版）

    专注于小部件识别和采集，返回包含 widget 信息的决策。

    Args:
        image_base64: 当前截图的 base64 编码
        history: 历史操作记录列表
        widgets: 已识别的小部件列表
        current_page_description: 当前页面描述

    Returns:
        AgentAction 对象，包含下一步操作的决策和 widget 信息
    """
    prompt = WIDGET_AGENT_PROMPT.format(
        widgets_info=_format_widgets_info(widgets),
        history=_format_history(history),
        current_page_description=current_page_description or "（暂无描述）",
    )

    try:
        content = await call_xiaomimimo(image_base64, prompt)
        return parse_agent_response(content)
    except Exception as e:
        return AgentAction(
            action_type="wait",
            reason=f"Widget Agent 决策失败: {str(e)}",
            confidence=0.0,
            page_description="决策服务异常",
        )
