from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"
    google_vision_api_key: str = ""
    openai_api_key: str = ""
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "cardncardn123"
    # Conversation feature — Whisper STT runs in-process (app/features/conversation/stt.py).
    # "small" is the sweet spot for Korean on CPU; "large-v3-turbo" is markedly better if
    # a GPU is available. Set whisper_device to "cuda" and compute_type to "float16" there.
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    # Conversation summaries. Key: https://aistudio.google.com/apikey
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    # Local-dev default only (no deployment, per CLAUDE.md) — a Fernet key encrypting
    # PII columns (Person/MyCard phone, email) at rest. Override via .env for anything
    # beyond a shared local sandbox.
    field_encryption_key: str = "1wRKRifwXl3jxdEAg17HwBdimFbahjl5OX6_aTjxWUc="

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
