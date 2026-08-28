from fastapi import APIRouter, Query, status

from app.features.graph.schemas import (
    AcquaintanceResponse,
    AcquaintancesResponse,
    AddAcquaintanceRequest,
    GraphResponse,
    GraphStatsResponse,
    IncomingIntroductionRequestsResponse,
    IntroductionRequestResponse,
    IntroductionRequestStatusResponse,
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


# Same path as the POST above — at most one request can exist between me and a given
# person, so this reads back that one. Distinct from GET /introduction-requests below,
# which is the inbox of requests other people sent *me*.
@router.get("/{person_id}/introduction-requests")
async def get_introduction_request(person_id: int) -> IntroductionRequestStatusResponse:
    return await _service().get_introduction_request(person_id)


@router.get("/introduction-requests")
async def list_introduction_requests() -> IncomingIntroductionRequestsResponse:
    return await _service().list_incoming_requests()


@router.post("/introduction-requests/{person_id}/approve")
async def approve_introduction_request(person_id: int) -> IntroductionRequestResponse:
    return await _service().respond_to_request(person_id, approve=True)


@router.post("/introduction-requests/{person_id}/decline")
async def decline_introduction_request(person_id: int) -> IntroductionRequestResponse:
    return await _service().respond_to_request(person_id, approve=False)


# Acquaintances — the only path that creates a contact-to-contact edge, and so the only
# way anyone appears in the 2nd-degree section. Kept under the contact who vouches for
# them, because that relationship is the whole reason the person is visible at all.
@router.post("/{person_id}/acquaintances", status_code=status.HTTP_201_CREATED)
async def add_acquaintance(person_id: int, body: AddAcquaintanceRequest) -> AcquaintanceResponse:
    return await _service().add_acquaintance(person_id, name=body.name, job_class=body.job_class)


@router.get("/{person_id}/acquaintances")
async def list_acquaintances(person_id: int) -> AcquaintancesResponse:
    return await _service().list_acquaintances(person_id)


@router.post("/acquaintances/{acquaintance_id}/consent")
async def record_acquaintance_consent(acquaintance_id: int) -> AcquaintanceResponse:
    return await _service().record_acquaintance_consent(acquaintance_id)


@router.get("/stats")
async def get_graph_stats() -> GraphStatsResponse:
    return await _service().get_stats()
