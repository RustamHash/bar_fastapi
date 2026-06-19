from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Берлога"
    database_url: str = "sqlite:///./beerpub.db"
    secret_key: str = "beerpub-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    class Config:
        env_file = ".env"


settings = Settings()
