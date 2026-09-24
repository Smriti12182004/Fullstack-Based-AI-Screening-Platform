from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Screening Platform API"
    app_version: str = "0.1.0"
    debug: bool = True

    database_url: str
    secret_key: str

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"

    smtp_host: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str = "AI Screening Platform"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()