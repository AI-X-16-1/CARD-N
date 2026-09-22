from pydantic_settings import BaseSettings, SettingsConfigDict

# The Fernet key every developer's local database was encrypted with before secrets moved
# out of source. It is in this repository's git history, so treat it as public: it is a
# convenience for reading data you already have, never a secret. `.env.example` points at
# it for exactly that reason, and a deployment that uses it is storing PII in the clear as
# far as anyone reading the history is concerned.
DEV_FIELD_ENCRYPTION_KEY = "1wRKRifwXl3jxdEAg17HwBdimFbahjl5OX6_aTjxWUc="


class Settings(BaseSettings):
    database_url: str = "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"

    # Conversation feature — Whisper STT runs in-process (app/features/conversation/stt.py).
    # Team-wide default, deliberately not the smallest one. `small` mishears Korean
    # proper nouns often enough to matter here: the names in a summary's
    # mentioned_people are matched against contact names to build graph edges, so a
    # misheard name loses an edge with nothing to show it happened. Set in .env.example
    # too, but repeated here — anyone who copied that file before this changed still
    # has the old value, and this is what actually decides it for them.
    # On a GPU, set whisper_device to "cuda" and whisper_compute_type to "float16".
    whisper_model: str = "large-v3-turbo"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    # Load the model in the lifespan hook (app/main.py) instead of on the first
    # /transcribe. This moves the cost rather than removing it — startup grows by
    # what the first request used to pay. Set false when running with
    # `uvicorn --reload`, where every save restarts the process and pays it again.
    whisper_warmup: bool = True

    # Conversation summaries. Key: https://aistudio.google.com/apikey
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"

    # Fernet key for the encrypted PII columns (Person/MyCard phone, email, address —
    # app/core/crypto.py). **Required**: there is no default, because a default is a key
    # checked into a public repository, and a column encrypted with a published key is
    # not encrypted. Generate one with:
    #
    #     python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    #
    # Rotating it makes existing rows unreadable — there is no re-encryption path yet, so
    # a new key means starting from an empty `persons` table.
    field_encryption_key: str

    # Browsers that may call this API, comma-separated. Only the Expo web preview
    # (react-native-web) is ever subject to CORS — the Android app is not a browser and
    # ignores it entirely — so this stays empty in production without breaking the phone.
    #
    # It used to be `["*"]`, the setting that lets any website a user visits call this
    # API as them. Harmless while nothing was deployed; not once something answers on a
    # public address.
    #
    # Kept as a string rather than a `list[str]`: pydantic-settings parses complex types
    # out of the environment as JSON, so `CORS_ORIGINS=` — the natural way to write
    # "none" in a .env file — fails at import with a parse error instead of meaning
    # nothing.
    cors_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()  # type: ignore[call-arg]  # field_encryption_key comes from the env
