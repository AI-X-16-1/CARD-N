"""Neo4j node sync for the contacts feature.

docs/features.md's 강민구 touchpoints: "When a person is created, the Neo4j node
needs to be synced." There's no graph-owned API/service to call for this yet (see
docs/architecture.md), so this writes directly to Neo4j via the shared driver
(app/neo4j_driver.py), matching the Person/Company/MET_AT shape that
features/graph/queries.py already reads from. Cypher here should stay limited to
"keep the graph's view of a person in sync" — anything graph-domain-specific
(traversal, introduction requests, edge weights from conversations) stays in
features/graph/queries.py, owned by 김민경.

Best-effort: contacts/MySQL is the single source of truth for person data (per
docs/features.md), so a Neo4j hiccup must not block a contact CRUD operation.
Callers should catch and log, not propagate.
"""

import logging

from neo4j import AsyncDriver

from app.features.graph.queries import ME_PERSON_ID

logger = logging.getLogger(__name__)

_SYNC_PERSON_QUERY = """
MERGE (person:Person {id: $id})
SET person.name = $name, person.job_class = $job_class
WITH person
MERGE (me:Person {id: $me_id})
SET me.name = coalesce(me.name, 'Me')  // must not be left null — graph/queries.py's
                                        // "Me" fallback only applies when the node
                                        // doesn't exist yet, and Pydantic requires
                                        // GraphNodeResponse.name to be a str. coalesce
                                        // (not ON CREATE) so this also self-heals a "me"
                                        // node that was already created bare before
                                        // this fix, not just new ones.
MERGE (me)-[r:MET_AT]-(person)
ON CREATE SET r.weight = 1, r.last_interaction = datetime()
WITH person
FOREACH (_ IN CASE WHEN $company IS NOT NULL THEN [1] ELSE [] END |
  MERGE (c:Company {name: $company})
  MERGE (person)-[:WORKS_AT]->(c)
)
"""

_DELETE_PERSON_QUERY = "MATCH (person:Person {id: $id}) DETACH DELETE person"


async def sync_person_node(
    driver: AsyncDriver,
    *,
    person_id: int,
    name: str,
    company: str | None,
    job_class: str | None,
) -> None:
    """Upserts a Person node + MET_AT edge from "me" on create, and refreshes the
    node's display properties on update. Known gap: switching a person's company
    merges a new Company/WORKS_AT edge but doesn't remove the old one — left for a
    follow-up since reconciling that is graph-domain territory.
    """
    async with driver.session() as session:
        await session.run(
            _SYNC_PERSON_QUERY,
            id=person_id,
            name=name,
            company=company,
            job_class=job_class,
            me_id=ME_PERSON_ID,
        )


async def delete_person_node(driver: AsyncDriver, *, person_id: int) -> None:
    async with driver.session() as session:
        await session.run(_DELETE_PERSON_QUERY, id=person_id)
