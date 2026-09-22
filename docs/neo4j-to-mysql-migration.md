# Neo4j → MySQL Migration Plan

**Status**: proposal, not yet implemented. Written 2026-09-21 by 김민경 (graph owner).
**Goal**: remove Neo4j from CARD:N and serve the relationship graph from the existing MySQL
instance, without changing a single byte of the HTTP API.

---

## 1. Why this is possible

Neo4j earns its keep when a query walks an *unbounded* or *unknown* number of hops — shortest
paths, communities, `MATCH (a)-[*..8]-(b)`. Nothing in CARD:N does that. Every Cypher statement
in the repo today is a fixed 1- or 2-hop lookup:

| Query | Hops | Notes |
|---|---|---|
| `_ME_QUERY` | 0 | single node by id |
| `_FIRST_DEGREE_QUERY` | 1 | `depth` is capped at 2 by `Query(1, ge=1, le=2)` in `router.py` |
| `_SECOND_DEGREE_QUERY` | 2 | and the 2nd hop is driven by a Python-side id list, not a traversal |
| `_IS_FIRST_DEGREE_QUERY` | 1 | existence check |
| intro-consent queries (5) | 0–1 | a single directed edge, read/written by its two endpoints |
| acquaintance queries (4) | 0–1 | insert a node + one edge + one consent |
| `contacts/graph_sync.py` (2) | 0–1 | upsert a node, upsert one edge, delete a node |
| `graph/conversation_sync.py` (1) | 1 | `UPDATE` one edge property |

`GraphService.get_graph` already does the "traversal" in Python: it fetches 1st-degree rows,
collects `first_degree_ids`, and passes that list into the 2nd-degree query. Neo4j is being used
as a key-value store for nodes and edges with a Cypher accent.

What we actually pay for it: a second database engine, a second driver, a second connection
lifecycle (`app/neo4j_driver.py`, `close_neo4j_driver` in the lifespan hook), a second container
in `docker-compose.yml`, a second set of credentials, a second consistency problem (the
"best-effort sync" in `contacts/graph_sync.py` and `graph/conversation_sync.py`), and a type
conversion layer (`_to_native` for `neo4j.time.DateTime`). All of that goes away.

**What we give up**: variable-depth traversal. If 3rd-degree connections, shortest-path
("how do I reach this person?") or community detection ever become features, they would need
recursive CTEs in MySQL 8 — workable, but genuinely worse than Cypher. Document that trade-off
in the PR so nobody has to rediscover it. Given `depth` is hard-capped at 2 in the API and the
2nd-degree view is gated by explicit consent (not by traversal), this is not a near-term risk.

---

## 2. Scope

### Unchanged

- **The whole HTTP API.** Same paths, same request/response bodies, same error codes. See §6 for
  the two serialization details that must be deliberately preserved.
- **The entire frontend.** No file under `frontend/src/features/graph/` needs to change. (One
  stale *comment* in `frontend/src/features/contacts/api.ts:82-85` mentions Neo4j — cosmetic,
  see §7.)
- **MySQL's existing tables.** `persons`, `my_card`, `conversations`, `battle_cards`, `decks`
  are untouched.

### Changed

| File | Change | Owner |
|---|---|---|
| `backend/app/features/graph/models.py` | **new** — 3 SQLAlchemy models | 김민경 |
| `backend/app/features/graph/queries.py` | Cypher → SQLAlchemy, `driver` → `db` | 김민경 |
| `backend/app/features/graph/service.py` | `AsyncDriver` → `AsyncSession` | 김민경 |
| `backend/app/features/graph/router.py` | `get_neo4j_driver()` → `Depends(get_db)` | 김민경 |
| `backend/app/features/graph/conversation_sync.py` | one `UPDATE` | 김민경 |
| `backend/alembic/versions/xxxx_add_graph_tables.py` | **new** migration | 김민경 |
| `backend/app/features/contacts/graph_sync.py` | Cypher → SQL, drop `try/except` (see §7) | 강민구 |
| `backend/app/features/contacts/service.py` | drop the `neo4j_driver` ctor arg | 강민구 |
| `backend/app/features/contacts/router.py` | drop the driver dependency | 강민구 |
| `backend/app/features/conversation/service.py` | drop the `neo4j_driver` ctor arg | 박재경 |
| `backend/app/features/conversation/router.py` | drop the driver dependency | 박재경 |
| `backend/app/neo4j_driver.py` | **delete** | shared — PR |
| `backend/app/dependencies.py` | drop `get_neo4j_driver` | shared — PR |
| `backend/app/config.py` | drop 3 `neo4j_*` settings | shared — PR |
| `backend/app/main.py` | drop the import + `close_neo4j_driver()` | shared — PR |
| `backend/pyproject.toml` | drop `neo4j>=6.2.0`, re-lock | shared — PR |
| `docker-compose.yml` | drop the `neo4j` service, volume, `depends_on` | shared — PR |
| `backend/tests/conftest.py` | drop the driver override, register graph models | shared — PR |
| `backend/tests/test_config.py`, `test_contacts_graph_sync.py` | rewrite | shared — PR |
| `docs/architecture.md`, `docs/features.md`, `docs/conventions.md`, `README.md`, `backend/CLAUDE.md`, `CLAUDE.md` | remove Neo4j | shared — PR |

