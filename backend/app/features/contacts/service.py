import logging
from pathlib import Path

from fastapi import HTTPException
from neo4j import AsyncDriver
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.image_store import person_image_path, promote_staged_image
from app.features.contacts.graph_sync import delete_person_node, sync_person_node
from app.features.contacts.models import MyCard, Person
from app.features.contacts.schemas import (
    CreatePersonRequest,
    MyCardResponse,
    PersonListResponse,
    PersonResponse,
    UpdateMyCardRequest,
    UpdatePersonRequest,
)

logger = logging.getLogger(__name__)

MY_CARD_ID = 1


class ContactsService:
    def __init__(self, db: AsyncSession, neo4j_driver: AsyncDriver | None = None):
        self.db = db
        self.neo4j_driver = neo4j_driver

    async def _sync_graph_node(self, person: Person) -> None:
        if self.neo4j_driver is None:
            return
        # MySQL (via self.db) is the single source of truth for person data; the graph
        # is a derived view. A Neo4j hiccup must not take down contact CRUD.
        try:
            await sync_person_node(
                self.neo4j_driver,
                person_id=person.id,
                name=person.name,
                company=person.company,
                job_class=person.job_class,
            )
        except Exception:
            logger.warning("Neo4j sync failed for person %s", person.id, exc_info=True)

    async def _delete_graph_node(self, person_id: int) -> None:
        if self.neo4j_driver is None:
            return
        try:
            await delete_person_node(self.neo4j_driver, person_id=person_id)
        except Exception:
            logger.warning("Neo4j delete failed for person %s", person_id, exc_info=True)

    def _to_person_response(self, person: Person) -> PersonResponse:
        return PersonResponse(
            id=person.id,
            name=person.name,
            company=person.company,
            department=person.department,
            title=person.title,
            phone=person.phone,
            email=person.email,
            job_class=person.job_class,
            relation=person.relation,
            context=person.context,
            address=person.address,
            postal_code=person.postal_code,
            last_contact=person.last_contact,
            conversation_count=0,
            created_at=person.created_at,
            has_image=bool(person.image_path),
        )

    async def list_persons(
        self,
        q: str | None,
        category: str,
        limit: int,
        offset: int,
    ) -> PersonListResponse:
        conditions = []
        if category != "all":
            conditions.append(Person.relation == category)
        if q:
            like = f"%{q}%"
            conditions.append((Person.name.ilike(like)) | (Person.company.ilike(like)))

        count_stmt = select(func.count()).select_from(Person)
        list_stmt = select(Person).order_by(Person.created_at.desc()).limit(limit).offset(offset)
        for condition in conditions:
            count_stmt = count_stmt.where(condition)
            list_stmt = list_stmt.where(condition)

        total = (await self.db.execute(count_stmt)).scalar_one()
        persons = (await self.db.execute(list_stmt)).scalars().all()

        return PersonListResponse(
            total=total,
            items=[self._to_person_response(person) for person in persons],
        )

    async def create_person(self, data: CreatePersonRequest) -> PersonResponse:
        payload = data.model_dump()
        image_token = payload.pop("image_token", None)
        person = Person(**payload)
        self.db.add(person)
        await self.db.commit()
        await self.db.refresh(person)
        if image_token:
            # Needs person.id, so this can only happen after the first commit above —
            # a second commit for just this one column beats holding the whole insert
            # open across a filesystem move.
            filename = promote_staged_image(image_token, person.id)
            if filename:
                person.image_path = filename
                await self.db.commit()
                await self.db.refresh(person)
        await self._sync_graph_node(person)
        return self._to_person_response(person)

    async def _get_person_or_404(self, person_id: int) -> Person:
        person = await self.db.get(Person, person_id)
        if person is None:
            raise HTTPException(status_code=404, detail="Person not found")
        return person

    async def get_person_image_path(self, person_id: int) -> Path:
        person = await self._get_person_or_404(person_id)
        if not person.image_path:
            raise HTTPException(status_code=404, detail="No saved card image for this contact")
        return person_image_path(person.image_path)

    async def get_person(self, person_id: int) -> PersonResponse:
        person = await self._get_person_or_404(person_id)
        return self._to_person_response(person)

    async def update_person(self, person_id: int, data: UpdatePersonRequest) -> PersonResponse:
        person = await self._get_person_or_404(person_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(person, field, value)
        await self.db.commit()
        await self.db.refresh(person)
        await self._sync_graph_node(person)
        return self._to_person_response(person)

    async def delete_person(self, person_id: int) -> None:
        person = await self._get_person_or_404(person_id)
        await self.db.delete(person)
        await self.db.commit()
        await self._delete_graph_node(person_id)

    async def _get_or_create_my_card(self) -> MyCard:
        card = await self.db.get(MyCard, MY_CARD_ID)
        if card is None:
            card = MyCard(id=MY_CARD_ID, name="")
            self.db.add(card)
            await self.db.commit()
            await self.db.refresh(card)
        return card

    async def get_my_card(self) -> MyCardResponse:
        card = await self._get_or_create_my_card()
        return MyCardResponse.model_validate(card, from_attributes=True)

    async def update_my_card(self, data: UpdateMyCardRequest) -> MyCardResponse:
        card = await self._get_or_create_my_card()
        for field, value in data.model_dump().items():
            setattr(card, field, value)
        await self.db.commit()
        await self.db.refresh(card)
        return MyCardResponse.model_validate(card, from_attributes=True)
