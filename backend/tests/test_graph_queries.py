"""Tests for the graph feature's SQL, against a real session.

tests/test_graph_service.py monkeypatches app.features.graph.queries, so it says nothing
about the statements themselves — and the statements are the whole risk surface of the
move off Neo4j (docs/neo4j-to-mysql-migration.md §9). These run the real thing.

The engine here is built locally rather than taken from conftest's `client` fixture,
because two of these tests need `PRAGMA foreign_keys=ON`: SQLite ignores foreign keys by
default, and the cascade that replaced `DETACH DELETE` would appear to work while deleting
nothing.
"""

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.dialects import mysql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.base import Base
from app.dependencies import get_db
from app.features.graph import queries
from app.features.graph.models import GraphEdge, GraphIntroConsent, GraphPerson
from app.features.graph.service import GraphService
from app.main import app

ME = queries.ME_PERSON_ID
DEVICE = "test-device-0001"
OTHER_DEVICE = "test-device-0002"
LAST_MARCH = datetime(2024, 3, 15, 14, 0, tzinfo=UTC)


@pytest_asyncio.fixture()
async def db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _enforce_foreign_keys(dbapi_connection, _record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


async def _add_person(db, person_id: int, name: str, device_id: str = DEVICE, **fields) -> None:
    await queries.upsert_person(
        db,
        device_id,
        person_id=person_id,
        name=name,
        company=fields.get("company"),
        job_class=fields.get("job_class"),
    )


async def _count(db, model) -> int:
    result = await db.execute(select(func.count()).select_from(model))
    return int(result.scalar_one())


# ─────────────────────────────────────────────────────────────
# MET_AT is undirected
# ─────────────────────────────────────────────────────────────


async def test_edge_is_stored_once_whichever_way_round_it_is_written(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")

    await queries.ensure_edge(db, DEVICE, ME, 7)
    await queries.ensure_edge(db, DEVICE, 7, ME)

    assert await _count(db, GraphEdge) == 1


async def test_a_new_edge_starts_at_zero_conversations(db) -> None:
    """`weight` is what the API returns as `conversation_count`. Saving someone's card is
    not a conversation — the Neo4j version started at 1 and read one high forever.
    """
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")

    await queries.ensure_edge(db, DEVICE, ME, 7)

    edge = (await db.execute(select(GraphEdge))).scalar_one()
    assert edge.weight == 0


async def test_ensure_edge_does_not_reset_an_existing_weight(db) -> None:
    """Cypher's ON CREATE SET. Without it, editing a contact would throw away every
    conversation counted on that edge so far.
    """
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await queries.ensure_edge(db, DEVICE, ME, 7)
    await queries.bump_edge_weight(db, DEVICE, ME, 7)
    await queries.bump_edge_weight(db, DEVICE, ME, 7)

    await queries.ensure_edge(db, DEVICE, ME, 7)

    edge = (await db.execute(select(GraphEdge))).scalar_one()
    assert edge.weight == 2


async def test_bump_edge_weight_is_a_no_op_without_an_edge(db) -> None:
    await _add_person(db, 7, "홍길동")

    await queries.bump_edge_weight(db, DEVICE, ME, 7)

    assert await _count(db, GraphEdge) == 0


async def test_ensure_me_keeps_a_name_that_is_already_there(db) -> None:
    await queries.upsert_person(
        db, DEVICE, person_id=ME, name="김민경", company=None, job_class=None
    )

    await queries.ensure_me(db, DEVICE, ME)

    me = await queries.fetch_me(db, DEVICE, ME)
    assert me["name"] == "김민경"


# ─────────────────────────────────────────────────────────────
# DETACH DELETE became ON DELETE CASCADE
# ─────────────────────────────────────────────────────────────


async def test_deleting_a_person_takes_their_edges_and_consents_with_them(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await queries.ensure_edge(db, DEVICE, ME, 7)
    await queries.upsert_intro_request(db, DEVICE, ME, 7, datetime.now(UTC))
    await db.commit()

    await queries.delete_person(db, DEVICE, 7)
    await db.commit()

    assert await _count(db, GraphEdge) == 0
    assert await _count(db, GraphIntroConsent) == 0
    assert await _count(db, GraphPerson) == 1  # "me" is still there


# ─────────────────────────────────────────────────────────────
# The 2nd-degree consent gate
# ─────────────────────────────────────────────────────────────


async def _seed_contact_with_acquaintance(db) -> int:
    """Me → 홍길동 (contact), 홍길동 → someone I have never met. Returns their id."""
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동", job_class="marketing", company="카카오")
    await queries.ensure_edge(db, DEVICE, ME, 7)
    await db.commit()

    acquaintance = await GraphService(db, DEVICE).add_acquaintance(
        7, name="정하늘", job_class="dev"
    )
    return acquaintance.id


async def test_an_acquaintance_is_invisible_until_their_consent_is_recorded(db) -> None:
    acquaintance_id = await _seed_contact_with_acquaintance(db)

    graph = await GraphService(db, DEVICE).get_graph(depth=2, job_filter="all")

    assert acquaintance_id not in [node.id for node in graph.nodes]
    assert graph.stats.degree_2_count == 0


async def test_an_acquaintance_appears_once_consent_is_recorded(db) -> None:
    acquaintance_id = await _seed_contact_with_acquaintance(db)

    await GraphService(db, DEVICE).record_acquaintance_consent(acquaintance_id)
    graph = await GraphService(db, DEVICE).get_graph(depth=2, job_filter="all")

    second_degree = [node for node in graph.nodes if node.degree == 2]
    assert [node.id for node in second_degree] == [acquaintance_id]
    assert graph.stats.degree_2_count == 1
    # Through the contact who vouched for them, not through me.
    assert graph.edges[-1].source == 7
    assert graph.edges[-1].target == acquaintance_id


async def test_consent_in_the_wrong_direction_does_not_expose_anyone(db) -> None:
    """The privacy rule in api-spec.md is a join direction.

    It is the 2nd-degree person who consents to being surfaced through the contact
    (person -> parent). A row pointing the other way is the contact agreeing to something
    on a stranger's behalf, and must not reveal them.
    """
    acquaintance_id = await _seed_contact_with_acquaintance(db)
    await db.execute(
        GraphIntroConsent.__table__.delete().where(
            GraphIntroConsent.device_id == DEVICE,
            GraphIntroConsent.from_person_id == acquaintance_id,
        )
    )
    await db.execute(
        GraphIntroConsent.__table__.insert().values(
            device_id=DEVICE,
            from_person_id=7,
            to_person_id=acquaintance_id,
            status="approved",
        )
    )
    await db.commit()

    graph = await GraphService(db, DEVICE).get_graph(depth=2, job_filter="all")

    assert graph.stats.degree_2_count == 0


async def test_acquaintance_ids_walk_downwards_from_minus_one(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await queries.ensure_edge(db, DEVICE, ME, 7)
    await db.commit()

    service = GraphService(db, DEVICE)
    first = await service.add_acquaintance(7, name="정하늘", job_class=None)
    second = await service.add_acquaintance(7, name="이서준", job_class=None)

    assert [first.id, second.id] == [-1, -2]


async def test_add_acquaintance_rejects_someone_who_is_not_my_contact(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")  # no edge: known to the graph, not met by me
    await db.commit()

    with pytest.raises(Exception) as exc_info:
        await GraphService(db, DEVICE).add_acquaintance(7, name="정하늘", job_class=None)

    assert exc_info.value.detail == "NOT_FIRST_DEGREE"


# ─────────────────────────────────────────────────────────────
# Introduction requests
# ─────────────────────────────────────────────────────────────


async def test_responding_to_a_request_that_was_never_made_returns_nothing(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await db.commit()

    answered = await queries.respond_to_intro_request(
        db, DEVICE, 7, ME, "approved", datetime.now(UTC)
    )

    assert answered is None


async def test_answering_an_already_answered_request_returns_nothing(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await queries.upsert_intro_request(db, DEVICE, 7, ME, datetime.now(UTC))
    await db.commit()

    first = await queries.respond_to_intro_request(db, DEVICE, 7, ME, "approved", datetime.now(UTC))
    second = await queries.respond_to_intro_request(
        db, DEVICE, 7, ME, "declined", datetime.now(UTC)
    )

    assert first is not None and first["status"] == "approved"
    assert second is None


async def test_asking_again_after_a_decline_reopens_the_same_request(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await queries.upsert_intro_request(db, DEVICE, ME, 7, datetime.now(UTC))
    await queries.respond_to_intro_request(db, DEVICE, ME, 7, "declined", datetime.now(UTC))

    reopened = await queries.upsert_intro_request(db, DEVICE, ME, 7, datetime.now(UTC))

    assert reopened["status"] == "pending"
    assert reopened["responded_at"] is None
    assert await _count(db, GraphIntroConsent) == 1


# ─────────────────────────────────────────────────────────────
# Timestamps survive the move to a column without a timezone
# ─────────────────────────────────────────────────────────────


async def test_timestamps_come_back_as_utc(db) -> None:
    await queries.ensure_me(db, DEVICE, ME)
    await _add_person(db, 7, "홍길동")
    await queries.ensure_edge(db, DEVICE, ME, 7)
    await db.commit()

    [row] = await queries.fetch_first_degree(db, DEVICE, ME)

    assert row["last_interaction"].tzinfo is not None
    assert row["last_interaction"].utcoffset().total_seconds() == 0


def test_the_api_still_serializes_timestamps_with_a_z() -> None:
    """MySQL DATETIME has no timezone, and a naive string is read as *local* time by the
    client — nine hours off, here. api-spec.md documents "2024-03-15T14:00:00Z".
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _seed() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            await queries.ensure_me(session, DEVICE, ME)
            await session.execute(
                GraphPerson.__table__.insert().values(device_id=DEVICE, id=7, name="홍길동")
            )
            await session.execute(
                GraphEdge.__table__.insert().values(
                    device_id=DEVICE,
                    person_a_id=ME,
                    person_b_id=7,
                    weight=3,
                    last_interaction=LAST_MARCH.replace(tzinfo=None),
                )
            )
            await session.commit()

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    import asyncio

    asyncio.run(_seed())
    app.dependency_overrides[get_db] = _override_get_db
    try:
        response = TestClient(app, headers={"X-Device-Id": DEVICE}).get("/api/v1/graph?depth=1")
    finally:
        app.dependency_overrides.pop(get_db, None)
        asyncio.run(engine.dispose())

    assert response.status_code == 200
    [contact] = [node for node in response.json()["nodes"] if node["type"] == "person"]
    assert contact["last_conversation"] == "2024-03-15T14:00:00Z"


# ─────────────────────────────────────────────────────────────
# The dialect the app actually runs on
# ─────────────────────────────────────────────────────────────


class _MysqlBind:
    dialect = mysql.dialect()


class _MysqlSession:
    """Enough of an AsyncSession for _upsert to pick its dialect branch."""

    def get_bind(self):
        return _MysqlBind()


def test_the_upsert_helper_compiles_for_mysql() -> None:
    """Everything above runs on SQLite, so the branch the app actually uses would
    otherwise never be compiled until someone started the server.
    """
    statement = queries._upsert(
        _MysqlSession(),
        GraphEdge,
        {
            "device_id": DEVICE,
            "person_a_id": 0,
            "person_b_id": 7,
            "weight": 1,
            "last_interaction": None,
        },
        {"person_a_id": 0},
    )

    sql = str(statement.compile(dialect=mysql.dialect()))

    assert "INSERT INTO graph_edges" in sql
    assert "ON DUPLICATE KEY UPDATE" in sql
    # The no-op that stands in for Cypher's ON CREATE SET: an existing edge keeps its
    # weight. If this ever starts assigning something else, every contact edit would
    # reset the conversation count.
    assert "weight" not in sql.split("ON DUPLICATE KEY UPDATE")[1]
