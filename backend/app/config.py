from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"
    google_vision_api_key: str = ""
    openai_api_key: str = ""
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "cardncardn123"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
