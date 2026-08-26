"""Regression test for the bare-"me"-node bug: sync_person_node's MERGE created the
"me" Person node with no name property, which made GraphNodeResponse(name=...) 500 on
every GET /graph once a single contact existed (graph/queries.py's "Me" fallback only
applies when the node doesn't exist at all, not when it exists with name=None).
"""

from typing import Self

from app.features.contacts.graph_sync import sync_person_node


class _FakeSession:
    def __init__(self) -> None:
        self.queries: list[tuple[str, dict]] = []

    async def run(self, query: str, **params) -> None:
        self.queries.append((query, params))

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc_info) -> bool:
        return False


class _FakeDriver:
    def __init__(self) -> None:
        self.session_obj = _FakeSession()

    def session(self) -> _FakeSession:
        return self.session_obj


async def test_sync_person_node_backfills_a_null_me_name() -> None:
    driver = _FakeDriver()

    await sync_person_node(
        driver, person_id=1, name="Hong Gil-dong", company=None, job_class=None
    )

    query, params = driver.session_obj.queries[0]
    assert "coalesce(me.name, 'Me')" in query
    assert params["me_id"] == 0
