"""Pydantic schemas for the game feature (see docs/api-spec.md §Game)."""

from datetime import datetime

from pydantic import BaseModel

MAX_DECK_SIZE = 8


class SkillSchema(BaseModel):
    name: str
    cost: int
    description: str


class BattleCardResponse(BaseModel):
    id: int
    person_id: int
    name: str
    company: str | None
    job_class: str
    job_label: str
    grade: int
    grade_label: str
    stars: int
    cost: int
    base_stats: dict[str, int]
    final_stats: dict[str, int]
    skill: SkillSchema
    passive: str
    flavor_text: str
    illustration_url: str | None = None
    created_at: datetime


class CreateCardRequest(BaseModel):
    person_id: int


class UpdateCardArtRequest(BaseModel):
    illustration_url: str


class DeckResponse(BaseModel):
    card_ids: list[int]
    count: int
    max: int = MAX_DECK_SIZE
    avg_cost: float


class UpdateDeckRequest(BaseModel):
    card_ids: list[int]
