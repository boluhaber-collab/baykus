from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parents[2]  # apps/api
_ROOT_DIR = Path(__file__).resolve().parents[4]  # baykus root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Absolute paths: works even if process cwd is not apps/api (panel/portable)
        env_file=(str(_API_DIR / ".env"), str(_ROOT_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "Baykuş Baskı API"
    debug: bool = True
    secret_key: str = "baykus-dev-secret-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    database_url: str = "postgresql+psycopg2://baykus:baykus@localhost:5432/baykus"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
