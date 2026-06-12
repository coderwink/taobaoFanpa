import json
import re
from .ai_service import call_xiaomimimo
from .models import OCRResult


# OCR 提取的 Prompt 模板
OCR_PROMPTS = {
    "member_page": """请仔细分析这张手机截图，提取所有可见的文字信息，并按以下 JSON 格式返回结构化数据：

{
  "member_level": "会员等级（如：黄金会员、V3、超级会员等，如未找到则为null）",
  "coupons": [
    {"name": "优惠券名称", "amount": "优惠金额", "condition": "使用条件", "expire": "过期时间"}
  ],
  "activities": [
    {"title": "活动名称", "description": "活动描述", "time": "活动时间"}
  ],
  "products": [
    {"name": "商品名称", "price": "价格", "original_price": "原价"}
  ],
  "benefits": [
    {"name": "权益名称", "description": "权益描述", "status": "状态（已领取/未领取/已过期）"}
  ],
  "raw_texts": ["页面上所有可识别的文字内容，按从上到下、从左到右的顺序排列"]
}

注意事项：
1. 请尽可能提取所有可见文字内容
2. 对于无法确定分类的文字，放入 raw_texts 数组
3. 如果某个字段没有对应内容，使用空数组 [] 或 null
4. 价格请保留原始格式（如 ¥99.00）
5. 请只返回 JSON，不要添加其他说明文字""",

    "coupon": """请分析这张截图，重点提取优惠券信息，按以下 JSON 格式返回：

{
  "member_level": null,
  "coupons": [
    {"name": "优惠券名称", "amount": "优惠金额", "condition": "使用条件", "expire": "过期时间"}
  ],
  "activities": [],
  "products": [],
  "benefits": [],
  "raw_texts": ["页面上所有可识别的文字内容"]
}

请只返回 JSON，不要添加其他说明文字。""",

    "product": """请分析这张截图，重点提取商品信息，按以下 JSON 格式返回：

{
  "member_level": null,
  "coupons": [],
  "activities": [],
  "products": [
    {"name": "商品名称", "price": "价格", "original_price": "原价"}
  ],
  "benefits": [],
  "raw_texts": ["页面上所有可识别的文字内容"]
}

请只返回 JSON，不要添加其他说明文字。""",

    "general": """请分析这张截图，提取所有可见的文字信息，按以下 JSON 格式返回：

{
  "member_level": null,
  "coupons": [],
  "activities": [],
  "products": [],
  "benefits": [],
  "raw_texts": ["页面上所有可识别的文字内容，按从上到下、从左到右的顺序排列"]
}

请只返回 JSON，不要添加其他说明文字。""",
}


def parse_ocr_response(content: str) -> OCRResult:
    """
    解析 AI 返回的 OCR 结果

    Args:
        content: AI 返回的文本内容

    Returns:
        解析后的 OCRResult 对象
    """
    # 尝试从内容中提取 JSON
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        try:
            json_str = json_match.group(0)
            data = json.loads(json_str)
            return OCRResult(
                member_level=data.get("member_level"),
                coupons=data.get("coupons", []),
                activities=data.get("activities", []),
                products=data.get("products", []),
                benefits=data.get("benefits", []),
                raw_texts=data.get("raw_texts", []),
                confidence=0.85,
            )
        except (json.JSONDecodeError, ValueError):
            pass

    # 解析失败，返回原始文本作为 raw_texts
    return OCRResult(
        raw_texts=[content] if content else [],
        confidence=0.3,
    )


async def extract_ocr(
    image_base64: str,
    extract_type: str = "member_page",
) -> OCRResult:
    """
    使用 MiMo 视觉模型提取截图中的文字信息

    Args:
        image_base64: 图片的 base64 编码
        extract_type: 提取类型（member_page/coupon/product/general）

    Returns:
        OCRResult 对象，包含结构化的文字提取结果
    """
    # 获取对应类型的 prompt，默认使用 general
    prompt = OCR_PROMPTS.get(extract_type, OCR_PROMPTS["general"])

    try:
        content = await call_xiaomimimo(image_base64, prompt)
        return parse_ocr_response(content)
    except Exception as e:
        # 出错时返回空结果，避免中断流程
        return OCRResult(
            raw_texts=[f"OCR 提取失败: {str(e)}"],
            confidence=0.0,
        )
