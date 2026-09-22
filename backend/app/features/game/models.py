"""SQLAlchemy models for the game feature."""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.base import Base
from app.device import DEVICE_ID_MAX_LENGTH


class BattleCard(Base):
    __tablename__ = "battle_cards"
    __table_args__ = (
        UniqueConstraint("person_id", name="uq_battle_cards_person_id"),
        Index("ix_battle_cards_device", "device_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Denormalized from the person, same reason as conversations — see app/device.py.
    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH))
    person_id: Mapped[int] = mapped_column(Integer, ForeignKey("persons.id", ondelete="CASCADE"))
    # Snapshot at creation — a later edit to the person's title does not re-roll it.
    job_class: Mapped[str] = mapped_column(String(20))
    grade: Mapped[int] = mapped_column(Integer)
    cost: Mapped[int] = mapped_column(Integer)
    base_stats: Mapped[dict] = mapped_column(JSON)
    final_stats: Mapped[dict] = mapped_column(JSON)
    skill: Mapped[dict] = mapped_column(JSON)
    passive: Mapped[str] = mapped_column(String(50))
    flavor_text: Mapped[str] = mapped_column(Text)
    # URL / path to the generated card art (ComfyUI / Krea2). Null until the
    # asset pipeline produces one.
    illustration_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GameDeck(Base):
    __tablename__ = "game_deck"

    # One deck per install, keyed by the device. Was a single row with id=1, back when the
    # project had exactly one user.
    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH), primary_key=True)
    card_ids: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
