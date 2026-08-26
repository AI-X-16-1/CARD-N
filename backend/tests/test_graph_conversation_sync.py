"""Happy-path and skip-branch tests for conversation_sync.sync_mentioned_people.

Monkeypatches the module's own _find_person_ids_by_name / _sync_mention_edge, same
style as test_graph_service.py — no fake Neo4j driver/session needed.
"""

import pytest

from app.features.graph import conversation_sync


def _driver() -> object:
    return object()


async def test_sync_mentioned_people_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    linked_edges: list[tuple[int, int]] = []

    async def fake_find(driver, name, exclude_id):
        assert name == "홍길동"
        assert exclude_id == 1
        return [5]

    async def fake_sync_edge(driver, person_id, mentioned_id):
        linked_edges.append((person_id, mentioned_id))

    monkeypatch.setattr(conversation_sync, "_find_person_ids_by_name", fake_find)
    monkeypatch.setattr(conversation_sync, "_sync_mention_edge", fake_sync_edge)

    linked = await conversation_sync.sync_mentioned_people(
        _driver(), person_id=1, mentions=[{"name": "홍길동", "confidence": 0.9}]
    )

    assert linked == [5]
    assert linked_edges == [(1, 5)]


async def test_sync_mentioned_people_skips_low_confidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_find(driver, name, exclude_id):
        raise AssertionError("should never look up a low-confidence mention")

    monkeypatch.setattr(conversation_sync, "_find_person_ids_by_name", fake_find)

    linked = await conversation_sync.sync_mentioned_people(
        _driver(), person_id=1, mentions=[{"name": "홍길동", "confidence": 0.2}]
    )

    assert linked == []


async def test_sync_mentioned_people_skips_ambiguous_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_find(driver, name, exclude_id):
        return [5, 6]

    async def fake_sync_edge(driver, person_id, mentioned_id):
        raise AssertionError("should never sync an ambiguous match")

    monkeypatch.setattr(conversation_sync, "_find_person_ids_by_name", fake_find)
    monkeypatch.setattr(conversation_sync, "_sync_mention_edge", fake_sync_edge)

    linked = await conversation_sync.sync_mentioned_people(
        _driver(), person_id=1, mentions=[{"name": "홍길동", "confidence": 0.9}]
    )

    assert linked == []


async def test_sync_mentioned_people_skips_unmatched_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_find(driver, name, exclude_id):
        return []

    monkeypatch.setattr(conversation_sync, "_find_person_ids_by_name", fake_find)

    linked = await conversation_sync.sync_mentioned_people(
        _driver(), person_id=1, mentions=[{"name": "존재안함", "confidence": 0.9}]
    )

    assert linked == []


async def test_sync_mentioned_people_skips_self_and_me(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_find(driver, name, exclude_id):
        # First mention resolves to "me" (id 0), second to the conversation's own
        # person_id (1) — both must be skipped without ever syncing an edge.
        return [conversation_sync.ME_PERSON_ID] if name == "김민경" else [1]

    async def fake_sync_edge(driver, person_id, mentioned_id):
        raise AssertionError("should never sync a self/me edge")

    monkeypatch.setattr(conversation_sync, "_find_person_ids_by_name", fake_find)
    monkeypatch.setattr(conversation_sync, "_sync_mention_edge", fake_sync_edge)

    linked = await conversation_sync.sync_mentioned_people(
        _driver(),
        person_id=1,
        mentions=[
            {"name": "김민경", "confidence": 0.9},
            {"name": "자기자신", "confidence": 0.9},
        ],
    )

    assert linked == []
