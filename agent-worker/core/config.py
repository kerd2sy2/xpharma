from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "XPharma AI Agent Worker"
    ENVIRONMENT: str = "production"
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Message Broker & Storage
    REDIS_URL: str = "redis://localhost:6379/0"
    DATABASE_URL: Optional[str] = None

    # LLM & Reasoning Config
    DEFAULT_PROVIDER: str = "gemini"
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    DEFAULT_MODEL: str = "gemini-1.5-flash"

    # Circuit Breaker & Fault Tolerance
    CIRCUIT_BREAKER_MAX_FAILURES: int = 3
    CIRCUIT_BREAKER_RESET_TIMEOUT_SEC: int = 20
    TASK_TIMEOUT_SEC: int = 45

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="allow",
    )

settings = Settings()
