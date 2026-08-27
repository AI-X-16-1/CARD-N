"""Game feature business logic — card collection, deck, flavor regeneration."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.contacts.models import Person
from app.features.game import flavor as flavor_llm
from app.features.game.card_builder import GRADE_LABEL, JOB_LABEL, build_snapshot
from app.features.game.models import GAME_DECK_ID, BattleCard, GameDeck
from app.features.game.schemas import (
    MAX_DECK_SIZE,
    BattleCardResponse,
    DeckResponse,
    SkillSchema,
)


class GameService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # --- cards -----------------------------------------------------------

    def _to_response(self, card: BattleCard, person: Person) -> BattleCardResponse:
        return BattleCardResponse(
            id=card.id,
            person_id=card.person_id,
            name=person.name,
            company=person.company,
            job_class=card.job_class,
            job_label=JOB_LABEL[card.job_class],
            grade=card.grade,
            grade_label=GRADE_LABEL[card.grade],
            stars=card.grade,
            cost=card.cost,
            base_stats=card.base_stats,
            final_stats=card.final_stats,
            skill=SkillSchema(**card.skill),
            passive=card.passive,
            flavor_text=card.flavor_text,
            illustration_url=card.illustration_url,
            created_at=card.created_at,
        )

    async def set_illustration(self, card_id: int, illustration_url: str) -> BattleCardResponse:
        card, person = await self._card_row_or_404(card_id)
        card.illustration_url = illustration_url
        await self.db.commit()
        await self.db.refresh(card)
        return self._to_response(card, person)

    async def list_cards(self) -> list[BattleCardResponse]:
        """Collection == my contacts: make sure every person has a card, then return all."""
        persons = list((await self.db.execute(select(Person))).scalars().all())
        have = set((await self.db.execute(select(BattleCard.person_id))).scalars().all())

        created = False
        for person in persons:
            if person.id not in have:
                self.db.add(BattleCard(**build_snapshot(person)))
                created = True
        if created:
            await self.db.commit()

        rows = (
            await self.db.execute(
                select(BattleCard, Person)
                .join(Person, Person.id == BattleCard.person_id)
                .order_by(BattleCard.person_id.desc())
            )
        ).all()
        return [self._to_response(card, person) for card, person in rows]

    async def _person_or_404(self, person_id: int) -> Person:
        person = await self.db.get(Person, person_id)
        if person is None:
            raise HTTPException(status_code=404, detail="Person not found")
        return person

    async def create_card(self, person_id: int) -> BattleCardResponse:
        person = await self._person_or_404(person_id)
        card = (
            await self.db.execute(select(BattleCard).where(BattleCard.person_id == person_id))
        ).scalar_one_or_none()
        if card is None:
            card = BattleCard(**build_snapshot(person))
            self.db.add(card)
            await self.db.commit()
            await self.db.refresh(card)
        return self._to_response(card, person)

    async def _card_row_or_404(self, card_id: int) -> tuple[BattleCard, Person]:
        row = (
            await self.db.execute(
                select(BattleCard, Person)
                .join(Person, Person.id == BattleCard.person_id)
                .where(BattleCard.id == card_id)
            )
        ).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Card not found")
        return row  # type: ignore[return-value]

    async def get_card(self, card_id: int) -> BattleCardResponse:
        card, person = await self._card_row_or_404(card_id)
        return self._to_response(card, person)

    async def regenerate_flavor(self, card_id: int) -> BattleCardResponse:
        card, person = await self._card_row_or_404(card_id)
        try:
            new_text = flavor_llm.regenerate_flavor(self._to_response(card, person).model_dump())
        except flavor_llm.FlavorUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        card.flavor_text = new_text
        await self.db.commit()
        await self.db.refresh(card)
        return self._to_response(card, person)

    # --- deck ----------------------------------------------------------

    async def _get_or_create_deck(self) -> GameDeck:
        deck = await self.db.get(GameDeck, GAME_DECK_ID)
        if deck is None:
            deck = GameDeck(id=GAME_DECK_ID, card_ids=[])
            self.db.add(deck)
            await self.db.commit()
            await self.db.refresh(deck)
        return deck

    async def _deck_response(self, card_ids: list[int]) -> DeckResponse:
        costs = (
            list(
                (await self.db.execute(select(BattleCard.cost).where(BattleCard.id.in_(card_ids))))
                .scalars()
                .all()
            )
            if card_ids
            else []
        )
        avg = round(sum(costs) / len(costs), 1) if costs else 0.0
        return DeckResponse(card_ids=card_ids, count=len(card_ids), max=MAX_DECK_SIZE, avg_cost=avg)

    async def get_deck(self) -> DeckResponse:
        deck = await self._get_or_create_deck()
        return await self._deck_response(list(deck.card_ids or []))

    async def update_deck(self, card_ids: list[int]) -> DeckResponse:
        if len(card_ids) > MAX_DECK_SIZE:
            raise HTTPException(
                status_code=422, detail=f"A deck holds at most {MAX_DECK_SIZE} cards"
            )
        if len(set(card_ids)) != len(card_ids):
            raise HTTPException(status_code=422, detail="A card cannot be in the deck twice")
        if card_ids:
            known = set(
                (await self.db.execute(select(BattleCard.id).where(BattleCard.id.in_(card_ids))))
                .scalars()
                .all()
            )
            missing = [cid for cid in card_ids if cid not in known]
            if missing:
                raise HTTPException(status_code=422, detail=f"Unknown card ids: {missing}")

        deck = await self._get_or_create_deck()
        deck.card_ids = list(card_ids)
        await self.db.commit()
        return await self._deck_response(list(card_ids))
