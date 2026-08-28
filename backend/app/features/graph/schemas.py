"""Pydantic schemas for the graph feature."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class GraphNodeResponse(BaseModel):
    id: int
    type: Literal["me", "person"]
    name: str
    job_class: str | None = None
    company: str | None = None
    degree: int | None = None
    conversation_count: int | None = None
    last_conversation: datetime | None = None
    # My outgoing introduction-request status toward this 1st-degree contact (None = never asked).
    # Only meaningful for degree == 1 — see docs/api-spec.md "Introduction Requests".
    introduction_request_status: Literal["pending", "approved", "declined"] | None = None


class GraphEdgeResponse(BaseModel):
    source: int
    target: int
    weight: int
    last_interaction: datetime | None = None


class GraphStatsResponse(BaseModel):
    degree_1_count: int
    degree_2_count: int


class GraphResponse(BaseModel):
    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]
    stats: GraphStatsResponse


class IntroductionRequestResponse(BaseModel):
    person_id: int
    status: Literal["pending", "approved", "declined"]
    requested_at: datetime | None = None
    responded_at: datetime | None = None


class IntroductionRequestStatusResponse(BaseModel):
    """Same shape, but `status` is nullable — reading the state of a request that may
    never have been made is a different question from creating or answering one.
    """

    person_id: int
    status: Literal["pending", "approved", "declined"] | None = None
    requested_at: datetime | None = None
    responded_at: datetime | None = None


class IncomingIntroductionRequest(BaseModel):
    person_id: int
    name: str
    job_class: str | None = None
    company: str | None = None
    requested_at: datetime


class IncomingIntroductionRequestsResponse(BaseModel):
    requests: list[IncomingIntroductionRequest]


class AcquaintanceResponse(BaseModel):
    """A person a contact knows who is not a contact of mine.

    `status` is that person's own consent to being surfaced through the contact —
    `pending` until it is recorded, and only `approved` puts them in `GET /graph`.
    """

    id: int
    name: str
    job_class: str | None = None
    status: Literal["pending", "approved", "declined"]


class AcquaintancesResponse(BaseModel):
    person_id: int
    acquaintances: list[AcquaintanceResponse]


class AddAcquaintanceRequest(BaseModel):
    name: str
    job_class: str | None = None
