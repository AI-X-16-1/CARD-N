"""Happy-path tests for the graph feature service.

GraphService only orchestrates app.features.graph.queries — so these tests monkeypatch the
query functions instead of faking a Neo4j driver/session.
"""

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.features.graph import queries
from app.features.graph.schemas import (
    GraphEdgeResponse,
    GraphResponse,
    IntroductionRequestResponse,
)
from app.features.graph.service import GraphService

NOW = datetime(2024, 3, 20, 10, 0, tzinfo=UTC)


def _service() -> GraphService:
    return GraphService(driver=object())


async def test_get_graph_returns_me_and_first_degree_nodes(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch_me(driver, me_id):
        return {"id": 0, "name": "김민경"}

    async def fake_fetch_first_degree(driver, me_id):
        return [
            {
                "id": 1,
                "name": "홍길동",
                "job_class": "marketing",
                "company": "카카오",
                "weight": 3,
                "last_interaction": NOW,
            }
        ]

    monkeypatch.setattr(queries, "fetch_me", fake_fetch_me)
    monkeypatch.setattr(queries, "fetch_first_degree", fake_fetch_first_degree)

    result = await _service().get_graph(depth=1, job_filter="all")

    assert isinstance(result, GraphResponse)
    assert [node.type for node in result.nodes] == ["me", "person"]
    assert result.stats.degree_1_count == 1
    assert result.stats.degree_2_count == 0
    assert result.edges == [GraphEdgeResponse(source=0, target=1, weight=3, last_interaction=NOW)]
    assert result.nodes[1].introduction_request_status is None


async def test_get_graph_surfaces_my_outgoing_introduction_request_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_fetch_me(driver, me_id):
        return {"id": 0, "name": "김민경"}

    async def fake_fetch_first_degree(driver, me_id):
        return [
            {
                "id": 1,
                "name": "홍길동",
                "job_class": "marketing",
                "company": "카카오",
                "weight": 3,
                "last_interaction": NOW,
                "introduction_request_status": "pending",
            }
        ]

    monkeypatch.setattr(queries, "fetch_me", fake_fetch_me)
    monkeypatch.setattr(queries, "fetch_first_degree", fake_fetch_first_degree)

    result = await _service().get_graph(depth=1, job_filter="all")

    assert result.nodes[1].introduction_request_status == "pending"


async def test_get_graph_includes_second_degree_when_depth_two(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_fetch_me(driver, me_id):
        return {"id": 0, "name": "김민경"}

    async def fake_fetch_first_degree(driver, me_id):
        return [
            {
                "id": 1,
                "name": "홍길동",
                "job_class": "marketing",
                "company": "카카오",
                "weight": 3,
                "last_interaction": NOW,
            }
        ]

    async def fake_fetch_second_degree(driver, me_id, first_degree_ids):
        assert first_degree_ids == [1]
        return [
            {
                "id": 2,
                "name": "김디자인",
                "job_class": "design",
                "company": "카카오",
                "parent_id": 1,
                "weight": 1,
                "last_interaction": NOW,
            }
        ]

    monkeypatch.setattr(queries, "fetch_me", fake_fetch_me)
    monkeypatch.setattr(queries, "fetch_first_degree", fake_fetch_first_degree)
    monkeypatch.setattr(queries, "fetch_second_degree", fake_fetch_second_degree)

    result = await _service().get_graph(depth=2, job_filter="all")

    assert result.stats.degree_2_count == 1
    second_degree_node = next(node for node in result.nodes if node.degree == 2)
    assert second_degree_node.id == 2
    second_degree_edge = next(edge for edge in result.edges if edge.target == 2)
    assert second_degree_edge.source == 1


async def test_request_introduction_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_is_first_degree(driver, me_id, target_id):
        return True

    async def fake_get_intro_consent(driver, from_id, to_id):
        return None

    async def fake_upsert_intro_request(driver, from_id, to_id, requested_at):
        return {"status": "pending", "requested_at": requested_at, "responded_at": None}

    monkeypatch.setattr(queries, "is_first_degree", fake_is_first_degree)
    monkeypatch.setattr(queries, "get_intro_consent", fake_get_intro_consent)
    monkeypatch.setattr(queries, "upsert_intro_request", fake_upsert_intro_request)

    result = await _service().request_introduction(1)

    assert isinstance(result, IntroductionRequestResponse)
    assert result.person_id == 1
    assert result.status == "pending"


async def test_request_introduction_rejects_non_first_degree(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_is_first_degree(driver, me_id, target_id):
        return False

    monkeypatch.setattr(queries, "is_first_degree", fake_is_first_degree)

    with pytest.raises(HTTPException) as exc_info:
        await _service().request_introduction(99)

    assert exc_info.value.status_code == 404


async def test_get_introduction_request_returns_the_current_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_intro_consent(driver, from_id, to_id):
        assert (from_id, to_id) == (queries.ME_PERSON_ID, 1)
        return {"status": "pending", "requested_at": None, "responded_at": None}

    monkeypatch.setattr(queries, "get_intro_consent", fake_get_intro_consent)

    result = await _service().get_introduction_request(1)

    assert result.person_id == 1
    assert result.status == "pending"


async def test_get_introduction_request_is_null_when_never_asked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Not having asked is a state the row renders, not an error to raise."""

    async def fake_get_intro_consent(driver, from_id, to_id):
        return None

    monkeypatch.setattr(queries, "get_intro_consent", fake_get_intro_consent)

    result = await _service().get_introduction_request(99)

    assert result.person_id == 99
    assert result.status is None


async def test_respond_to_request_approve_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_respond(driver, from_id, to_id, status, responded_at):
        assert status == "approved"
        return {"status": "approved", "requested_at": NOW, "responded_at": responded_at}

    monkeypatch.setattr(queries, "respond_to_intro_request", fake_respond)

    result = await _service().respond_to_request(7, approve=True)

    assert result.person_id == 7
    assert result.status == "approved"


async def test_get_stats_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch_first_degree(driver, me_id):
        return [{"id": 1}]

    async def fake_fetch_second_degree(driver, me_id, first_degree_ids):
        assert first_degree_ids == [1]
        return [{"id": 2}, {"id": 3}]

    monkeypatch.setattr(queries, "fetch_first_degree", fake_fetch_first_degree)
    monkeypatch.setattr(queries, "fetch_second_degree", fake_fetch_second_degree)

    result = await _service().get_stats()

    assert result.degree_1_count == 1
    assert result.degree_2_count == 2


# ─────────────────────────────────────────────────────────────
# Acquaintances — the only way a 2nd-degree person gets into the graph
# ─────────────────────────────────────────────────────────────


async def test_add_acquaintance_starts_out_pending(monkeypatch: pytest.MonkeyPatch) -> None:
    """Recording who a contact knows must not expose that person yet.

    The 2nd-degree privacy rule (api-spec.md) is that they appear only once consent is
    recorded, so the edge this creates has to start unapproved or the rule is bypassed
    by the very feature that feeds it.
    """
    captured = {}

    async def fake_is_first_degree(driver, me_id, target_id):
        return True

    async def fake_next_id(driver):
        return -1

    async def fake_create(driver, *, contact_id, person_id, name, job_class):
        captured.update(contact_id=contact_id, person_id=person_id, name=name)
        return {"id": person_id, "name": name, "job_class": job_class, "status": "pending"}

    monkeypatch.setattr(queries, "is_first_degree", fake_is_first_degree)
    monkeypatch.setattr(queries, "next_acquaintance_id", fake_next_id)
    monkeypatch.setattr(queries, "create_acquaintance", fake_create)

    result = await _service().add_acquaintance(3, name="정하늘", job_class="marketing")

    assert result.status == "pending"
    assert result.id == -1, (
        "graph-only people take negative ids so they cannot collide with contacts"
    )
    assert captured["contact_id"] == 3


async def test_add_acquaintance_rejects_a_non_contact(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only someone I actually know can vouch for a person I do not."""

    async def fake_is_first_degree(driver, me_id, target_id):
        return False

    monkeypatch.setattr(queries, "is_first_degree", fake_is_first_degree)

    with pytest.raises(HTTPException) as exc_info:
        await _service().add_acquaintance(99, name="정하늘", job_class=None)

    assert exc_info.value.status_code == 404


async def test_consent_flips_pending_to_approved(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_approve(driver, acquaintance_id):
        return {"id": acquaintance_id, "name": "정하늘", "job_class": None, "status": "approved"}

    monkeypatch.setattr(queries, "approve_acquaintance", fake_approve)

    result = await _service().record_acquaintance_consent(-1)

    assert result.status == "approved"


async def test_consent_on_an_unknown_person_is_404(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_approve(driver, acquaintance_id):
        return None

    monkeypatch.setattr(queries, "approve_acquaintance", fake_approve)

    with pytest.raises(HTTPException) as exc_info:
        await _service().record_acquaintance_consent(-999)

    assert exc_info.value.status_code == 404
