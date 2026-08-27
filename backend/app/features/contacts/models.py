"""SQLAlchemy models for the contacts feature."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.crypto import EncryptedString


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))
    company: Mapped[str | None] = mapped_column(String(150))
    department: Mapped[str | None] = mapped_column(String(100))
    title: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(EncryptedString(30))
    email: Mapped[str | None] = mapped_column(EncryptedString(150))
    job_class: Mapped[str | None] = mapped_column(String(30))
    relation: Mapped[str] = mapped_column(String(20), default="other")
    context: Mapped[str | None] = mapped_column(Text)
    # Filename under app/core/image_store.py's PERSONS_DIR (e.g. "42.jpg"), not a full
    # path — set once, at creation, from the corrected scan image (see ScanService /
    # ContactsService.create_person). Never re-set on update; a contact created via
    # ManualInputForm (no scan) simply has none.
    image_path: Mapped[str | None] = mapped_column(String(255))
    last_contact: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class MyCard(Base):
    __tablename__ = "my_card"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    company: Mapped[str | None] = mapped_column(String(150))
    department: Mapped[str | None] = mapped_column(String(100))
    grade: Mapped[str | None] = mapped_column(String(100))
    job_function: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(EncryptedString(30))
    email: Mapped[str | None] = mapped_column(EncryptedString(150))
    address: Mapped[str | None] = mapped_column(EncryptedString(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