---

## 3. Target schema

### Design decision: keep a mirror table

The graph keeps its own `graph_persons` table mirroring `name` / `job_class` / `company`, exactly
as the `:Person` node does today. The obvious alternative — drop the mirror and `JOIN persons`
directly — was considered and **rejected**:

1. **Not every graph node is a contact.** `me` is id `0` (`my_card`, not `persons`) and
   acquaintances take negative ids and exist only in the graph. A join against `persons` alone
   cannot produce the node set, so edges could not carry a foreign key to anything — which means
   no `ON DELETE CASCADE`, and orphaned edges after every contact deletion.
2. **Feature boundaries.** `backend/CLAUDE.md` §1 keeps features from reaching into each other's
   internals; `features/graph/queries.py` selecting from `contacts`' `Person` model (whose `phone`
   and `email` are `EncryptedString` columns) is precisely that. The mirror keeps the graph's
   read path inside `features/graph/`.

The mirror is what we already have. The difference is that after this migration it lives in the
same database and the same transaction as the write that produces it — so it can finally be
*correct* (§7).

### DDL

```sql
CREATE TABLE graph_persons (
    -- Shared id space, unchanged from the Neo4j model:
    --   0        = me
    --   > 0      = persons.id (mirrored from MySQL by contacts/graph_sync.py)
    --   < 0      = acquaintance, exists only in the graph
    -- Deliberately NOT a foreign key to persons.id: negative ids and 0 have no row there.
    id           BIGINT       NOT NULL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    job_class    VARCHAR(30)  NULL,
    company      VARCHAR(150) NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE graph_edges (
    -- MET_AT. Undirected, stored once: person_a_id < person_b_id is an invariant
    -- enforced by the application (see §4), which is what makes the UNIQUE key work.
    id               BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    person_a_id      BIGINT      NOT NULL,
    person_b_id      BIGINT      NOT NULL,
    weight           INT         NOT NULL DEFAULT 1,
    last_interaction DATETIME    NULL,
    origin           VARCHAR(20) NULL,          -- 'acquaintance', else NULL
    CONSTRAINT uq_graph_edge UNIQUE (person_a_id, person_b_id),
    CONSTRAINT fk_edge_a FOREIGN KEY (person_a_id) REFERENCES graph_persons(id) ON DELETE CASCADE,
    CONSTRAINT fk_edge_b FOREIGN KEY (person_b_id) REFERENCES graph_persons(id) ON DELETE CASCADE,
    INDEX ix_graph_edges_b (person_b_id)
);

CREATE TABLE graph_intro_consents (
    -- INTRO_CONSENT. Directed: (from)-[c]->(to). At most one per ordered pair.
    id              BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
    from_person_id  BIGINT   NOT NULL,
    to_person_id    BIGINT   NOT NULL,
    status          ENUM('pending','approved','declined') NOT NULL,
    requested_at    DATETIME NULL,
    responded_at    DATETIME NULL,
    CONSTRAINT uq_graph_consent UNIQUE (from_person_id, to_person_id),
    CONSTRAINT fk_consent_from FOREIGN KEY (from_person_id) REFERENCES graph_persons(id) ON DELETE CASCADE,
    CONSTRAINT fk_consent_to   FOREIGN KEY (to_person_id)   REFERENCES graph_persons(id) ON DELETE CASCADE,
    INDEX ix_graph_consents_to (to_person_id, status)
);
```

### What is dropped on purpose

