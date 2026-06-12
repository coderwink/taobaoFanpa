import httpx
import json
import re
from typing import Optional
from .config import get_settings
from .models import AnalyzeResponse, ScrollDirection


# Swiper 识别的 Prompt
SWIPER_PROMPT = """请分析这个手机截图，判断是否存在可以左右滑动的轮播组件（Swiper/Carousel）。

请按以下格式返回 JSON：
{
  "has_swiper": true/false,
  "swiper_not_finished": true/false,
  "need_scroll_down": true/false,
  "scroll_direction": "right"/"left"/"down"/"none",
  "confidence": 0.0-1.0,
  "description": "简短描述你看到的内容"
}

判断依据：
1. 是否有多个并列的内容块（如图片、卡片）水平排列
2. 是否有指示器（小圆点、线条等）表示可滑动
3. 内容是否被截断，需要滑动才能完全显示
4. 注意区分：整个页面的滚动 vs 单个组件的滑动"""


async def call_xiaomimimo(image_base64: str, question: str) -> str:
    """
    调用 xiaomimomo 视觉模型 API

    Args:
        image_base64: 图片的 base64 编码
        question: 要问的问题

    Returns:
        API 返回的文本内容
    """
    settings = get_settings()

    url = f"{settings.xiaomimimo_base_url}/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.xiaomimimo_api_key}",
    }

    payload = {
        "model": settings.xiaomimimo_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}",
                        },
                    },
                    {
                        "type": "text",
                        "text": question,
                    },
                ],
            }
        ],
        "max_tokens": 1000,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")


def parse_ai_response(content: str) -> AnalyzeResponse:
    """
    解析 AI 返回的内容，提取结构化数据

    Args:
        content: AI 返回的文本内容

    Returns:
        解析后的 AnalyzeResponse 对象
    """
    # 尝试从内容中提取 JSON
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        try:
            json_str = json_match.group(0)
            data = json.loads(json_str)
            return AnalyzeResponse(
                has_swiper=data.get("has_swiper", False),
                swiper_not_finished=data.get("swiper_not_finished", False),
                need_scroll_down=data.get("need_scroll_down", True),
                scroll_direction=ScrollDirection(data.get("scroll_direction", "down")),
                confidence=data.get("confidence", 0.5),
                description=data.get("description", content[:100]),
            )
        except (json.JSONDecodeError, ValueError):
            pass

    # 如果没有有效的 JSON，根据文本内容推断
    content_lower = content.lower()
    has_swiper = any(keyword in content_lower for keyword in ["swiper", "轮播", "左右滑动", "carousel"])
    swiper_not_finished = any(keyword in content_lower for keyword in ["未完成", "还有", "继续", "not finished"])

    if "向右" in content:
        direction = ScrollDirection.RIGHT
    elif "向左" in content:
        direction = ScrollDirection.LEFT
    elif "向下" in content:
        direction = ScrollDirection.DOWN
    else:
        direction = ScrollDirection.DOWN

    return AnalyzeResponse(
        has_swiper=has_swiper,
        swiper_not_finished=swiper_not_finished and has_swiper,
        need_scroll_down=not has_swiper or not swiper_not_finished,
        scroll_direction=direction,
        confidence=0.7,
        description=content[:200],
    )


async def analyze_screenshot(
    image_base64: str,
    custom_prompt: Optional[str] = None,
) -> AnalyzeResponse:
    """
    分析截图，判断是否需要滑动

    Args:
        image_base64: 截图的 base64 编码
        custom_prompt: 自定义 prompt（可选）

    Returns:
        AnalyzeResponse 对象
    """
    prompt = custom_prompt or SWIPER_PROMPT

    try:
        content = await call_xiaomimimo(image_base64, prompt)
        return parse_ai_response(content)
    except httpx.HTTPStatusError as e:
        return AnalyzeResponse(
            has_swiper=False,
            swiper_not_finished=False,
            need_scroll_down=True,
            scroll_direction=ScrollDirection.DOWN,
            confidence=0,
            description=f"API 请求失败: {e.response.status_code}",
        )
    except Exception as e:
        return AnalyzeResponse(
            has_swiper=False,
            swiper_not_finished=False,
            need_scroll_down=True,
            scroll_direction=ScrollDirection.DOWN,  
            confidence=0,
            description=f"分析失败: {str(e)}",
        )


# 带上下文的 Swiper 识别 Prompt 模板
CONTEXT_SWIPER_PROMPT = """请分析这个手机截图，判断是否存在可以左右滑动的轮播组件（Swiper/Carousel）。

{context_section}

请按以下格式返回 JSON：
{{
  "has_swiper": true/false,
  "swiper_not_finished": true/false,
  "need_scroll_down": true/false,
  "scroll_direction": "right"/"left"/"down"/"none",
  "confidence": 0.0-1.0,
  "description": "简短描述你看到的内容"
}}

判断依据：
1. 是否有多个并列的内容块（如图片、卡片）水平排列
2. 是否有指示器（小圆点、线条等）表示可滑动
3. 内容是否被截断，需要滑动才能完全显示
4. 注意区分：整个页面的滚动 vs 单个组件的滑动
5. 如果之前已经看到过相同的 swiper 内容，说明滑动已经到头了"""


async def analyze_screenshot_with_context(
    image_base64: str,
    history_descriptions: list[str] = [],
    custom_prompt: Optional[str] = None,
) -> AnalyzeResponse:
    """
    带上下文的截图分析，判断是否需要滑动

    通过历史截图描述提供上下文信息，帮助 AI 更准确地判断 swiper 是否已完整遍历。

    Args:
        image_base64: 截图的 base64 编码
        history_descriptions: 历史截图的描述列表
        custom_prompt: 自定义 prompt（可选）

    Returns:
        AnalyzeResponse 对象
    """
    if custom_prompt:
        prompt = custom_prompt
    else:
        # 构建上下文信息
        if history_descriptions:
            context_lines = "\n".join(
                f"  第{i+1}张: {desc}" for i, desc in enumerate(history_descriptions[-5:])
            )
            context_section = f"之前已经分析过以下截图：\n{context_lines}\n\n请结合之前的分析结果，判断当前截图："
        else:
            context_section = "这是第一张截图，请仔细分析："

        prompt = CONTEXT_SWIPER_PROMPT.format(context_section=context_section)

    try:
        content = await call_xiaomimimo(image_base64, prompt)
        return parse_ai_response(content)
    except httpx.HTTPStatusError as e:
        return AnalyzeResponse(
            has_swiper=False,
            swiper_not_finished=False,
            need_scroll_down=True,
            scroll_direction=ScrollDirection.DOWN,
            confidence=0,
            description=f"API 请求失败: {e.response.status_code}",
        )
    except Exception as e:
        return AnalyzeResponse(
            has_swiper=False,
            swiper_not_finished=False,
            need_scroll_down=True,
            scroll_direction=ScrollDirection.DOWN,
            confidence=0,
            description=f"分析失败: {str(e)}",
        )

