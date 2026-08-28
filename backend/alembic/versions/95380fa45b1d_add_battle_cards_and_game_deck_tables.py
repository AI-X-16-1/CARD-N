"""add battle_cards and game_deck tables

Revision ID: 95380fa45b1d
Revises: b51b9ab07230
Create Date: 2026-08-27 19:04:32.118106

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '95380fa45b1d'
down_revision: str | Sequence[str] | None = 'b51b9ab07230'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "battle_cards",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("job_class", sa.String(length=20), nullable=False),
        sa.Column("grade", sa.Integer(), nullable=False),
        sa.Column("cost", sa.Integer(), nullable=False),
        sa.Column("base_stats", sa.JSON(), nullable=False),
        sa.Column("final_stats", sa.JSON(), nullable=False),
        sa.Column("skill", sa.JSON(), nullable=False),
        sa.Column("passive", sa.String(length=50), nullable=False),
        sa.Column("flavor_text", sa.Text(), nullable=False),
        sa.Column("illustration_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["person_id"], ["persons.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("person_id", name="uq_battle_cards_person_id"),
    )

    op.create_table(
        "game_deck",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_ids", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("game_deck")
    op.drop_table("battle_cards")
