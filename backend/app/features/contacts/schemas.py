"""Pydantic schemas for the contacts feature."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

RelationCategory = Literal["client", "partner", "networking", "other"]


class CreatePersonRequest(BaseModel):
    name: str
    company: str | None = None
    department: str | None = None
    title: str | None = None
    phone: str | None = None
    email: str | None = None
    job_class: str | None = None
    relation: RelationCategory = "other"
    context: str | None = None


class UpdatePersonRequest(BaseModel):
    name: str | None = None
    company: str | None = None
    department: str | None = None
    title: str | None = None
    phone: str | None = None
    email: str | None = None
    job_class: str | None = None
    relation: RelationCategory | None = None
    context: str | None = None


class PersonResponse(BaseModel):
    id: int
    name: str
    company: str | None
    department: str | None
    title: str | None
    phone: str | None
    email: str | None
    job_class: str | None
    relation: str
    context: str | None
    last_contact: datetime | None
    conversation_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonListResponse(BaseModel):
    total: int
    items: list[PersonResponse]


class MyCardResponse(BaseModel):
    name: str
    company: str | None
    title: str | None
    phone: str | None
    email: str | None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateMyCardRequest(BaseModel):
    name: str
    company: str | None = None
    title: str | None = None
    phone: str | None = None
    email: str | None = None
