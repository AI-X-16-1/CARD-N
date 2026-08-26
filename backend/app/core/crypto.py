"""Transparent at-rest encryption for PII columns (backend/CLAUDE.md: phone numbers
and emails must be stored encrypted).
"""

from cryptography.fernet import Fernet
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.config import settings

_fernet = Fernet(settings.field_encryption_key.encode())


class EncryptedString(TypeDecorator):
    """A String column that's encrypted in the database and plaintext everywhere else.

    Encrypt/decrypt happens at the ORM boundary, so callers read/write
    Person.phone / Person.email as normal strings. Fernet tokens run well over 2x the
    plaintext length (IV + HMAC + base64), so give the underlying column plenty of room
    regardless of what length is passed in.
    """

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(String(500))

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return _fernet.encrypt(value.encode()).decode()

    def process_result_value(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return _fernet.decrypt(value.encode()).decode()
