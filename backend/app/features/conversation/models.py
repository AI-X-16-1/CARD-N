"""SQLAlchemy models for the conversation feature."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class Conversation(Base):
    """One recorded conversation with a contact, reduced to its summary.

    The audio is deleted right after STT (backend/CLAUDE.md privacy rules) and the
    transcript is never written to disk either — ui-spec §6 says only the summary is
    kept. `transcript_hash` is the one thing that survives from the raw text, so that
    re-summarizing the same recording updates the existing row instead of inflating
    the meeting count.
    """

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("person_id", "transcript_hash", name="uq_person_transcript"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("persons.id", ondelete="CASCADE"), index=True
    )
    transcript_hash: Mapped[str] = mapped_column(String(64))
    one_liner: Mapped[str] = mapped_column(String(300), default="")
    # The full summary as returned by the LLM (key_points, action_items,
    # mentioned_people, next_hints, keywords). Kept as JSON text so the schema can
    # grow without a migration per field.
    summary_json: Mapped[str] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
