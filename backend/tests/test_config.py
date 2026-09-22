import pytest
from pydantic import ValidationError

from app.config import DEV_FIELD_ENCRYPTION_KEY, Settings


def test_settings_defaults_match_local_docker_compose() -> None:
    settings = Settings(_env_file=None, field_encryption_key=DEV_FIELD_ENCRYPTION_KEY)

    assert settings.database_url == "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"


def test_the_app_refuses_to_start_without_an_encryption_key() -> None:
    """No default, on purpose.

    A default here is a key committed to a public repository, and a column encrypted with
    a published key is not encrypted. Failing at import is the loud version of that, and
    it is the behaviour a deployment depends on — silently falling back would mean PII
    sitting in the database under a key anyone can read out of the git history.
    """
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    assert "field_encryption_key" in str(exc_info.value)


def test_cors_is_closed_unless_someone_opens_it() -> None:
    """It was `["*"]`. On a public address that lets any site call the API as the user."""
    settings = Settings(_env_file=None, field_encryption_key=DEV_FIELD_ENCRYPTION_KEY)

    assert settings.cors_origin_list == []


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", []),
        ("   ", []),
        ("http://localhost:8081", ["http://localhost:8081"]),
        ("http://a, http://b ", ["http://a", "http://b"]),
        ("http://a,,http://b", ["http://a", "http://b"]),
    ],
)
def test_cors_origins_parse_from_a_plain_env_string(raw: str, expected: list[str]) -> None:
    """`CORS_ORIGINS=` is how a .env says "none", and it has to survive import.

    A `list[str]` field would not: pydantic-settings reads complex types out of the
    environment as JSON, so an empty value raises a parse error at import instead of
    meaning nothing. That is how the first version of this shipped in .env.example.
    """
    settings = Settings(
        _env_file=None, field_encryption_key=DEV_FIELD_ENCRYPTION_KEY, cors_origins=raw
    )

    assert settings.cors_origin_list == expected


def test_the_dead_api_keys_are_gone() -> None:
    """google_vision_api_key and openai_api_key had no reader left — OCR moved to
    self-hosted PaddleOCR and summaries to Gemini. A secret nothing uses is a secret
    somebody still has to store.
    """
    fields = Settings.model_fields

    assert "google_vision_api_key" not in fields
    assert "openai_api_key" not in fields
