from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.contacts.models import MyCard, Person
from app.features.contacts.schemas import (
    CreatePersonRequest,
    MyCardResponse,
    PersonListResponse,
    PersonResponse,
    UpdateMyCardRequest,
    UpdatePersonRequest,
)

MY_CARD_ID = 1


class ContactsService:
    def __init__(self, db: AsyncSession):
        self.db = db

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
            last_contact=person.last_contact,
            conversation_count=0,
            created_at=person.created_at,
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
        person = Person(**data.model_dump())
        self.db.add(person)
        await self.db.commit()
        await self.db.refresh(person)
        return self._to_person_response(person)

    async def _get_person_or_404(self, person_id: int) -> Person:
        person = await self.db.get(Person, person_id)
        if person is None:
            raise HTTPException(status_code=404, detail="Person not found")
        return person

    async def get_person(self, person_id: int) -> PersonResponse:
        person = await self._get_person_or_404(person_id)
        return self._to_person_response(person)

    async def update_person(self, person_id: int, data: UpdatePersonRequest) -> PersonResponse:
        person = await self._get_person_or_404(person_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(person, field, value)
        await self.db.commit()
        await self.db.refresh(person)
        return self._to_person_response(person)

    async def delete_person(self, person_id: int) -> None:
        person = await self._get_person_or_404(person_id)
        await self.db.delete(person)
        await self.db.commit()

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
