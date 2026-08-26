"""add persons and my_card tables

Revision ID: 9dc1d8d545d1
Revises: eaa8659ad5c8
Create Date: 2026-08-26 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9dc1d8d545d1'
down_revision: str | Sequence[str] | None = 'eaa8659ad5c8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'persons',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('company', sa.String(length=150), nullable=True),
        sa.Column('department', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=150), nullable=True),
        sa.Column('job_class', sa.String(length=30), nullable=True),
        sa.Column('relation', sa.String(length=20), nullable=False),
        sa.Column('context', sa.Text(), nullable=True),
        sa.Column('last_contact', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'my_card',
        sa.Column('id', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('company', sa.String(length=150), nullable=True),
        sa.Column('title', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=150), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('my_card')
    op.drop_table('persons')
