
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve the backend directory from this file instead of relying on the
# process's current working directory.
BASE_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    app_name: str = "AI Screening Platform API"
    app_version: str = "0.1.0"
    debug: bool = True

    database_url: str
    secret_key: str

    # Existing Groq configuration.
    # Kept so Groq can remain available as a fallback.
    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.8-27b"

    # Existing primary LLM configuration.
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    # Ollama configuration used by rubric-based free-text grading.
    # These can be overridden through backend/.env.
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"

    smtp_host: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str = "AI Screening Platform"

    # Public URLs used in candidate onboarding emails.
    backend_base_url: str = "http://127.0.0.1:8000"
    frontend_base_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
