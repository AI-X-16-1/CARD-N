from pydantic import BaseModel, ConfigDict, Field


class CardStats(BaseModel):
    """The ``final_stats`` JSON from a ``battle_cards`` row.

    The game engine stores the stats under short keys and ``def`` / ``int`` are
    Python keywords, so those two carry aliases - ``CardStats(**row.final_stats)``
    still works.
    """

    model_config = ConfigDict(populate_by_name=True)

    atk: int | None = None
    defense: int | None = Field(default=None, alias="def")  # shown as "DEF"
    intelligence: int | None = Field(default=None, alias="int")  # shown as "INT"
    hp: int | None = None


class CardSkill(BaseModel):
    """The ``skill`` JSON from a ``battle_cards`` row."""

    name: str | None = None
    cost: int | None = None
    description: str | None = None


class GameCardData(BaseModel):
    """Text content overlaid onto a generated battle card.

    ``name`` / ``company`` / ``job_class`` come from the ``persons`` row the
    card's ``person_id`` points at; ``grade`` / ``cost`` / ``final_stats`` /
    ``skill`` / ``passive`` / ``flavor_text`` come from the ``battle_cards`` row
    itself (see ``repository.fetch_card_data``). The card's *image* is generated
    from the contact's saved business-card photo; only the text printed on top
    comes from here.

    Every field is optional so a partially-filled record still renders.
    """

    name: str | None = None
    company: str | None = None
    job_class: str | None = None
    grade: int | None = None  # 등급 - star tier, 1-6
    cost: int | None = None  # COST
    final_stats: CardStats = Field(default_factory=CardStats)
    skill: CardSkill = Field(default_factory=CardSkill)
    passive: str | None = None  # 패시브
    flavor_text: str | None = None  # 플레이버 텍스트
