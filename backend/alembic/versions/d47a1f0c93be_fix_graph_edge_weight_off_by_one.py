"""fix the graph edge weight being one higher than the conversation count

`graph_edges.weight` is what the API returns as `conversation_count`, and it has always
read one too high: the edge was created with weight 1 when the contact was saved, and each
conversation added one. A contact you have never recorded a conversation with reported
"1 conversation".

This predates the move off Neo4j — the live Neo4j store had `weight = 2` on an edge with
exactly one conversation — and the migration that brought the graph into MySQL preserved
it deliberately, so that changing where the graph is stored and changing what the graph
screen shows stayed separate. This is the second of those two changes.

Paired with `ensure_edge` and `create_acquaintance` in app/features/graph/queries.py,
which now start an edge at 0. Both halves must land together: the code alone would leave
existing contacts one high forever, and this alone would be undone by the next contact
edit.

Revision ID: d47a1f0c93be
Revises: a1c4e77b9f20
Create Date: 2026-09-22 10:12:41.507733

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d47a1f0c93be"
down_revision: str | Sequence[str] | None = "a1c4e77b9f20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # `WHERE weight > 0` so this cannot drive a row negative — if any edge is already at
    # 0 (created after the code change, or by an earlier run of this), leave it alone.
    op.execute(sa.text("UPDATE graph_edges SET weight = weight - 1 WHERE weight > 0"))

    op.alter_column(
        "graph_edges",
        "weight",
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default="0",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "graph_edges",
        "weight",
        existing_type=sa.Integer(),
        existing_nullable=False,
        server_default="1",
    )

    op.execute(sa.text("UPDATE graph_edges SET weight = weight + 1"))
