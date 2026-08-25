"""initial (no models yet)

Revision ID: eaa8659ad5c8
Revises: 
Create Date: 2026-08-25 14:34:30.940825

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'eaa8659ad5c8'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
