"""widen encrypted pii columns

Revision ID: 55d6000b2f3d
Revises: 9dc1d8d545d1
Create Date: 2026-08-26 00:00:00.000000

Person.phone/email and MyCard.phone/email now go through EncryptedString
(app/core/crypto.py) per backend/CLAUDE.md's "personal information should be
stored encrypted" rule. Fernet ciphertext runs well over 2x the plaintext
length (IV + HMAC + base64), so these columns need to be widened to fit it.

Local dev only: any existing plaintext rows are NOT migrated to ciphertext by
this revision — the column is just widened. A fresh dev DB (or manually
re-entering test data) is expected; there's no production data to preserve.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '55d6000b2f3d'
down_revision: str | Sequence[str] | None = '9dc1d8d545d1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column('persons', 'phone', type_=sa.String(500), existing_nullable=True)
    op.alter_column('persons', 'email', type_=sa.String(500), existing_nullable=True)
    op.alter_column('my_card', 'phone', type_=sa.String(500), existing_nullable=True)
    op.alter_column('my_card', 'email', type_=sa.String(500), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('persons', 'phone', type_=sa.String(30), existing_nullable=True)
    op.alter_column('persons', 'email', type_=sa.String(150), existing_nullable=True)
    op.alter_column('my_card', 'phone', type_=sa.String(30), existing_nullable=True)
    op.alter_column('my_card', 'email', type_=sa.String(150), existing_nullable=True)