- **`(:Company)` nodes and `[:WORKS_AT]`.** Nothing treats a company as an entity; every query
  reads `company.name` as a display string. It becomes a column on `graph_persons`.
  *Side effect:* this fixes the known gap documented in `contacts/graph_sync.py` — "switching a
  person's company merges a new Company/WORKS_AT edge but doesn't remove the old one". A column
  assignment has no old edge to leave behind.
- **`[:DISCUSSED]`.** Listed in `docs/architecture.md`'s data model but never written or read by
  any code. Do not port it; remove it from the doc.
- **`MET_AT.date` / `.context`, `WORKS_AT.title` / `.department`.** Same — they appear in the
  doc's example Cypher only, never in code.

### SQLAlchemy models (`backend/app/features/graph/models.py`)

```python
"""SQLAlchemy models for the graph feature."""

from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class GraphPerson(Base):
    __tablename__ = "graph_persons"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(100))
    job_class: Mapped[str | None] = mapped_column(String(30))
    company: Mapped[str | None] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class GraphEdge(Base):
    __tablename__ = "graph_edges"
    __table_args__ = (UniqueConstraint("person_a_id", "person_b_id", name="uq_graph_edge"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    person_a_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("graph_persons.id", ondelete="CASCADE"), index=True
    )
    person_b_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("graph_persons.id", ondelete="CASCADE"), index=True
    )
    weight: Mapped[int] = mapped_column(Integer, default=1)
    last_interaction: Mapped[datetime | None] = mapped_column(DateTime)
    origin: Mapped[str | None] = mapped_column(String(20))


class GraphIntroConsent(Base):
    __tablename__ = "graph_intro_consents"
    __table_args__ = (
        UniqueConstraint("from_person_id", "to_person_id", name="uq_graph_consent"),
        Index("ix_graph_consents_to", "to_person_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    from_person_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("graph_persons.id", ondelete="CASCADE"), index=True
    )
    to_person_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("graph_persons.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "declined", name="consent_status")
    )
    requested_at: Mapped[datetime | None] = mapped_column(DateTime)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
```

---

## 4. The one idiom the whole migration rests on

`MET_AT` is **undirected** in Cypher: `MERGE (me)-[r:MET_AT]-(person)` matches and creates
regardless of direction, and `MATCH (a)-[:MET_AT]-(b)` reads it from either end. A SQL row has
two named columns and is therefore directed. Two rules restore the Cypher semantics:

**Write side — canonical ordering.** Every write stores the pair sorted:
`person_a_id = min(x, y)`, `person_b_id = max(x, y)`. Together with the
`UNIQUE (person_a_id, person_b_id)` key, this makes a duplicate edge impossible, which is what
`MERGE` gave us for free.

Do the sorting **in Python, not in SQL**. MySQL has `LEAST()`/`GREATEST()`; SQLite (which the
test suite runs on — see `tests/conftest.py`) spells them `MIN()`/`MAX()`. Keeping it in Python
keeps the statements portable across both:

```python
def _pair(x: int, y: int) -> tuple[int, int]:
    """MET_AT is undirected; store it once, always smallest id first."""
    return (x, y) if x <= y else (y, x)
```

**Read side — a symmetric CTE.** Expand each stored row into both directions once, then write
every read as if edges were directed:

```sql
WITH adjacency AS (
    SELECT person_a_id AS from_id, person_b_id AS to_id, weight, last_interaction FROM graph_edges
    UNION ALL
    SELECT person_b_id AS from_id, person_a_id AS to_id, weight, last_interaction FROM graph_edges
)
```

MySQL 8 and SQLite 3.8.3+ both support CTEs. In SQLAlchemy this is
`select(...).union_all(select(...)).cte("adjacency")` — define it once at module level in
`queries.py` and reuse it in the three read queries below.

---

## 5. Query-by-query translation

SQL below is written out longhand for review; implement it with SQLAlchemy Core constructs so it
runs on both MySQL and the SQLite test database. `:me_id` is `ME_PERSON_ID = 0` — that constant
and its single-user meaning do not change.

### 5.1 `fetch_me`

```sql
SELECT id, name FROM graph_persons WHERE id = :me_id;
```

Keeps the existing fallback: no row → `{"id": me_id, "name": "Me"}`.

### 5.2 `fetch_first_degree`

