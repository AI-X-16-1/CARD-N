"""Pydantic schemas for the conversation feature."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.features.conversation.guide import MAX_MESSAGE_CHARS

# ─────────────────────────────────────────────────────────────
# STT
# ─────────────────────────────────────────────────────────────


class TranscriptSegment(BaseModel):
    """One timestamped slice of the transcript, used to jump around the audio."""

    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    text: str
    segments: list[TranscriptSegment]
    duration_seconds: float
    language: str
    model: str


# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────


class MentionedPerson(BaseModel):
    """A third party named in the conversation — a candidate graph edge."""

    name: str
    relation: str
    confidence: float = 0.0


class ConversationSummary(BaseModel):
    one_line: str
    key_points: list[str] = []
    mentioned_people: list[MentionedPerson] = []
    keywords: list[str] = []


class SummarizeRequest(BaseModel):
    transcript: str = Field(..., description="Transcript produced by STT")
    person_id: int | None = Field(
        None,
        description=(
            "Contact this conversation was with. When given, the server pulls the "
            "contact's details and previous summaries into the prompt itself — the "
            "client only ever sends the id."
        ),
    )
    duration_seconds: int | None = None


class SummaryContextPerson(BaseModel):
    """What the server actually put in the prompt, echoed back for the UI."""

    id: int
    name: str
    company: str | None = None
    title: str | None = None
    meet_count: int


class SummarizeResponse(BaseModel):
    model: str
    prompt_version: str
    result: ConversationSummary
    person: SummaryContextPerson | None = None
    history_used: int = 0


# ─────────────────────────────────────────────────────────────
# Saved conversation history
# ─────────────────────────────────────────────────────────────


class SaveConversationRequest(BaseModel):
    person_id: int
    transcript: str = Field(
        ...,
        description=(
            "Only hashed, never stored. Lets a re-summarized recording overwrite its "
            "own earlier entry instead of counting as another meeting."
        ),
    )
    summary: ConversationSummary
    duration_seconds: int | None = None
    recorded_at: datetime | None = None


class ConversationResponse(BaseModel):
    id: int
    person_id: int
    one_liner: str
    summary: ConversationSummary
    duration_seconds: int | None
    recorded_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationListResponse(BaseModel):
    total: int
    items: list[ConversationResponse]


# ─────────────────────────────────────────────────────────────
# Guide chatbot
# ─────────────────────────────────────────────────────────────


class GuideMessage(BaseModel):
    """One visible turn. 'assistant' is this bot; the client sends back what it drew."""

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=MAX_MESSAGE_CHARS)


class GuideRequest(BaseModel):
    messages: list[GuideMessage] = Field(
        ...,
        min_length=1,
        description="Whole visible conversation, oldest first, ending with the new question",
    )


class GuideResponse(BaseModel):
    reply: str
    model: str
