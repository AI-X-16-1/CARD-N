"""Conversation feature business logic: STT -> summary -> saved history."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.contacts.models import Person
from app.features.conversation.models import Conversation
from app.features.conversation.schemas import (
    ConversationListResponse,
    ConversationResponse,
    ConversationSummary,
    SaveConversationRequest,
    SummaryContextPerson,
)

logger = logging.getLogger(__name__)

# How many past summaries go into the prompt. More than this and the recent context
# gets buried while the token bill climbs.
HISTORY_LIMIT = 5


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:32]


class ConversationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─────────────────────────────────────────────────────────
    # Prompt context — assembled server-side from the contact record
    # ─────────────────────────────────────────────────────────

    async def _get_person_or_404(self, person_id: int) -> Person:
        person = await self.db.get(Person, person_id)
        if person is None:
            raise HTTPException(status_code=404, detail="Person not found")
        return person

    async def meeting_number(self, person_id: int, transcript: str) -> int:
        """Which meeting this one is.

        Counts saved conversations *excluding this same recording*, so re-summarizing
        an already-saved transcript does not turn a 4th meeting into a 5th — which
        would change the prompt, miss the cache, and spend another API call for
        nothing.
        """
        stmt = (
            select(func.count())
            .select_from(Conversation)
            .where(
                Conversation.person_id == person_id,
                Conversation.transcript_hash != fingerprint(transcript),
            )
        )
        return (await self.db.execute(stmt)).scalar_one() + 1

    async def history_lines(
        self,
        person_id: int,
        limit: int = HISTORY_LIMIT,
        exclude_transcript: str | None = None,
    ) -> list[str]:
        """One line per past conversation, oldest first so the prompt reads as a timeline."""
        skip = fingerprint(exclude_transcript) if exclude_transcript else None

        stmt = (
            select(Conversation)
            .where(Conversation.person_id == person_id)
            .order_by(Conversation.created_at.desc())
            .limit(limit + 1)  # +1 covers the row we may skip
        )
        rows = (await self.db.execute(stmt)).scalars().all()

        lines: list[str] = []
        for row in rows:
            if skip and row.transcript_hash == skip:
                continue
            if len(lines) >= limit:
                break

            date = row.created_at.strftime("%Y-%m-%d") if row.created_at else ""
            line = f"{date} · {row.one_liner}"

            # An unfinished to-do from last time is the best material for next_hints.
            todos = self._summary_dict(row).get("action_items") or []
            brief = ", ".join(t.get("content", "") for t in todos[:2] if t.get("content"))
            if brief:
                line += f" (할 일: {brief})"

            lines.append(line)

        return list(reversed(lines))

    async def build_person_context(
        self, person_id: int, transcript: str
    ) -> tuple[SummaryContextPerson, dict, list[str]]:
        """Returns (echo for the UI, prompt dict, history lines)."""
        person = await self._get_person_or_404(person_id)
        meet_count = await self.meeting_number(person_id, transcript)

        context = SummaryContextPerson(
            id=person.id,
            name=person.name,
            company=person.company,
            title=person.title,
            meet_count=meet_count,
        )
        prompt_person = {
            k: v
            for k, v in {
                "name": person.name,
                "company": person.company,
                "title": person.title,
                "meet_count": meet_count,
            }.items()
            if v not in ("", None)
        }
        history = await self.history_lines(person_id, exclude_transcript=transcript)
        return context, prompt_person, history

    # ─────────────────────────────────────────────────────────
    # Saved history
    # ─────────────────────────────────────────────────────────

    @staticmethod
    def _summary_dict(row: Conversation) -> dict:
        try:
            return json.loads(row.summary_json)
        except (json.JSONDecodeError, TypeError):
            logger.warning("conversation %s has unreadable summary_json", row.id)
            return {}

    def _to_response(self, row: Conversation) -> ConversationResponse:
        data = self._summary_dict(row)
        # one_line lives both in its own column (cheap list queries) and inside the JSON
        # blob; the column wins so a list view and a detail view cannot disagree.
        data["one_line"] = row.one_liner or data.get("one_line", "")
        return ConversationResponse(
            id=row.id,
            person_id=row.person_id,
            one_liner=row.one_liner,
            summary=ConversationSummary.model_validate(data),
            duration_seconds=row.duration_seconds,
            recorded_at=row.recorded_at,
            created_at=row.created_at,
        )

    async def save(self, data: SaveConversationRequest) -> ConversationResponse:
        """Same person + same recording overwrites rather than stacking up.

        Read-then-write instead of a MySQL ON DUPLICATE KEY UPDATE, so this same code
        runs against the SQLite the tests use. The unique index stays the real guard —
        this just keeps the common re-summarize path from raising.
        """
        person = await self._get_person_or_404(data.person_id)

        # Naive local time on purpose: every other timestamp in this schema is a naive
        # DateTime filled by MySQL's own now(), so a tz-aware value here would sort
        # against created_at as if it were hours off.
        recorded_at = data.recorded_at or datetime.now()  # noqa: DTZ005
        transcript_hash = fingerprint(data.transcript)

        row = (
            await self.db.execute(
                select(Conversation).where(
                    Conversation.person_id == data.person_id,
                    Conversation.transcript_hash == transcript_hash,
                )
            )
        ).scalar_one_or_none()

        if row is None:
            row = Conversation(person_id=data.person_id, transcript_hash=transcript_hash)
            self.db.add(row)

        row.one_liner = data.summary.one_line[:300]
        row.summary_json = json.dumps(data.summary.model_dump(), ensure_ascii=False)
        row.duration_seconds = data.duration_seconds
        row.recorded_at = recorded_at

        # Timeline ordering elsewhere keys off last_contact on the contact record.
        person.last_contact = recorded_at

        await self.db.commit()
        await self.db.refresh(row)
        return self._to_response(row)

    async def list_for_person(
        self, person_id: int, limit: int, offset: int
    ) -> ConversationListResponse:
        await self._get_person_or_404(person_id)

        total = (
            await self.db.execute(
                select(func.count())
                .select_from(Conversation)
                .where(Conversation.person_id == person_id)
            )
        ).scalar_one()

        rows = (
            (
                await self.db.execute(
                    select(Conversation)
                    .where(Conversation.person_id == person_id)
                    .order_by(Conversation.created_at.desc())
                    .limit(limit)
                    .offset(offset)
                )
            )
            .scalars()
            .all()
        )
        return ConversationListResponse(total=total, items=[self._to_response(r) for r in rows])

    async def delete(self, conversation_id: int) -> None:
        row = await self.db.get(Conversation, conversation_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        await self.db.delete(row)
        await self.db.commit()