```sql
WITH adjacency AS (...)
SELECT p.id, p.name, p.job_class, p.company,
       a.weight, a.last_interaction,
       c.status AS introduction_request_status
FROM adjacency a
JOIN graph_persons p ON p.id = a.to_id
LEFT JOIN graph_intro_consents c
       ON c.from_person_id = :me_id AND c.to_person_id = p.id
WHERE a.from_id = :me_id;
```

The Cypher had `DISTINCT` because `OPTIONAL MATCH ... (company)` could fan a row out. With
`company` as a column and one edge row per pair, nothing fans out — `DISTINCT` is not needed.
Keep the same column aliases; `GraphService._person_node` reads them by name and must not change.

### 5.3 `fetch_second_degree`

```sql
WITH adjacency AS (...)
SELECT p.id, p.name, p.job_class, p.company,
       a.from_id AS parent_id, a.weight, a.last_interaction
FROM adjacency a
JOIN graph_persons p ON p.id = a.to_id
JOIN graph_intro_consents c
       ON c.from_person_id = p.id
      AND c.to_person_id = a.from_id
      AND c.status = 'approved'
WHERE a.from_id IN :first_degree_ids
  AND p.id <> :me_id
  AND p.id NOT IN :first_degree_ids;
```

Note the direction of the consent join: `(person)-[:INTRO_CONSENT {approved}]->(parent)`, i.e.
the *2nd-degree person* consented to being surfaced *through the connecting contact* — not the
other way round. Getting this backwards silently exposes people who never agreed, which is the
privacy rule in `api-spec.md`. **Pin it with a test** (§9).

The symmetric CTE is what lets one stored edge be read from either end: the 2nd-degree
person is `to_id` whichever way round `create_acquaintance` happened to write the pair. An
edge whose *both* endpoints are 1st-degree contacts is excluded by the `NOT IN` filter, the
same as in Cypher.

If `first_degree_ids` is empty, `GraphService` already skips the call — keep that guard, since
`IN ()` is a syntax error in MySQL.

### 5.4 `is_first_degree`

```sql
SELECT EXISTS (
    SELECT 1 FROM graph_edges WHERE person_a_id = :lo AND person_b_id = :hi
) AS is_first_degree;
```

with `(lo, hi) = _pair(me_id, target_id)`.

### 5.5 `get_intro_consent`

```sql
SELECT status, requested_at, responded_at
FROM graph_intro_consents
WHERE from_person_id = :from_id AND to_person_id = :to_id;
```

### 5.6 `upsert_intro_request`

```sql
INSERT INTO graph_intro_consents (from_person_id, to_person_id, status, requested_at, responded_at)
VALUES (:from_id, :to_id, 'pending', :requested_at, NULL)
ON DUPLICATE KEY UPDATE status = 'pending', requested_at = VALUES(requested_at), responded_at = NULL;
```

then re-`SELECT` the row (5.5) to return it.

`sqlalchemy.dialects.mysql.insert(...).on_duplicate_key_update(...)` is dialect-specific; SQLite
needs `.on_conflict_do_update(...)`. Either branch on `session.bind.dialect.name` in one small
helper, or express it as `SELECT`-then-`INSERT`/`UPDATE` inside the transaction. Prefer the
helper — there are three upserts in total (5.6, 5.10, 5.13).

**Behaviour difference**: the Cypher began `MATCH (from), (to)`, so it quietly did nothing when
either node was missing, and `upsert_intro_request` asserted a row came back. In SQL, a missing
endpoint raises `IntegrityError` on the foreign key instead. In practice
`GraphService.request_introduction` calls `is_first_degree` first, so both endpoints exist; keep
that ordering and let the FK be a backstop, not the control flow.

### 5.7 `respond_to_intro_request`

```sql
UPDATE graph_intro_consents
SET status = :status, responded_at = :responded_at
WHERE from_person_id = :from_id AND to_person_id = :to_id AND status = 'pending';
```

Then `SELECT` the row back and return it; **treat "no `pending` row" as `None`** so
`respond_to_request` still raises `404 REQUEST_NOT_FOUND`. Decide that by `SELECT`ing first
inside the transaction rather than by `result.rowcount` — MySQL reports `0` affected rows when an
`UPDATE` writes values identical to the existing ones, which would turn a legitimate response
into a spurious 404.

### 5.8 `fetch_incoming_intro_requests`

```sql
SELECT p.id AS person_id, p.name, p.job_class, p.company, c.requested_at
FROM graph_intro_consents c
JOIN graph_persons p ON p.id = c.from_person_id
WHERE c.to_person_id = :me_id AND c.status = 'pending'
ORDER BY c.requested_at ASC;
```

