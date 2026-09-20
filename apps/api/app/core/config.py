from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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
