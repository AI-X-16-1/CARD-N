"""add conversations table

Revision ID: c41a7b9e2d08
Revises: 55d6000b2f3d
Create Date: 2026-08-26 00:00:00.000000

One row per recorded conversation with a contact, holding only the generated
summary. Neither the audio nor the transcript is stored (ui-spec §6 and
backend/CLAUDE.md privacy rules); `transcript_hash` is kept purely so that
re-summarizing the same recording updates its existing row instead of counting
as another meeting.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c41a7b9e2d08'
down_revision: str | Sequence[str] | None = '55d6000b2f3d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'conversations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('transcript_hash', sa.String(length=64), nullable=False),
        sa.Column('one_liner', sa.String(length=300), nullable=False, server_default=''),
        sa.Column('summary_json', sa.Text(), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('person_id', 'transcript_hash', name='uq_person_transcript'),
    )
    op.create_index(
        op.f('ix_conversations_person_id'), 'conversations', ['person_id'], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_conversations_person_id'), table_name='conversations')
    op.drop_table('conversations')
