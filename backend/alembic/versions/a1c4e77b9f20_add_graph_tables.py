"""add graph tables (graph_persons, graph_edges, graph_intro_consents)

Replaces the Neo4j node/relationship model — see docs/neo4j-to-mysql-migration.md.

The upgrade also backfills, so a developer who runs it gets a working graph without
re-saving every contact by hand. What can be rebuilt from MySQL is rebuilt:

* one graph_persons row per persons row, plus the "me" node
* one (me)-[MET_AT]-(contact) edge per contact
* edge weights recomputed from the conversations table

What cannot: acquaintance nodes (negative ids) and intro-consent rows existed only in
Neo4j. Export them from the Neo4j Browser before dropping the volume if a local instance
holds anything worth keeping (docs/neo4j-to-mysql-migration.md §8).

Revision ID: a1c4e77b9f20
Revises: acb826978ad1
Create Date: 2026-09-22 02:14:05.331902

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1c4e77b9f20'
down_revision: str | Sequence[str] | None = 'acb826978ad1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept in sync with app.features.graph.queries.ME_PERSON_ID. Repeated as a literal on
# purpose: a migration has to keep describing what the schema looked like at this revision
# even if the constant moves or changes later.
ME_PERSON_ID = 0


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "graph_persons",
        # No autoincrement: ids come from persons.id, or are allocated negative for
        # acquaintances, and 0 is "me".
        sa.Column("id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("job_class", sa.String(length=30), nullable=True),
        sa.Column("company", sa.String(length=150), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "graph_edges",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("person_a_id", sa.BigInteger(), nullable=False),
        sa.Column("person_b_id", sa.BigInteger(), nullable=False),
        sa.Column("weight", sa.Integer(), server_default="1", nullable=False),
        sa.Column("last_interaction", sa.DateTime(), nullable=True),
        sa.Column("origin", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(["person_a_id"], ["graph_persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_b_id"], ["graph_persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # MET_AT is undirected; rows are stored with person_a_id <= person_b_id so that this
        # constraint can reject the duplicate that MERGE used to prevent.
        sa.UniqueConstraint("person_a_id", "person_b_id", name="uq_graph_edge"),
    )
    op.create_index("ix_graph_edges_person_a_id", "graph_edges", ["person_a_id"])
    op.create_index("ix_graph_edges_person_b_id", "graph_edges", ["person_b_id"])

    op.create_table(
        "graph_intro_consents",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("from_person_id", sa.BigInteger(), nullable=False),
        sa.Column("to_person_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "declined", name="consent_status"),
            nullable=False,
        ),
        sa.Column("requested_at", sa.DateTime(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["from_person_id"], ["graph_persons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_person_id"], ["graph_persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("from_person_id", "to_person_id", name="uq_graph_consent"),
    )
    op.create_index("ix_graph_intro_consents_from_person_id", "graph_intro_consents", ["from_person_id"])
    op.create_index("ix_graph_consents_to", "graph_intro_consents", ["to_person_id", "status"])

    _backfill()


def _backfill() -> None:
    """Rebuild the parts of the graph that MySQL already knows about."""
    # "Me". The name matches graph/queries.fetch_me's fallback; contacts/graph_sync.py
    # leaves it alone once it exists.
    op.execute(
        sa.text("INSERT INTO graph_persons (id, name) VALUES (:me_id, 'Me')").bindparams(
            me_id=ME_PERSON_ID
        )
    )

    op.execute(
        sa.text(
            "INSERT INTO graph_persons (id, name, job_class, company) "
            "SELECT id, name, job_class, company FROM persons"
        )
    )

    # persons.id is a positive autoincrement and ME_PERSON_ID is 0, so (0, id) is already
    # in canonical order — no LEAST/GREATEST needed here.
    op.execute(
        sa.text(
            "INSERT INTO graph_edges (person_a_id, person_b_id, weight, last_interaction) "
            "SELECT :me_id, id, 1, NULL FROM persons"
        ).bindparams(me_id=ME_PERSON_ID)
    )

    # Recompute weights from the conversations that produced them. This is arguably more
    # accurate than what Neo4j held: the bump was best-effort, so any dropped write is
    # already missing there.
    #
    # `1 + COUNT(*)`, not `COUNT(*)`, because that is what the live code produces: an edge
    # is created with weight 1 and each conversation adds one (graph/queries.py's
    # ensure_edge and bump_edge_weight, unchanged from the Cypher). Backfilling a bare
    # count would make every existing contact read one lower than an identical contact
    # saved tomorrow.
    #
    # That does mean `conversation_count` in the API is one higher than the number of
    # conversations, for contacts and acquaintances alike. It is a pre-existing quirk of
    # the Neo4j implementation, verified against the live Neo4j store before it was
    # dropped, and this migration deliberately preserves it rather than changing what the
    # graph screen shows. Worth fixing on its own, separately from a storage move.
    op.execute(
        sa.text(
            "UPDATE graph_edges e "
            "JOIN (SELECT person_id, COUNT(*) AS n, MAX(created_at) AS last_at "
            "      FROM conversations GROUP BY person_id) c "
            "  ON c.person_id = e.person_b_id AND e.person_a_id = :me_id "
            "SET e.weight = 1 + c.n, e.last_interaction = c.last_at"
        ).bindparams(me_id=ME_PERSON_ID)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("graph_intro_consents")
    op.drop_table("graph_edges")
    op.drop_table("graph_persons")
