from fastapi import APIRouter, Query, status

from app.features.graph.schemas import (
    GraphResponse,
    GraphStatsResponse,
    IncomingIntroductionRequestsResponse,
    IntroductionRequestResponse,
    MutualConnectionsResponse,
)
from app.features.graph.service import GraphService
from app.neo4j_driver import get_neo4j_driver

router = APIRouter()


def _service() -> GraphService:
    return GraphService(get_neo4j_driver())


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "graph", "status": "ok"}


@router.get("")
async def get_graph(
    depth: int = Query(1, ge=1, le=2),
    job_filter: str = Query("all"),
) -> GraphResponse:
    return await _service().get_graph(depth=depth, job_filter=job_filter)


@router.post("/{person_id}/introduction-requests", status_code=status.HTTP_201_CREATED)
async def request_introduction(person_id: int) -> IntroductionRequestResponse:
    return await _service().request_introduction(person_id)


@router.get("/introduction-requests")
async def list_introduction_requests() -> IncomingIntroductionRequestsResponse:
    return await _service().list_incoming_requests()


@router.post("/introduction-requests/{person_id}/approve")
async def approve_introduction_request(person_id: int) -> IntroductionRequestResponse:
    return await _service().respond_to_request(person_id, approve=True)


@router.post("/introduction-requests/{person_id}/decline")
async def decline_introduction_request(person_id: int) -> IntroductionRequestResponse:
    return await _service().respond_to_request(person_id, approve=False)


@router.get("/stats")
async def get_graph_stats() -> GraphStatsResponse:
    return await _service().get_stats()


@router.get("/{person_id}/mutual")
async def get_mutual_connections(person_id: int) -> MutualConnectionsResponse:
    return await _service().get_mutual_connections(person_id)
