"""SQL queries for the graph feature.

These were Cypher against Neo4j until docs/neo4j-to-mysql-migration.md; the shapes they
return are unchanged, because GraphService reads them by key and the HTTP API is built
straight off that.

Two things carried over from Cypher need care here, and both have a test:

* `MET_AT` was undirected. A row is not, so every write goes through `pair()` and every
  read goes through `ADJACENCY` — see GraphEdge's docstring.
* Neo4j returned timezone-aware UTC timestamps, which is what api-spec.md documents and
  what the client parses. MySQL DATETIME has no timezone, so `_utc()` puts it back before
  the row reaches Pydantic. Dropping that turns every timestamp in the API from
  "...T14:00:00Z" into a naive string the client reads as local time.

Nothing here commits. Reads don't need to, and the writes are deliberately left joinable
to the caller's transaction (contacts/graph_sync.py and graph/conversation_sync.py rely on
exactly that); GraphService commits its own.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Row, Select, and_, delete, func, insert, select, union_all, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.graph.models import GraphEdge, GraphIntroConsent, GraphPerson

# Single-user MVP: the signed-in person is always the graph_persons row with this id.
ME_PERSON_ID = 0


def pair(x: int, y: int) -> tuple[int, int]:
    """MET_AT is undirected; store it once, always smallest id first."""
    return (x, y) if x <= y else (y, x)


# Every stored edge, expanded into both directions, so the reads below can be written as
# if edges were directed. This is what `MATCH (a)-[:MET_AT]-(b)` did for free.
ADJACENCY = union_all(
    select(
        GraphEdge.person_a_id.label("from_id"),
        GraphEdge.person_b_id.label("to_id"),
        GraphEdge.weight.label("weight"),
        GraphEdge.last_interaction.label("last_interaction"),
    ),
    select(
        GraphEdge.person_b_id.label("from_id"),
        GraphEdge.person_a_id.label("to_id"),
        GraphEdge.weight.label("weight"),
        GraphEdge.last_interaction.label("last_interaction"),
    ),
).cte("adjacency")


def _utc(value: Any) -> Any:
    """MySQL hands back a naive DATETIME; everything here is written as UTC."""
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _naive(value: datetime) -> datetime:
    """The other half of _utc: UTC goes in, without a tzinfo the column cannot hold.

    Normalising here rather than at each call site keeps the two dialects behaving the
    same — MySQL would silently drop the offset, SQLite would keep formatting whatever
    wall clock it was handed, and a caller passing KST would write KST to one and UTC to
    the other.
    """
    return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _row(record: Row) -> dict:
    return {key: _utc(value) for key, value in record._mapping.items()}


async def _rows(db: AsyncSession, stmt: Select) -> list[dict]:
    result = await db.execute(stmt)
    return [_row(record) for record in result.all()]


async def _one(db: AsyncSession, stmt: Select) -> dict | None:
    result = await db.execute(stmt)
    record = result.first()
    return _row(record) if record is not None else None


def _upsert(db: AsyncSession, table: Any, values: dict, update_values: dict) -> Any:
    """INSERT .. ON CONFLICT DO UPDATE, spelled for whichever dialect is in play.

    MySQL in the app, SQLite under pytest — the statement is dialect-specific in both, so
    it is built here rather than duplicated at each of the three call sites.
    """
    if db.get_bind().dialect.name == "mysql":
        stmt = mysql_insert(table).values(**values)
        return stmt.on_duplicate_key_update(**update_values)

    stmt = sqlite_insert(table).values(**values)
    return stmt.on_conflict_do_update(
        index_elements=list(_conflict_columns(table)), set_=update_values
    )


def _conflict_columns(table: Any) -> tuple[str, ...]:
    if table is GraphIntroConsent:
        return ("from_person_id", "to_person_id")
    if table is GraphEdge:
        return ("person_a_id", "person_b_id")
    return ("id",)


# ─────────────────────────────────────────────────────────────
# Reads
# ─────────────────────────────────────────────────────────────


async def fetch_me(db: AsyncSession, me_id: int) -> dict:
    row = await _one(db, select(GraphPerson.id, GraphPerson.name).where(GraphPerson.id == me_id))
    return row if row is not None else {"id": me_id, "name": "Me"}


async def fetch_first_degree(db: AsyncSession, me_id: int) -> list[dict]:
    stmt = (
        select(
            GraphPerson.id,
            GraphPerson.name,
            GraphPerson.job_class,
            GraphPerson.company,
            ADJACENCY.c.weight,
            ADJACENCY.c.last_interaction,
            GraphIntroConsent.status.label("introduction_request_status"),
        )
        .select_from(ADJACENCY)
        .join(GraphPerson, GraphPerson.id == ADJACENCY.c.to_id)
        .outerjoin(
            GraphIntroConsent,
            and_(
                GraphIntroConsent.from_person_id == me_id,
                GraphIntroConsent.to_person_id == GraphPerson.id,
            ),
        )
        .where(ADJACENCY.c.from_id == me_id)
    )
    return await _rows(db, stmt)


async def fetch_second_degree(
    db: AsyncSession, me_id: int, first_degree_ids: list[int]
) -> list[dict]:
    """Candidates one hop past my contacts, filtered to those who consented to be seen.

    The consent join direction is the privacy rule in api-spec.md, not a detail: it is the
    *2nd-degree person* who agreed to be surfaced *through the connecting contact*
    (`person -> parent`). Reversing it would return people who never agreed to anything.
    """
    stmt = (
        select(
            GraphPerson.id,
            GraphPerson.name,
            GraphPerson.job_class,
            GraphPerson.company,
            ADJACENCY.c.from_id.label("parent_id"),
            ADJACENCY.c.weight,
            ADJACENCY.c.last_interaction,
        )
        .select_from(ADJACENCY)
        .join(GraphPerson, GraphPerson.id == ADJACENCY.c.to_id)
        .join(
            GraphIntroConsent,
            and_(
                GraphIntroConsent.from_person_id == GraphPerson.id,
                GraphIntroConsent.to_person_id == ADJACENCY.c.from_id,
                GraphIntroConsent.status == "approved",
            ),
        )
        .where(
            ADJACENCY.c.from_id.in_(first_degree_ids),
            GraphPerson.id != me_id,
            GraphPerson.id.not_in(first_degree_ids),
        )
    )
    return await _rows(db, stmt)


async def is_first_degree(db: AsyncSession, me_id: int, target_id: int) -> bool:
    lo, hi = pair(me_id, target_id)
    result = await db.execute(
        select(func.count())
        .select_from(GraphEdge)
        .where(GraphEdge.person_a_id == lo, GraphEdge.person_b_id == hi)
    )
    return bool(result.scalar_one())


async def person_exists(db: AsyncSession, person_id: int) -> bool:
    result = await db.execute(
        select(func.count()).select_from(GraphPerson).where(GraphPerson.id == person_id)
    )
    return bool(result.scalar_one())


async def get_intro_consent(db: AsyncSession, from_id: int, to_id: int) -> dict | None:
    return await _one(
        db,
        select(
            GraphIntroConsent.status,
            GraphIntroConsent.requested_at,
            GraphIntroConsent.responded_at,
        ).where(
            GraphIntroConsent.from_person_id == from_id,
            GraphIntroConsent.to_person_id == to_id,
        ),
    )


async def fetch_incoming_intro_requests(db: AsyncSession, me_id: int) -> list[dict]:
    stmt = (
        select(
            GraphPerson.id.label("person_id"),
            GraphPerson.name,
            GraphPerson.job_class,
            GraphPerson.company,
            GraphIntroConsent.requested_at,
        )
        .select_from(GraphIntroConsent)
        .join(GraphPerson, GraphPerson.id == GraphIntroConsent.from_person_id)
        .where(
            GraphIntroConsent.to_person_id == me_id,
            GraphIntroConsent.status == "pending",
        )
        .order_by(GraphIntroConsent.requested_at.asc())
    )
    return await _rows(db, stmt)


# ─────────────────────────────────────────────────────────────
# Introduction requests
# ─────────────────────────────────────────────────────────────


async def upsert_intro_request(
    db: AsyncSession, from_id: int, to_id: int, requested_at: datetime
) -> dict:
    """Ask, or ask again after a decline. Callers check is_first_degree first, so both
    endpoints exist; the foreign keys are a backstop, not the control flow.
    """
    await db.execute(
        _upsert(
            db,
            GraphIntroConsent,
            {
                "from_person_id": from_id,
                "to_person_id": to_id,
                "status": "pending",
                "requested_at": _naive(requested_at),
                "responded_at": None,
            },
            {"status": "pending", "requested_at": _naive(requested_at), "responded_at": None},
        )
    )
    row = await get_intro_consent(db, from_id, to_id)
    assert row is not None
    return row


async def respond_to_intro_request(
    db: AsyncSession, from_id: int, to_id: int, status: str, responded_at: datetime
) -> dict | None:
    """Approve or decline a pending request. None when there is no pending one to answer.

    Decided by selecting first rather than by rowcount: MySQL reports zero affected rows
    when an UPDATE writes values identical to the existing ones, which would turn a
    legitimate response into a spurious 404.
    """
    existing = await _one(
        db,
        select(GraphIntroConsent.id).where(
            GraphIntroConsent.from_person_id == from_id,
            GraphIntroConsent.to_person_id == to_id,
            GraphIntroConsent.status == "pending",
        ),
    )
    if existing is None:
        return None

    await db.execute(
        update(GraphIntroConsent)
        .where(GraphIntroConsent.id == existing["id"])
        .values(status=status, responded_at=_naive(responded_at))
    )
    return await get_intro_consent(db, from_id, to_id)


# ─────────────────────────────────────────────────────────────
# Acquaintances: people a contact knows, who are not contacts of mine
# ─────────────────────────────────────────────────────────────
#
# Contact ids come from MySQL's autoincrement, so they are always positive, and "me" is 0.
# Someone who exists only in the graph therefore takes a negative id — it cannot collide
# with a contact created later, and the sign alone says "this person is not in my contacts".


async def next_acquaintance_id(db: AsyncSession) -> int:
    """The next free negative id.

    Racy on its own, as it was against Neo4j. The difference is that the caller runs this
    and the insert in one transaction now, and the primary key rejects a collision instead
    of two people quietly merging into one node — see GraphService.add_acquaintance.
    """
    result = await db.execute(
        select(func.coalesce(func.min(GraphPerson.id), 0) - 1).where(GraphPerson.id < 0)
    )
    return int(result.scalar_one())


async def create_acquaintance(
    db: AsyncSession, *, contact_id: int, person_id: int, name: str, job_class: str | None
) -> dict:
    """Add the person, the edge to the contact who knows them, and their pending consent.

    Three statements where Cypher had one, so they must stay in one transaction — a person
    with no consent row would be invisible forever, and a consent row with no person would
    break every read that joins the two.

    Starts unapproved on purpose: a 2nd-degree person appears only once consent is recorded
    (api-spec.md's privacy rule), so creating them already approved would let this endpoint
    hand out the exposure the rule exists to withhold.
    """
    now = _now()
    lo, hi = pair(contact_id, person_id)

    await db.execute(insert(GraphPerson).values(id=person_id, name=name, job_class=job_class))
    await db.execute(
        insert(GraphEdge).values(
            person_a_id=lo,
            person_b_id=hi,
            weight=1,
            last_interaction=now,
            origin="acquaintance",
        )
    )
    await db.execute(
        insert(GraphIntroConsent).values(
            from_person_id=person_id,
            to_person_id=contact_id,
            status="pending",
            requested_at=now,
        )
    )
    return {"id": person_id, "name": name, "job_class": job_class, "status": "pending"}


async def approve_acquaintance(db: AsyncSession, acquaintance_id: int) -> dict | None:
    await db.execute(
        update(GraphIntroConsent)
        .where(GraphIntroConsent.from_person_id == acquaintance_id)
        .values(status="approved", responded_at=_now())
    )
    stmt = (
        select(
            GraphPerson.id,
            GraphPerson.name,
            GraphPerson.job_class,
            GraphIntroConsent.status,
        )
        .select_from(GraphPerson)
        .join(GraphIntroConsent, GraphIntroConsent.from_person_id == GraphPerson.id)
        .where(GraphPerson.id == acquaintance_id)
    )
    result = await db.execute(stmt)
    records = result.all()
    # An acquaintance has exactly one consent row by construction (create_acquaintance).
    # More than one means something upstream is wrong; picking one quietly would hide it.
    assert len(records) <= 1, f"acquaintance {acquaintance_id} has {len(records)} consents"
    return _row(records[0]) if records else None


async def fetch_acquaintances(db: AsyncSession, contact_id: int) -> list[dict]:
    stmt = (
        select(
            GraphPerson.id,
            GraphPerson.name,
            GraphPerson.job_class,
            GraphIntroConsent.status,
        )
        .select_from(GraphIntroConsent)
        .join(GraphPerson, GraphPerson.id == GraphIntroConsent.from_person_id)
        .where(GraphIntroConsent.to_person_id == contact_id, GraphPerson.id < 0)
        .order_by(GraphPerson.id.desc())
    )
    return await _rows(db, stmt)


# ─────────────────────────────────────────────────────────────
# Writes used by other features' sync paths
# ─────────────────────────────────────────────────────────────


async def upsert_person(
    db: AsyncSession,
    *,
    person_id: int,
    name: str,
    company: str | None,
    job_class: str | None,
) -> None:
    """Keep the graph's view of a person's display fields current."""
    await db.execute(
        _upsert(
            db,
            GraphPerson,
            {"id": person_id, "name": name, "job_class": job_class, "company": company},
            {"name": name, "job_class": job_class, "company": company},
        )
    )


async def ensure_me(db: AsyncSession, me_id: int) -> None:
    """Create the "me" node if it isn't there, and never touch its name if it is.

    The Cypher used `coalesce(me.name, 'Me')` so an existing name survived; name is NOT
    NULL here, so a no-op update says the same thing.
    """
    await db.execute(_upsert(db, GraphPerson, {"id": me_id, "name": "Me"}, {"id": me_id}))


async def ensure_edge(db: AsyncSession, first_id: int, second_id: int) -> None:
    """Create the edge if it isn't there, leaving an existing one alone.

    The no-op update is Cypher's `ON CREATE SET`: resetting weight here would throw away
    everything conversation_sync.py has accumulated, on every contact edit.
    """
    lo, hi = pair(first_id, second_id)
    await db.execute(
        _upsert(
            db,
            GraphEdge,
            {
                "person_a_id": lo,
                "person_b_id": hi,
                "weight": 1,
                "last_interaction": _now(),
            },
            {"person_a_id": lo},
        )
    )


async def delete_person(db: AsyncSession, person_id: int) -> None:
    """Drop a person and, by cascade, their edges and consent rows — `DETACH DELETE`."""
    await db.execute(delete(GraphPerson).where(GraphPerson.id == person_id))


async def bump_edge_weight(db: AsyncSession, first_id: int, second_id: int) -> None:
    """Count one more conversation on an existing edge. No-op when there is no edge."""
    lo, hi = pair(first_id, second_id)
    await db.execute(
        update(GraphEdge)
        .where(GraphEdge.person_a_id == lo, GraphEdge.person_b_id == hi)
        .values(weight=GraphEdge.weight + 1, last_interaction=_now())
    )
