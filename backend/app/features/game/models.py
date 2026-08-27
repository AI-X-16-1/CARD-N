"""SQLAlchemy models for the game feature."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.base import Base

# The deck is global (no auth in this project), so it is a single row.
GAME_DECK_ID = 1


class BattleCard(Base):
    __tablename__ = "battle_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("persons.id", ondelete="CASCADE"), unique=True, index=True
    )
    # Snapshot at creation — a later edit to the person's title does not re-roll it.
    job_class: Mapped[str] = mapped_column(String(20))
    grade: Mapped[int] = mapped_column(Integer)
    cost: Mapped[int] = mapped_column(Integer)
    base_stats: Mapped[dict] = mapped_column(JSON)
    final_stats: Mapped[dict] = mapped_column(JSON)
    skill: Mapped[dict] = mapped_column(JSON)
    passive: Mapped[str] = mapped_column(String(50))
    flavor_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GameDeck(Base):
    __tablename__ = "game_deck"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_ids: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
