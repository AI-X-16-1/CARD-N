"""Pydantic schemas for the scan feature."""
from pydantic import BaseModel


class OcrFieldResponse(BaseModel):
    label: str
    value: str
    confidence: float


class OcrResponse(BaseModel):
    fields: list[OcrFieldResponse]
    raw_text: str
    # A staging token for the corrected card image (see image_store.py) — the client
    # passes this back on POST /contacts to actually save it against the new contact.
    # None if the pipeline couldn't produce an image worth keeping for this photo.
    image_token: str | None = None


class OcrBatchItemResponse(BaseModel):
    filename: str
    fields: list[OcrFieldResponse]
    raw_text: str


class OcrBatchResponse(BaseModel):
    items: list[OcrBatchItemResponse]


class ParseFieldRequest(BaseModel):
    label: str
    value: str


class ParseRequest(BaseModel):
    fields: list[ParseFieldRequest]
    context: str | None = None


class ParsedPerson(BaseModel):
    name: str | None = None
    company: str | None = None
    department: str | None = None
    title: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    postal_code: str | None = None
    context: str | None = None


class ParseResponse(BaseModel):
    person: ParsedPerson
