from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FRTV_", env_file=".env")

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    request_timeout_seconds: float = 8.0
    search_cache_ttl_seconds: int = 12 * 60 * 60
    valuation_cache_ttl_seconds: int = 20


settings = Settings()