### 5.9 `next_acquaintance_id`

```sql
SELECT COALESCE(MIN(id), 0) - 1 AS id FROM graph_persons WHERE id < 0;
```

Same read-then-insert race as today (two concurrent creates can pick the same id), but SQL gives
us a real fix: this `SELECT` and the inserts in 5.10 run in **one transaction**, and the primary
key rejects a collision instead of silently merging two people into one node. Wrap
`add_acquaintance` in a single transaction and retry once on `IntegrityError`.

### 5.10 `create_acquaintance`

Three statements, **one transaction** (the Cypher was a single atomic statement; nothing may be
able to half-apply this):

```sql
INSERT INTO graph_persons (id, name, job_class) VALUES (:person_id, :name, :job_class);

INSERT INTO graph_edges (person_a_id, person_b_id, weight, last_interaction, origin)
VALUES (:lo, :hi, 1, :now, 'acquaintance');          -- (lo, hi) = _pair(contact_id, person_id)

INSERT INTO graph_intro_consents (from_person_id, to_person_id, status, requested_at)
VALUES (:person_id, :contact_id, 'pending', :now);
```

Preconditions: `add_acquaintance` already checks `is_first_degree(me, contact_id)` before this,
so `404 CONTACT_NOT_IN_GRAPH` is now reachable only if the contact vanished in between — keep it
by catching `IntegrityError` on the edge insert.

They stay `pending`, for the reason spelled out in `api-spec.md` and in the docstring: a
2nd-degree person is invisible until their consent is recorded. Do not "simplify" this to
`approved`.

### 5.11 `approve_acquaintance`

```sql
UPDATE graph_intro_consents SET status = 'approved', responded_at = :now
WHERE from_person_id = :acquaintance_id;

SELECT p.id, p.name, p.job_class, c.status
FROM graph_persons p JOIN graph_intro_consents c ON c.from_person_id = p.id
WHERE p.id = :acquaintance_id;
```

No row → `404 ACQUAINTANCE_NOT_FOUND`, unchanged. An acquaintance has exactly one consent row by
construction (5.10), which is what made the Cypher's `result.single()` safe; the `UNIQUE` key
does not enforce that on its own, so if the `SELECT` ever returns more than one row, something
upstream is wrong — assert rather than silently pick one.

### 5.12 `fetch_acquaintances`

```sql
SELECT p.id, p.name, p.job_class, c.status
FROM graph_intro_consents c
JOIN graph_persons p ON p.id = c.from_person_id
WHERE c.to_person_id = :contact_id AND p.id < 0
ORDER BY p.id DESC;
```

### 5.13 `contacts/graph_sync.sync_person_node`

```sql
INSERT INTO graph_persons (id, name, job_class, company)
VALUES (:id, :name, :job_class, :company)
ON DUPLICATE KEY UPDATE name = VALUES(name), job_class = VALUES(job_class), company = VALUES(company);

-- the "me" node. The Cypher used coalesce(me.name, 'Me') so an existing name survives;
-- graph_persons.name is NOT NULL, so a no-op update expresses the same thing.
INSERT INTO graph_persons (id, name) VALUES (:me_id, 'Me')
ON DUPLICATE KEY UPDATE id = id;

-- ON CREATE SET: never reset weight/last_interaction on an edge that already exists.
INSERT INTO graph_edges (person_a_id, person_b_id, weight, last_interaction)
VALUES (:lo, :hi, 1, :now)
ON DUPLICATE KEY UPDATE person_a_id = person_a_id;
```

The `ON DUPLICATE KEY UPDATE <col> = <col>` no-op is the MySQL spelling of Cypher's
`ON CREATE SET` — it must stay a no-op, or every contact edit would reset the conversation
weight that `conversation_sync` has been accumulating.

### 5.14 `contacts/graph_sync.delete_person_node`

```sql
DELETE FROM graph_persons WHERE id = :id;
```

`DETACH DELETE` becomes `ON DELETE CASCADE` on both edge FKs and both consent FKs. Verify the
cascade in a test (§9) — it is the one piece of delete semantics that is now the schema's job
rather than the query's.

### 5.15 `graph/conversation_sync.bump_conversation_weight`

```sql
UPDATE graph_edges
SET weight = weight + 1, last_interaction = :now
WHERE person_a_id = :lo AND person_b_id = :hi;     -- (lo, hi) = _pair(me_id, person_id)
```

