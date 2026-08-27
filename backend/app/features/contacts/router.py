from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from neo4j import AsyncDriver
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
from app.neo4j_driver import get_neo4j_driver

router = APIRouter()


def _service(
    db: AsyncSession = Depends(get_db),
    neo4j_driver: AsyncDriver = Depends(get_neo4j_driver),
) -> ContactsService:
    return ContactsService(db, neo4j_driver)


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "contacts", "status": "ok"}


@router.get("/me", response_model=MyCardResponse)
async def get_my_card(service: ContactsService = Depends(_service)) -> MyCardResponse:
    return await service.get_my_card()


@router.put("/me", response_model=MyCardResponse)
async def update_my_card(
    data: UpdateMyCardRequest, service: ContactsService = Depends(_service)
) -> MyCardResponse:
    return await service.update_my_card(data)


@router.get("", response_model=PersonListResponse)
async def list_contacts(
    q: str | None = Query(default=None),
    category: str = Query(default="all"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: ContactsService = Depends(_service),
) -> PersonListResponse:
    return await service.list_persons(q, category, limit, offset)


@router.post("", response_model=PersonResponse, status_code=201)
async def create_contact(
    data: CreatePersonRequest, service: ContactsService = Depends(_service)
) -> PersonResponse:
    return await service.create_person(data)


@router.get("/{person_id}", response_model=PersonResponse)
async def get_contact(
    person_id: int, service: ContactsService = Depends(_service)
) -> PersonResponse:
    return await service.get_person(person_id)


@router.get("/{person_id}/image")
async def get_contact_image(
    person_id: int, service: ContactsService = Depends(_service)
) -> FileResponse:
    return FileResponse(await service.get_person_image_path(person_id))


@router.put("/{person_id}", response_model=PersonResponse)
async def update_contact(
    person_id: int, data: UpdatePersonRequest, service: ContactsService = Depends(_service)
) -> PersonResponse:
    return await service.update_person(person_id, data)


@router.delete("/{person_id}", status_code=204)
async def delete_contact(person_id: int, service: ContactsService = Depends(_service)) -> None:
    await service.delete_person(person_id)
