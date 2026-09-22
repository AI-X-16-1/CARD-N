"""SQLAlchemy models for the contacts feature."""

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.crypto import EncryptedString
from app.device import DEVICE_ID_MAX_LENGTH


class Person(Base):
    __tablename__ = "persons"
    __table_args__ = (Index("ix_persons_device", "device_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Which install this contact belongs to (app/device.py). Every read of this table
    # filters on it — a query that forgets is a query that hands one user another user's
    # business cards.
    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH))
    name: Mapped[str] = mapped_column(String(100))
    company: Mapped[str | None] = mapped_column(String(150))
    department: Mapped[str | None] = mapped_column(String(100))
    title: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(EncryptedString(30))
    email: Mapped[str | None] = mapped_column(EncryptedString(150))
    job_class: Mapped[str | None] = mapped_column(String(30))
    relation: Mapped[str] = mapped_column(String(20), default="other")
    context: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(EncryptedString(255))
    # Floor/unit/building detail the postcode search can't know (it only returns the
    # road/jibun address) — kept separate from `address` rather than concatenated in, so
    # re-opening "주소 갱신" later can re-populate just the searched part without losing
    # or duplicating whatever detail was typed alongside it.
    address_detail: Mapped[str | None] = mapped_column(EncryptedString(100))
    # A public code, not personally-identifying on its own — plain, unlike address/phone/email.
    postal_code: Mapped[str | None] = mapped_column(String(10))
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

    # One row per install, keyed by the device itself. This used to be a single row with
    # id=1 for the app's one and only user.
    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH), primary_key=True)
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
