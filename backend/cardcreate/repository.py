"""Reads the text for a battle card straight from the database.

``fetch_card_data`` joins ``battle_cards`` to the ``persons`` row its
``person_id`` points at and returns:

* the ORM ``BattleCard`` - so the caller can write ``illustration_url`` back
  once the image is generated,
* a ``GameCardData`` with the fields printed onto the card (``name`` /
  ``company`` from ``persons``; ``job_class`` / ``grade`` / ``cost`` /
  ``final_stats`` / ``skill`` / ``passive`` / ``flavor_text`` from the
  ``battle_cards`` snapshot, so editing the contact later doesn't change the
  card),
* ``Person.image_path`` - the saved business-card photo the card art is
  generated from.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# NOTE (PR #64 review): this reads the contacts/game feature tables directly.
# backend/CLAUDE.md rule 1 wants cross-feature access to go through app/core/ or
# an API. Until this module is folded into the game feature (or a
# `GET /game/cards/{id}` + `GET /contacts/{id}/image` call replaces the query),
# it stays a read-only join, matching how game/service.py already imports
# contacts.models.Person.
from app.features.contacts.models import Person
from app.features.game.models import BattleCard
from cardcreate.schemas import CardSkill, CardStats, GameCardData


class CardDataNotFoundError(KeyError):
    """Raised when no ``battle_cards`` row exists for the given id."""


class SourceImageMissingError(ValueError):
    """Raised when the card's contact has no saved business-card photo
    (``persons.image_path`` is NULL) - the pipeline has nothing to generate
    the card art from, so it must not run."""


@dataclass
class CardRecord:
    """Everything the generation pipeline needs for one battle card."""

    card: BattleCard  # the ORM row - illustration_url is written back onto it
    text: GameCardData  # the fields overlaid on the card
    image_path: str  # Person.image_path - the saved business-card photo (never NULL here)


async def fetch_card_data(db: AsyncSession, card_id: int) -> CardRecord:
    """Return the DB-backed data for ``card_id``.

    Raises ``CardDataNotFoundError`` when the ``battle_cards`` row is missing,
    and ``SourceImageMissingError`` when its contact's ``persons.image_path``
    is NULL - the module can only run for a contact that has a saved
    business-card photo.
    """
    row = (
        await db.execute(
            select(BattleCard, Person)
            .join(Person, Person.id == BattleCard.person_id)
            .where(BattleCard.id == card_id)
        )
    ).first()
    if row is None:
        raise CardDataNotFoundError(card_id)

    card, person = row
    if not person.image_path:
        raise SourceImageMissingError(card_id)
    text = GameCardData(
        name=person.name,
        company=person.company,
        # the battle_cards snapshot (one of the 8 fixed classes), not the
        # contact's raw, editable, sometimes-null persons.job_class - PR #64 review.
        job_class=card.job_class,
        grade=card.grade,
        cost=card.cost,
        final_stats=CardStats(**(card.final_stats or {})),
        skill=CardSkill(**(card.skill or {})),
        passive=card.passive,
        flavor_text=card.flavor_text,
    )
    return CardRecord(card=card, text=text, image_path=person.image_path)
