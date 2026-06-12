import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

try:
    completion = client.chat.completions.create(
        model="mimo-v2.5-pro",
        messages=[
            {
                "role": "system",
                "content": "You are MiMo, an AI assistant developed by Xiaomi."
            },
            {
                "role": "user",
                "content": "请简单回复: 你好"
            }
        ],
        max_completion_tokens=100,
        temperature=1.0,
        stream=False,
    )
    print("API 连接成功!")
    print(f"回复: {completion.choices[0].message.content}")
except Exception as e:
    print(f"API 连接失败: {e}")
