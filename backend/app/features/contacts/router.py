from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.features.contacts.schemas import (
    CreatePersonRequest,
    MyCardResponse,
    PersonListResponse,
    PersonResponse,
    UpdateMyCardRequest,
    UpdatePersonRequest,
)
from app.features.contacts.service import ContactsService

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "contacts", "status": "ok"}


@router.get("/me", response_model=MyCardResponse)
async def get_my_card(db: AsyncSession = Depends(get_db)) -> MyCardResponse:
    return await ContactsService(db).get_my_card()


@router.put("/me", response_model=MyCardResponse)
async def update_my_card(
    data: UpdateMyCardRequest, db: AsyncSession = Depends(get_db)
) -> MyCardResponse:
    return await ContactsService(db).update_my_card(data)


@router.get("", response_model=PersonListResponse)
async def list_contacts(
    q: str | None = Query(default=None),
    category: str = Query(default="all"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> PersonListResponse:
    return await ContactsService(db).list_persons(q, category, limit, offset)


@router.post("", response_model=PersonResponse, status_code=201)
async def create_contact(
    data: CreatePersonRequest, db: AsyncSession = Depends(get_db)
) -> PersonResponse:
    return await ContactsService(db).create_person(data)


@router.get("/{person_id}", response_model=PersonResponse)
async def get_contact(person_id: int, db: AsyncSession = Depends(get_db)) -> PersonResponse:
    return await ContactsService(db).get_person(person_id)


@router.put("/{person_id}", response_model=PersonResponse)
async def update_contact(
    person_id: int, data: UpdatePersonRequest, db: AsyncSession = Depends(get_db)
) -> PersonResponse:
    return await ContactsService(db).update_person(person_id, data)


@router.delete("/{person_id}", status_code=204)
async def delete_contact(person_id: int, db: AsyncSession = Depends(get_db)) -> None:
    await ContactsService(db).delete_person(person_id)