`COALESCE(weight, 0)` is gone because the column is `NOT NULL DEFAULT 1`. Still a no-op when the
edge does not exist, which is the documented contract.

---

## 6. Behaviour differences to preserve deliberately

### 6.1 Undirected edges

Covered in §4. This is the one that silently corrupts data if missed: without canonical ordering,
`(0,5)` and `(5,0)` are two rows, the `UNIQUE` key never fires, and weights split across
duplicates.

### 6.2 Timestamps and timezone — the one API-visible risk

Neo4j's `datetime()` returns a timezone-aware UTC value, and `_to_native()` handed Pydantic an
aware `datetime`, which serializes as `"2024-03-15T14:00:00Z"` — exactly what `api-spec.md`
documents and what the frontend parses.

MySQL `DATETIME` stores no timezone. A naive value round-trips through Pydantic as
`"2024-03-15T14:00:00"` — **no `Z`** — and `new Date()` in JS reads a suffix-less string as
*local* time. In KST that shifts every "last conversation" timestamp by 9 hours.

Two rules:

1. **Write UTC explicitly.** Use `datetime.now(UTC)` in Python for every timestamp, never SQL
   `NOW()` — `NOW()` follows the MySQL session timezone. (`UTC_TIMESTAMP()` is the SQL-side
   equivalent if one is ever needed.)
2. **Re-attach UTC on read.** Keep a `_to_native`-shaped seam in `queries.py` — rename it, but do
   not delete it — that does `value.replace(tzinfo=UTC)` on the datetime columns before the row
   reaches Pydantic.

Assert on the serialized string in a router test, not just on the Python object (§9).

### 6.3 Transactions

Cypher statements were individually atomic; several of them did the work of what is now 2–3 SQL
statements (5.10, 5.13). Those must each be wrapped in one transaction.

### 6.4 `driver is None` disappears

`ContactsService` and `ConversationService` currently accept `neo4j_driver: AsyncDriver | None`
and skip the sync when it is `None` — which is how `tests/conftest.py` keeps contacts tests off a
live Neo4j. After the migration the graph lives in the session those services already hold, so
there is nothing to skip and nothing to inject. Delete the parameter, the `None` guards, and the
`app.dependency_overrides[get_neo4j_driver]` line in `conftest.py`. Contacts tests will then
exercise the graph writes for real — an improvement, but expect `test_contacts.py` to need the
graph tables created in the fixture (§9).

---

## 7. The best-effort sync becomes atomic (and must)

Today both sync paths are deliberately best-effort:

```python
try:
    await sync_person_node(self.neo4j_driver, ...)
except Exception:
    logger.warning("Neo4j sync failed for person %s", person.id, exc_info=True)
```

That contract exists because Neo4j is a *separate* database that can be down while MySQL is up.
Once the graph tables are in MySQL, it is not merely unnecessary — **it cannot work**. A failed
statement poisons the enclosing `AsyncSession`; swallowing the exception and continuing leaves
the session in a state where the next operation raises anyway. Keeping the `try/except` would
turn a clean failure into a confusing one.

So the sync becomes part of the contact's own transaction:

- `ContactsService.create_person`: `add` → `flush()` (to get `person.id`) → write `graph_persons`
  + `graph_edges` → **one** `commit()`. Today it commits, then syncs; that ordering is what
  produces a contact with no node.
- `ContactsService.update_person` / `delete_person`: same session, same commit.
- `ConversationService.save`: `_sync_graph` currently runs *after* `self.db.commit()`. Move the
  weight bump before the commit. Its "only for a brand new row" guard (`if is_new:`) stays — it
  is what keeps a re-summarized recording from counting twice.

**This kills a real bug class.** `frontend/src/features/contacts/api.ts:82-85` documents a
user-visible symptom of it: `POST /graph/{id}/introduction-requests` returns `404
NOT_FIRST_DEGREE` for a contact whose node never got written, and the only recovery is re-saving
the contact. After this change, a contact that exists always has a node. The frontend workaround
can stay (it is harmless, and `NOT_FIRST_DEGREE` is still a legitimate response for a non-contact
id), but the comment explaining it should be corrected — 강민구's file, worth a line in the PR
description.

---

## 8. Data migration

The graph holds three things that are **not** derivable from MySQL: acquaintance nodes (negative
ids), intro-consent rows, and accumulated edge weights. Everything else is a mirror of `persons`.

