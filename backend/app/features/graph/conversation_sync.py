"""Turns a saved conversation into graph signal.

docs/architecture.md's MySQL <-> Neo4j Synchronization: "When a conversation is saved
-> update the Neo4j edge weight." There's no graph-owned HTTP endpoint for this (see
features/contacts/graph_sync.py for the same trade-off on the contacts side), so this
is a direct import for features/conversation's save flow (ConversationService.save) to
call after it commits.

Two things happen when a conversation is saved:

1. bump_conversation_weight — strengthens the existing (me)-[:MET_AT]-(person) edge.
   This is what GET /graph's conversation_count / last_conversation actually reflect;
   without this call they're stuck at whatever contacts/graph_sync.py set on first sync
   (weight=1) and never move again.
2. sync_mentioned_people — MentionedPerson (name/relation/confidence, no person_id —
   see features/conversation/schemas.py, docstring: "a candidate graph edge") gets
   resolved against contacts already synced into Neo4j (features/contacts/graph_sync.py)
   and, on a confident *unambiguous* name match, creates/strengthens a MET_AT edge
   between the conversation's own contact and the mentioned person: "A told me about B"
   is evidence A knows B — the same 2nd-degree / mutual-connections signal the graph
   feature surfaces elsewhere (see docs/api-spec.md's Introduction Requests). Ambiguous
   (name shared by 2+ contacts) or unmatched (not a contact yet) mentions are skipped
   rather than guessed at.

Best-effort by design, same as contacts/graph_sync.py: the conversation record in MySQL
is the source of truth, so callers should catch and log rather than let a Neo4j hiccup
fail saving a conversation.
"""

import logging

from neo4j import AsyncDriver

from app.features.graph.queries import ME_PERSON_ID

logger = logging.getLogger(__name__)

# MentionedPerson.confidence is a free float, not range-validated where it's produced
# (see features/conversation/schemas.py) — treat anything below this as too unreliable
# to turn into a graph edge.
MIN_MENTION_CONFIDENCE = 0.5

_BUMP_WEIGHT_QUERY = """
MATCH (me:Person {id: $me_id})-[r:MET_AT]-(person:Person {id: $person_id})
SET r.weight = coalesce(r.weight, 0) + 1, r.last_interaction = datetime()
"""

_FIND_PERSON_BY_NAME_QUERY = """
MATCH (p:Person)
WHERE toLower(p.name) = toLower($name) AND p.id <> $exclude_id
RETURN p.id AS id
"""

_SYNC_MENTION_EDGE_QUERY = """
MATCH (a:Person {id: $person_id}), (b:Person {id: $mentioned_id})
MERGE (a)-[r:MET_AT]-(b)
ON CREATE SET r.weight = 1, r.last_interaction = datetime()
ON MATCH SET r.weight = coalesce(r.weight, 0) + 1, r.last_interaction = datetime()
"""


async def bump_conversation_weight(driver: AsyncDriver, *, person_id: int) -> None:
    """No-op if the (me)-[:MET_AT]-(person_id) edge doesn't exist yet (e.g. contacts
    sync hasn't run for this person) — nothing to bump.
    """
    async with driver.session() as session:
        await session.run(_BUMP_WEIGHT_QUERY, me_id=ME_PERSON_ID, person_id=person_id)


async def _find_person_ids_by_name(driver: AsyncDriver, name: str, exclude_id: int) -> list[int]:
    async with driver.session() as session:
        result = await session.run(_FIND_PERSON_BY_NAME_QUERY, name=name, exclude_id=exclude_id)
        return [record["id"] async for record in result]


async def _sync_mention_edge(driver: AsyncDriver, person_id: int, mentioned_id: int) -> None:
    async with driver.session() as session:
        await session.run(_SYNC_MENTION_EDGE_QUERY, person_id=person_id, mentioned_id=mentioned_id)


async def sync_mentioned_people(
    driver: AsyncDriver, *, person_id: int, mentions: list[dict]
) -> list[int]:
    """mentions: [{"name": str, "confidence": float}, ...] — extra keys (e.g.
    MentionedPerson.relation) are accepted and ignored; it's free-text description, not
    structured enough yet to model as an edge property. Returns the person_ids that got
    linked (an edge was created or strengthened).
    """
    linked: list[int] = []
    for mention in mentions:
        name = (mention.get("name") or "").strip()
        confidence = mention.get("confidence") or 0.0
        if not name or confidence < MIN_MENTION_CONFIDENCE:
            continue

        candidate_ids = await _find_person_ids_by_name(driver, name, person_id)
        if len(candidate_ids) != 1:
            continue

        mentioned_id = candidate_ids[0]
        if mentioned_id in (person_id, ME_PERSON_ID):
            continue

        await _sync_mention_edge(driver, person_id, mentioned_id)
        linked.append(mentioned_id)

    return linked
