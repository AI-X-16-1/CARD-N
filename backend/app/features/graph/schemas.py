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


class IncomingIntroductionRequest(BaseModel):
    person_id: int
    name: str
    job_class: str | None = None
    company: str | None = None
    requested_at: datetime


class IncomingIntroductionRequestsResponse(BaseModel):
    requests: list[IncomingIntroductionRequest]


class MutualConnectionResponse(BaseModel):
    id: int
    name: str
    job_class: str | None = None
    company: str | None = None


class MutualConnectionsResponse(BaseModel):
    person_id: int
    mutual_connections: list[MutualConnectionResponse]
