"""Relationship-graph sync for the contacts feature.

docs/features.md's 강민구 touchpoints: "When a person is created, the graph node needs to
be synced." There's no graph-owned API/service to call for this yet (see
docs/architecture.md), so this writes the graph tables directly through
app/features/graph/queries.py, which owns their shape. Anything graph-domain-specific
(traversal, introduction requests, edge weights from conversations) stays over there,
owned by 김민경.

Since docs/neo4j-to-mysql-migration.md the graph lives in the same MySQL database as
`persons`, which changes this file's contract. It used to be best-effort — a separate
database could be down while MySQL was up, so callers caught and logged, and a contact
could end up with no node at all (the 404 NOT_FIRST_DEGREE that
frontend/src/features/contacts/api.ts had to work around). Now these statements go through
the caller's own session, so they are part of the contact's transaction: they commit with
it or roll back with it, and a contact that exists always has a node. Do not wrap them in
try/except — a failed statement poisons the session either way, so swallowing the error
would only move the failure somewhere less obvious.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.graph import queries
from app.features.graph.queries import ME_PERSON_ID


async def sync_person_node(
    db: AsyncSession,
    *,
    person_id: int,
    name: str,
    company: str | None,
    job_class: str | None,
) -> None:
    """Upsert the person's node, the "me" node, and the edge between them.

    The edge is only created, never updated: its weight is the conversation count that
    graph/conversation_sync.py maintains, and re-setting it on every contact edit would
    throw that away.

    The old known gap — switching a person's company left the previous Company node
    attached — is gone with the node itself. Company is a column now, so assigning it has
    no stale edge to leave behind.
    """
    await queries.upsert_person(
        db, person_id=person_id, name=name, company=company, job_class=job_class
    )
    await queries.ensure_me(db, ME_PERSON_ID)
    await queries.ensure_edge(db, ME_PERSON_ID, person_id)


async def delete_person_node(db: AsyncSession, *, person_id: int) -> None:
    """Remove the person; their edges and consent rows cascade with them."""
    await queries.delete_person(db, person_id=person_id)