**Recommended: reset.** `docs/architecture.md` calls this local-development-only, each member's
Neo4j volume holds their own throwaway data, and the mirror rebuilds itself the moment a contact
is saved. Ship the backfill **inside the Alembic migration** so nobody has to remember it:

```sql
INSERT INTO graph_persons (id, name, job_class, company)
SELECT id, name, job_class, company FROM persons;

INSERT INTO graph_persons (id, name) VALUES (0, 'Me');

INSERT INTO graph_edges (person_a_id, person_b_id, weight, last_interaction)
SELECT 0, id, 1, NULL FROM persons;      -- 0 < any positive id, so this is already canonical
```

Edge weights can even be reconstructed rather than lost, since `conversations` is the thing that
produced them:

```sql
UPDATE graph_edges e
JOIN (
    SELECT person_id, COUNT(*) AS n, MAX(created_at) AS last
    FROM conversations GROUP BY person_id
) c ON c.person_id = e.person_b_id AND e.person_a_id = 0
SET e.weight = 1 + c.n, e.last_interaction = c.last;
```

That is arguably *more* correct than what Neo4j holds today, since the bump was best-effort and
any dropped write is already missing from it.

**`1 + COUNT(*)`, not `COUNT(*)`.** An edge is created with `weight = 1` and each conversation
adds one, so that is what the live code produces and the backfill has to match it — otherwise
an existing contact reads one lower than an identical contact saved tomorrow.

It also means `conversation_count` in the API is one higher than the number of conversations,
for every contact. That is a pre-existing quirk of the Neo4j implementation, not something the
move introduces — the live Neo4j store had `weight = 2` on an edge with exactly one
conversation. **This migration preserves it on purpose**: changing what the graph screen
shows is a separate decision from changing where the graph is stored. If it should be fixed,
fix it in its own change, where the number moving is the point rather than a side effect.

One deliberate difference: a contact with no conversations gets `last_interaction = NULL` here,
where Neo4j set it to the moment the edge was created. `last_conversation` is already nullable
in `GraphNodeResponse` and in api-spec.md, and "no conversation recorded" is what is true.

**If someone has demo data worth keeping** (likely, if there is a presentation coming): export it
before tearing the container down, while it still exists.

```cypher
// acquaintances
MATCH (p:Person) WHERE p.id < 0 RETURN p.id, p.name, p.job_class;
// consents
MATCH (a:Person)-[c:INTRO_CONSENT]->(b:Person)
RETURN a.id, b.id, c.status, c.requested_at, c.responded_at;
// edge weights
MATCH (a:Person)-[r:MET_AT]-(b:Person) WHERE a.id < b.id
RETURN a.id, b.id, r.weight, r.last_interaction, r.origin;
```

Run these in the Neo4j Browser at `http://localhost:7474`, export CSV, load with a one-off script
under `backend/scripts/`. **Do this before `docker compose down -v`** — dropping the `neo4j_data`
volume is irreversible and nothing else in the repo holds this data.

---

## 9. Test plan

Existing tests, and what happens to them:

- `tests/test_graph_service.py` — monkeypatches `queries.*`, so it keeps passing untouched except
  for `GraphService(driver=object())` → `GraphService(db=object())`. That also means **it proves
  nothing about the new SQL**, which is the whole risk surface of this change.
- `tests/test_contacts_graph_sync.py` — rewrite. It asserts on Cypher text.
- `tests/test_config.py` — drop the three `neo4j_*` assertions.
- `tests/conftest.py` — drop the `get_neo4j_driver` override; import
  `app.features.graph.models` so `Base.metadata.create_all` builds the graph tables.

New tests, against the real SQLite session — this is where the value is:

1. **Undirected edge** — calling `sync_person_node` twice for the same person creates exactly one
   `graph_edges` row, and the second call does not reset `weight`.
2. **Weight bump** — `bump_conversation_weight` increments, and is a no-op for a person with no
   edge.
3. **Cascade delete** — deleting a `graph_persons` row removes its edges *and* its consent rows
   in both directions.
4. **2nd-degree consent gate** — an acquaintance with `pending` consent is absent from
   `GET /graph?depth=2` and from `stats.degree_2_count`; after
   `POST /graph/acquaintances/{id}/consent` they appear. Assert the consent *direction*
   explicitly (§5.3).
5. **Timestamp serialization** — a router-level test asserting the JSON string for
   `last_conversation` ends in `Z` / parses as UTC (§6.2).
