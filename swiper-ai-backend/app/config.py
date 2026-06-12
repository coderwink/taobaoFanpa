from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置"""
    # xiaomimomo API 配置
    xiaomimimo_api_key: str = "sk-cuaaakfuz47z9nxtxuj46azumsiix7bgwz3iboosf6pzlw0f"
    xiaomimimo_base_url: str = "https://api.xiaomimimo.com/v1"
    xiaomimimo_model: str = "mimo-v2-omni"

    # 服务器配置
    server_host: str = "0.0.0.0"
    server_port: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
