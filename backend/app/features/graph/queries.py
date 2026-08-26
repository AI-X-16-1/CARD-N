"""Neo4j Cypher queries for the graph feature."""

from datetime import datetime
from typing import Any

from neo4j import AsyncDriver
from neo4j.time import DateTime as Neo4jDateTime

# Single-user MVP: the signed-in person is always the Person node with this id.
ME_PERSON_ID = 0


def _to_native(value: Any) -> Any:
    """Neo4j returns its own DateTime type for temporal properties; Pydantic wants a stdlib one."""
    return value.to_native() if isinstance(value, Neo4jDateTime) else value


def _row(record: Any) -> dict:
    return {key: _to_native(value) for key, value in record.data().items()}


_ME_QUERY = """
MATCH (me:Person {id: $me_id})
RETURN me.id AS id, me.name AS name
"""

_FIRST_DEGREE_QUERY = """
MATCH (me:Person {id: $me_id})-[r:MET_AT]-(person:Person)
OPTIONAL MATCH (person)-[:WORKS_AT]->(company:Company)
RETURN DISTINCT person.id AS id, person.name AS name, person.job_class AS job_class,
       company.name AS company, r.weight AS weight, r.last_interaction AS last_interaction
"""

# A 2nd-degree candidate only counts once they've *approved* an introduction request through the
# connecting 1st-degree contact (INTRO_CONSENT) — see docs/api-spec.md "Introduction Requests".
_SECOND_DEGREE_QUERY = """
MATCH (parent:Person)-[r:MET_AT]-(person:Person)-[:INTRO_CONSENT {status: 'approved'}]->(parent)
WHERE parent.id IN $first_degree_ids
  AND person.id <> $me_id
  AND NOT person.id IN $first_degree_ids
OPTIONAL MATCH (person)-[:WORKS_AT]->(company:Company)
RETURN DISTINCT person.id AS id, person.name AS name, person.job_class AS job_class,
       company.name AS company, parent.id AS parent_id, r.weight AS weight,
       r.last_interaction AS last_interaction
"""

_IS_FIRST_DEGREE_QUERY = """
MATCH (me:Person {id: $me_id})-[:MET_AT]-(target:Person {id: $target_id})
RETURN count(*) > 0 AS is_first_degree
"""

_GET_INTRO_CONSENT_QUERY = """
MATCH (from:Person {id: $from_id})-[c:INTRO_CONSENT]->(to:Person {id: $to_id})
RETURN c.status AS status, c.requested_at AS requested_at, c.responded_at AS responded_at
"""

_UPSERT_INTRO_REQUEST_QUERY = """
MATCH (from:Person {id: $from_id}), (to:Person {id: $to_id})
MERGE (from)-[c:INTRO_CONSENT]->(to)
SET c.status = 'pending', c.requested_at = $requested_at, c.responded_at = null
RETURN c.status AS status, c.requested_at AS requested_at, c.responded_at AS responded_at
"""

_RESPOND_INTRO_REQUEST_QUERY = """
MATCH (from:Person {id: $from_id})-[c:INTRO_CONSENT {status: 'pending'}]->(to:Person {id: $to_id})
SET c.status = $status, c.responded_at = $responded_at
RETURN c.status AS status, c.requested_at AS requested_at, c.responded_at AS responded_at
"""

_INCOMING_INTRO_REQUESTS_QUERY = """
MATCH (from:Person)-[c:INTRO_CONSENT {status: 'pending'}]->(me:Person {id: $me_id})
OPTIONAL MATCH (from)-[:WORKS_AT]->(company:Company)
RETURN from.id AS person_id, from.name AS name, from.job_class AS job_class,
       company.name AS company, c.requested_at AS requested_at
ORDER BY c.requested_at ASC
"""

# Mutual connections are always people I already have MET_AT with, so this doesn't need the
# INTRO_CONSENT gate that fetch_second_degree uses — nothing new is exposed to me.
_MUTUAL_CONNECTIONS_QUERY = """
MATCH (me:Person {id: $me_id})-[:MET_AT]-(mutual:Person)-[:MET_AT]-(target:Person {id: $target_id})
WHERE mutual.id <> $me_id AND mutual.id <> $target_id
OPTIONAL MATCH (mutual)-[:WORKS_AT]->(company:Company)
RETURN DISTINCT mutual.id AS id, mutual.name AS name, mutual.job_class AS job_class,
       company.name AS company
"""


async def fetch_me(driver: AsyncDriver, me_id: int) -> dict:
    async with driver.session() as session:
        result = await session.run(_ME_QUERY, me_id=me_id)
        record = await result.single()
        return _row(record) if record is not None else {"id": me_id, "name": "Me"}


async def fetch_first_degree(driver: AsyncDriver, me_id: int) -> list[dict]:
    async with driver.session() as session:
        result = await session.run(_FIRST_DEGREE_QUERY, me_id=me_id)
        return [_row(record) async for record in result]


async def fetch_second_degree(
    driver: AsyncDriver, me_id: int, first_degree_ids: list[int]
) -> list[dict]:
    async with driver.session() as session:
        result = await session.run(
            _SECOND_DEGREE_QUERY, me_id=me_id, first_degree_ids=first_degree_ids
        )
        return [_row(record) async for record in result]


async def is_first_degree(driver: AsyncDriver, me_id: int, target_id: int) -> bool:
    async with driver.session() as session:
        result = await session.run(_IS_FIRST_DEGREE_QUERY, me_id=me_id, target_id=target_id)
        record = await result.single()
        return bool(record["is_first_degree"]) if record is not None else False


async def get_intro_consent(driver: AsyncDriver, from_id: int, to_id: int) -> dict | None:
    async with driver.session() as session:
        result = await session.run(_GET_INTRO_CONSENT_QUERY, from_id=from_id, to_id=to_id)
        record = await result.single()
        return _row(record) if record is not None else None


async def upsert_intro_request(
    driver: AsyncDriver, from_id: int, to_id: int, requested_at: datetime
) -> dict:
    async with driver.session() as session:
        result = await session.run(
            _UPSERT_INTRO_REQUEST_QUERY,
            from_id=from_id,
            to_id=to_id,
            requested_at=requested_at,
        )
        record = await result.single()
        assert record is not None
        return _row(record)


async def respond_to_intro_request(
    driver: AsyncDriver, from_id: int, to_id: int, status: str, responded_at: datetime
) -> dict | None:
    async with driver.session() as session:
        result = await session.run(
            _RESPOND_INTRO_REQUEST_QUERY,
            from_id=from_id,
            to_id=to_id,
            status=status,
            responded_at=responded_at,
        )
        record = await result.single()
        return _row(record) if record is not None else None


async def fetch_incoming_intro_requests(driver: AsyncDriver, me_id: int) -> list[dict]:
    async with driver.session() as session:
        result = await session.run(_INCOMING_INTRO_REQUESTS_QUERY, me_id=me_id)
        return [_row(record) async for record in result]


async def fetch_mutual_connections(driver: AsyncDriver, me_id: int, target_id: int) -> list[dict]:
    async with driver.session() as session:
        result = await session.run(_MUTUAL_CONNECTIONS_QUERY, me_id=me_id, target_id=target_id)
        return [_row(record) async for record in result]