6. **Contact create → graph node** — after `POST /contacts`, the `graph_persons` row exists in the
   same committed transaction (the bug from §7).
7. **Acquaintance id allocation** — two sequential creates get `-1` then `-2`.

Run `pytest tests/ -v` and `ruff check` before opening any PR, per `docs/conventions.md`.

---

## 10. PR sequence

Every PR here except #2 and #4 touches files nobody owns, so `CLAUDE.md`'s rule applies:
**separate branch, 2+ approvals.** Suggested order — each step leaves `main` working:

| # | Branch | Contents | Approvals |
|---|---|---|---|
| 1 | `feat/graph-mysql-schema` | `features/graph/models.py`, Alembic migration + backfill, `conftest.py` model import. Adds tables; nothing reads them yet. | 2 (touches `conftest.py`) |
| 2 | `refactor/graph-queries-to-sql` | `features/graph/{queries,service,router,conversation_sync}.py` + new tests. Graph reads/writes MySQL; Neo4j still running, still written to by contacts. | 김민경's folder — 1 is enough |
| 3 | `refactor/contacts-graph-sync-to-sql` | `contacts/{graph_sync,service,router}.py`, atomic sync (§7) | 강민구 + 1 |
| 4 | `refactor/conversation-drop-neo4j-driver` | `conversation/{service,router}.py` | 박재경 + 1 |
| 5 | `chore/remove-neo4j` | delete `neo4j_driver.py`; `dependencies.py`, `config.py`, `main.py`, `pyproject.toml`, `docker-compose.yml`, `test_config.py` | 2 |
| 6 | `docs/remove-neo4j` | `architecture.md`, `features.md`, `conventions.md`, `README.md`, `backend/CLAUDE.md`, root `CLAUDE.md` | 2 |

Between #2 and #5 both databases are live and the graph is served from MySQL — that is the window
for anyone to sanity-check the app against real data before the Neo4j volume is dropped.

Docs to correct in #6, specifically:

- `docs/architecture.md` — the `neo4j_driver.py` line in the tree (~50), the `features/graph/`
  annotation (~58), the "Neo4j Community Edition" section (137–178) with its Cypher data model,
  the "MySQL ↔ Neo4j Synchronization" bullets, the Community Edition constraints, and both
  `docker-compose.yml` blocks (73, 180+). Replace with the §3 schema.
- `docs/features.md` — 김민경's row (10), the 강민구 touchpoint (32), the backend bullets (39–48),
  the "Neo4j notes" block (104–106), the diagram (189), and the week-plan rows (235, 245).
- `docs/conventions.md` — the three `NEO4J_*` env vars (183–185), and `backend/.env.example`
  alongside it.
- `README.md` — the tech-stack table (20), the "DB (MySQL + Neo4j) 실행" step (57), the doc index
  line (72).
- `backend/CLAUDE.md` — the tech-stack bullet, the `Settings` example, and the whole "Using the
  Graph DB (graph feature only)" section. That section's replacement is one sentence: the graph
  feature uses SQLAlchemy like every other feature. Worth calling out in the PR — it is the point
  of the whole exercise.
- Root `CLAUDE.md` — the Database line in Tech Stack. Add this document to the Documentation
  Index while you are in there.

---

## 11. Separate from this migration: the word "deployment"

This plan is about removing Neo4j and is complete on its own. But the reason for it was a
deployment, and the repo is written end to end for local development only — `CLAUDE.md` says
"No deployment. The app only needs to run in the local Docker Compose environment", and several
things are the way they are *because* of that line. They are out of scope here, but they are not
safe to carry onto a server unexamined, and each has an owner who should look at it:

- `app/main.py` — `CORSMiddleware(allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])`,
  with a comment saying it is local-dev-only.
- `app/config.py` — `field_encryption_key` ships a real default Fernet key in source. It encrypts
  the PII columns (`phone`, `email`, `address`). A shared, committed key is not encryption.
- `docker-compose.yml` — `MYSQL_ROOT_PASSWORD: cardn`, `MYSQL_PASSWORD: cardn`, and MySQL's port
  published to the host.
- No authentication anywhere. `ME_PERSON_ID = 0` and the single-user assumption are load-bearing
  across graph, contacts and game (`api-spec.md` is explicit about this). A deployed multi-user
  app is a different application, not a configuration change.

Worth one agenda item at the next team sync before anything is exposed publicly.
