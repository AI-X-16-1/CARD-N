"""Conversation feature: the save / read-back / re-save path.

STT and the LLM call are deliberately not exercised here — both reach outside the
process (model weights, Gemini). What is worth pinning down is everything around them:
that a summary lands on the right contact, that re-summarizing the same recording
updates in place instead of inflating the meeting count, and that the prompt context
the server assembles reflects that.

The warmup tests at the bottom stay on the right side of that line by stubbing the
model out — what they pin down is when it gets built, not what it transcribes.
"""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.base import Base
from app.features.contacts.models import Person
from app.features.conversation import (
    models,  # noqa: F401  registers the table on Base.metadata
    stt,
    summarizer,
)
from app.features.conversation import service as service_module
from app.features.conversation.schemas import ConversationSummary, SaveConversationRequest
from app.features.conversation.service import ConversationService

SUMMARY = {
    "one_line": "온보딩 개편 초안 공유 및 11월 배포 일정 논의",
    "key_points": ["본인 인증 단계를 3단계에서 1단계로 축소", "11월 초 배포 목표"],
    "mentioned_people": [{"name": "박준호", "relation": "개발 담당 연구원", "confidence": 0.95}],
    "keywords": ["온보딩", "피그마"],
}


@pytest_asyncio.fixture()
async def db_session() -> AsyncIterator[AsyncSession]:
    """A session for the tests that drive ConversationService directly.

    The `client` fixture wires its own engine into the app; these tests bypass HTTP to
    watch what save() hands the graph feature, so they need a session of their own.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture()
async def person_id(db_session: AsyncSession) -> int:
    person = Person(name="김서연", company="토스")
    db_session.add(person)
    await db_session.commit()
    await db_session.refresh(person)
    return person.id


def _create_person(client: TestClient, name: str = "김서연") -> int:
    res = client.post("/api/v1/contacts", json={"name": name, "company": "토스"})
    assert res.status_code == 201
    return res.json()["id"]


def test_ping(client: TestClient) -> None:
    res = client.get("/api/v1/conversations/ping")
    assert res.status_code == 200
    assert res.json() == {"feature": "conversation", "status": "ok"}


def test_save_and_list(client: TestClient) -> None:
    person_id = _create_person(client)

    res = client.post(
        "/api/v1/conversations",
        json={
            "person_id": person_id,
            "transcript": "안녕하세요, 온보딩 개편 건으로 뵙습니다.",
            "summary": SUMMARY,
            "duration_seconds": 372,
        },
    )
    assert res.status_code == 201
    saved = res.json()
    assert saved["person_id"] == person_id
    assert saved["one_liner"] == SUMMARY["one_line"]
    assert saved["summary"]["mentioned_people"][0]["name"] == "박준호"
    assert saved["duration_seconds"] == 372

    listed = client.get("/api/v1/conversations", params={"person_id": person_id}).json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == saved["id"]

    # Saving bumps the contact's last_contact so timelines order correctly.
    person = client.get(f"/api/v1/contacts/{person_id}").json()
    assert person["last_contact"] is not None


def test_resaving_the_same_recording_updates_in_place(client: TestClient) -> None:
    person_id = _create_person(client)
    transcript = "같은 녹음을 두 번 요약하는 경우."

    first = client.post(
        "/api/v1/conversations",
        json={"person_id": person_id, "transcript": transcript, "summary": SUMMARY},
    ).json()

    revised = {**SUMMARY, "one_line": "다시 요약한 한 줄"}
    second = client.post(
        "/api/v1/conversations",
        json={"person_id": person_id, "transcript": transcript, "summary": revised},
    ).json()

    assert second["id"] == first["id"]
    assert second["one_liner"] == "다시 요약한 한 줄"

    listed = client.get("/api/v1/conversations", params={"person_id": person_id}).json()
    assert listed["total"] == 1, "the same recording must not count as a second meeting"


def test_different_recordings_stack_up(client: TestClient) -> None:
    person_id = _create_person(client)

    for text in ("첫 번째 대화입니다.", "두 번째 대화입니다."):
        client.post(
            "/api/v1/conversations",
            json={"person_id": person_id, "transcript": text, "summary": SUMMARY},
        )

    listed = client.get("/api/v1/conversations", params={"person_id": person_id}).json()
    assert listed["total"] == 2


def test_delete(client: TestClient) -> None:
    person_id = _create_person(client)
    saved = client.post(
        "/api/v1/conversations",
        json={"person_id": person_id, "transcript": "지울 대화", "summary": SUMMARY},
    ).json()

    assert client.delete(f"/api/v1/conversations/{saved['id']}").status_code == 204
    assert client.get("/api/v1/conversations", params={"person_id": person_id}).json()["total"] == 0
    assert client.delete(f"/api/v1/conversations/{saved['id']}").status_code == 404


def test_unknown_person_is_404(client: TestClient) -> None:
    res = client.post(
        "/api/v1/conversations",
        json={"person_id": 9999, "transcript": "없는 사람", "summary": SUMMARY},
    )
    assert res.status_code == 404

    assert client.get("/api/v1/conversations", params={"person_id": 9999}).status_code == 404


def test_summarize_rejects_empty_transcript(client: TestClient) -> None:
    res = client.post("/api/v1/conversations/summarize", json={"transcript": "   "})
    assert res.status_code == 400


# ─────────────────────────────────────────────────────────────
# Graph sync (docs/features.md touchpoint with 김민경)
# ─────────────────────────────────────────────────────────────


class _FakeDriver:
    """Stands in for AsyncDriver — the sync functions are stubbed, so it is never used."""


def _patch_sync(monkeypatch) -> dict[str, list]:
    """Record what ConversationService.save hands to the graph feature."""
    calls: dict[str, list] = {"bump": []}

    async def fake_bump(driver, *, person_id):
        calls["bump"].append(person_id)

    monkeypatch.setattr(service_module, "bump_conversation_weight", fake_bump)
    return calls


async def _save(person_id: int, transcript: str, summary: dict, db_session) -> None:
    await ConversationService(db_session, _FakeDriver()).save(
        SaveConversationRequest(
            person_id=person_id,
            transcript=transcript,
            summary=ConversationSummary.model_validate(summary),
        )
    )


async def test_graph_sync_runs_once_per_recording(monkeypatch, db_session, person_id) -> None:
    calls = _patch_sync(monkeypatch)

    await _save(person_id, "첫 대화", SUMMARY, db_session)
    assert calls["bump"] == [person_id]

    # Re-summarizing overwrites the row, so the graph must not count it again.
    await _save(person_id, "첫 대화", {**SUMMARY, "one_line": "다시 요약"}, db_session)
    assert calls["bump"] == [person_id], "re-summarize must not bump the weight again"

    # A different recording is a real second conversation.
    await _save(person_id, "두 번째 대화", SUMMARY, db_session)
    assert calls["bump"] == [person_id, person_id]


async def test_mentioned_people_never_reach_the_graph(monkeypatch, db_session, person_id) -> None:
    """A summary naming a third party must not become an edge — saving one only ever
    bumps the weight of the conversation's own contact.
    """
    calls = _patch_sync(monkeypatch)

    await _save(person_id, "제3자를 언급한 대화", SUMMARY, db_session)

    assert calls["bump"] == [person_id]
    assert not hasattr(service_module, "sync_mentioned_people")


async def test_graph_sync_is_skipped_without_a_driver(monkeypatch, db_session, person_id) -> None:
    calls = _patch_sync(monkeypatch)

    await ConversationService(db_session, None).save(
        SaveConversationRequest(
            person_id=person_id,
            transcript="드라이버 없음",
            summary=ConversationSummary.model_validate(SUMMARY),
        )
    )

    assert calls["bump"] == []


# ─────────────────────────────────────────────────────────────
# Retry policy — what is worth asking twice
# ─────────────────────────────────────────────────────────────


def _client_error(code: int) -> genai_errors.ClientError:
    return genai_errors.ClientError(code, {"error": {"message": f"boom {code}"}})


def _count_attempts(monkeypatch, raises: Exception) -> tuple[int, list[float]]:
    """Run summarize() against a call that always fails, counting tries and sleeps."""
    attempts = 0
    slept: list[float] = []

    def fake_call(prompt: str) -> str:
        nonlocal attempts
        attempts += 1
        raise raises

    monkeypatch.setattr(summarizer, "_call_llm", fake_call)
    monkeypatch.setattr(summarizer.time, "sleep", slept.append)

    with pytest.raises(Exception):  # noqa: B017 — the type is what each test asserts
        summarizer.summarize("면담 내용", use_cache=False)
    return attempts, slept


def test_missing_api_key_fails_immediately(monkeypatch) -> None:
    """No key is not a bad moment — sleeping 14 seconds first only hides the reason.

    This is what a teammate hits on a fresh clone, so the message they wait for should
    be the one telling them to add the key.
    """
    monkeypatch.setattr(summarizer, "_client", None)
    monkeypatch.setattr(summarizer.settings, "gemini_api_key", "")

    with pytest.raises(summarizer.SummaryUnavailable, match="GEMINI_API_KEY"):
        summarizer.summarize("면담 내용", use_cache=False)


def test_rejected_request_is_not_retried(monkeypatch) -> None:
    """A revoked key or an unknown model name answers the same way every time."""
    attempts, slept = _count_attempts(monkeypatch, _client_error(403))

    assert attempts == 1
    assert slept == []


def test_rate_limit_is_retried(monkeypatch) -> None:
    """429 is the opposite case: the quota resets, so backing off is the right move."""
    attempts, slept = _count_attempts(monkeypatch, _client_error(429))

    assert attempts == summarizer.MAX_RETRY
    assert slept == [2, 4, 8]


def test_transient_failure_is_still_retried(monkeypatch) -> None:
    attempts, _ = _count_attempts(monkeypatch, ConnectionError("connection reset"))

    assert attempts == summarizer.MAX_RETRY


def test_warmup_loads_the_model_up_front(monkeypatch) -> None:
    """The lifespan hook calls this so that no request has to wait for the load."""
    calls = []
    monkeypatch.setattr(stt, "_get_model", lambda: calls.append(1))
    monkeypatch.setattr(stt.settings, "whisper_warmup", True)

    stt.warmup()

    assert calls == [1]


def test_warmup_can_be_turned_off(monkeypatch) -> None:
    """Warming up moves the cost to startup, which `uvicorn --reload` then pays on
    every save — worth opting out of while developing."""
    calls = []
    monkeypatch.setattr(stt, "_get_model", lambda: calls.append(1))
    monkeypatch.setattr(stt.settings, "whisper_warmup", False)

    stt.warmup()

    assert calls == []


def test_the_model_is_built_once_and_under_the_lock(monkeypatch) -> None:
    """Requests transcribe in threadpool threads, so two of them arriving before the
    model is up would otherwise each load their own multi-gigabyte copy."""
    locked_while_building = []

    class _FakeModel:
        def __init__(self, name, device=None, compute_type=None) -> None:
            locked_while_building.append(stt._model_lock.locked())

    monkeypatch.setattr(stt, "WhisperModel", _FakeModel)
    monkeypatch.setattr(stt, "_model", None)
    monkeypatch.setattr(stt, "_loaded_key", "")

    first = stt._get_model()
    second = stt._get_model()

    assert locked_while_building == [True]
    assert first is second
