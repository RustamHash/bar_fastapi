from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://beerpub:beerpub123@db:5432/beerpub"
    secret_key: str = "beerpub-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    class Config:
        env_file = ".env"


settings = Settings()
