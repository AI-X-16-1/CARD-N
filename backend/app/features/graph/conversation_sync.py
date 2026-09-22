"""Turns a saved conversation into graph signal.

docs/architecture.md's synchronization rule: "When a conversation is saved -> update the
edge weight." There's no graph-owned HTTP endpoint for this (see
features/contacts/graph_sync.py for the same trade-off on the contacts side), so this is a
direct import for features/conversation's save flow (ConversationService.save) to call.

Only the weight of an edge that already exists is touched. A conversation never creates a
relationship: the summary's mentioned_people used to be resolved against contact names and
turned into MET_AT edges, but an LLM saying a name is not evidence two people know each
other, and a wrong guess became a permanent edge the user was never shown and could not
undo. It stays inert data in Conversation.summary_json.

Since docs/neo4j-to-mysql-migration.md this writes to the same MySQL session as the
conversation itself, so it joins that transaction and must be called *before* the caller
commits. It no longer needs to be best-effort: there is no second database left to be
down, and swallowing an error mid-transaction would only poison the session the caller is
about to commit.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.graph import queries
from app.features.graph.queries import ME_PERSON_ID

logger = logging.getLogger(__name__)


async def bump_conversation_weight(db: AsyncSession, *, person_id: int) -> None:
    """No-op if the (me)-(person_id) edge doesn't exist yet (e.g. contacts sync hasn't run
    for this person) — there is nothing to bump.
    """
    await queries.bump_edge_weight(db, ME_PERSON_ID, person_id)
