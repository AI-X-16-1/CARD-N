"""Turns a saved conversation into graph signal.

docs/architecture.md's MySQL <-> Neo4j Synchronization: "When a conversation is saved
-> update the Neo4j edge weight." There's no graph-owned HTTP endpoint for this (see
features/contacts/graph_sync.py for the same trade-off on the contacts side), so this
is a direct import for features/conversation's save flow (ConversationService.save) to
call after it commits.

Only the weight of an edge that already exists is touched. A conversation never creates
a relationship: the summary's mentioned_people used to be resolved against contact names
and turned into MET_AT edges, but an LLM saying a name is not evidence two people know
each other, and a wrong guess became a permanent edge the user was never shown and could
not undo. It stays inert data in Conversation.summary_json.

Best-effort by design, same as contacts/graph_sync.py: the conversation record in MySQL
is the source of truth, so callers should catch and log rather than let a Neo4j hiccup
fail saving a conversation.
"""

import logging

from neo4j import AsyncDriver

from app.features.graph.queries import ME_PERSON_ID

logger = logging.getLogger(__name__)

_BUMP_WEIGHT_QUERY = """
MATCH (me:Person {id: $me_id})-[r:MET_AT]-(person:Person {id: $person_id})
SET r.weight = coalesce(r.weight, 0) + 1, r.last_interaction = datetime()
"""


async def bump_conversation_weight(driver: AsyncDriver, *, person_id: int) -> None:
    """No-op if the (me)-[:MET_AT]-(person_id) edge doesn't exist yet (e.g. contacts
    sync hasn't run for this person) — nothing to bump.
    """
    async with driver.session() as session:
        await session.run(_BUMP_WEIGHT_QUERY, me_id=ME_PERSON_ID, person_id=person_id)
