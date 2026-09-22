"""scope every table by device_id

CARD:N had exactly one user — `ME_PERSON_ID = 0`, a single `my_card` row, a single
`game_deck` row. That is fine on a laptop and wrong the moment the app is installed twice:
everyone would share one set of contacts, and those contacts are other people's names and
phone numbers.

Every table now carries the id of the install that owns the row (app/device.py). Two of
them change shape rather than just gaining a column:

* `my_card` and `game_deck` were singletons keyed `id = 1`; they are now keyed by
  `device_id`, one row per install.
* `graph_persons` moves to a composite primary key `(device_id, id)`, which is what keeps
  the graph's conventions working per install: every device gets its own `0` for "me" and
  counts its own acquaintances down from `-1`. `graph_edges` and `graph_intro_consents`
  follow with composite foreign keys.

Existing rows are handed to `LEGACY_DEVICE_ID` rather than deleted, so a developer's local
data survives the upgrade. No real client sends that value, so the rows are inert: to see
them again, set the app's device id to it by hand.

Revision ID: f2b90c1d64ae
Revises: d47a1f0c93be
Create Date: 2026-09-22 14:08:52.417790

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2b90c1d64ae"
down_revision: str | Sequence[str] | None = "d47a1f0c93be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEVICE_ID = sa.String(length=64)

# Where rows that predate device scoping end up. Deliberately not a valid client id.
LEGACY_DEVICE_ID = "legacy-device-0000"


def upgrade() -> None:
    """Upgrade schema."""
    # --- plain column additions -------------------------------------------------
    for table in ("persons", "conversations", "battle_cards"):
        op.add_column(table, sa.Column("device_id", DEVICE_ID, nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET device_id = :d").bindparams(d=LEGACY_DEVICE_ID))
        op.alter_column(table, "device_id", existing_type=DEVICE_ID, nullable=False)

    op.create_index("ix_persons_device", "persons", ["device_id"])
    op.create_index("ix_conversations_device", "conversations", ["device_id"])
    op.create_index("ix_battle_cards_device", "battle_cards", ["device_id"])

    # --- singletons become one row per install ----------------------------------
    for table in ("my_card", "game_deck"):
        op.add_column(table, sa.Column("device_id", DEVICE_ID, nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET device_id = :d").bindparams(d=LEGACY_DEVICE_ID))
        op.alter_column(table, "device_id", existing_type=DEVICE_ID, nullable=False)
        # The old integer key has to go before device_id can take its place.
        op.drop_column(table, "id")
        op.create_primary_key(f"pk_{table}", table, ["device_id"])

    # --- the graph: composite keys ----------------------------------------------
    # Drop the FKs first; their parent's primary key is about to change underneath them.
    for name in ("graph_edges_ibfk_1", "graph_edges_ibfk_2"):
        op.drop_constraint(name, "graph_edges", type_="foreignkey")
    for name in ("graph_intro_consents_ibfk_1", "graph_intro_consents_ibfk_2"):
        op.drop_constraint(name, "graph_intro_consents", type_="foreignkey")

    for table in ("graph_persons", "graph_edges", "graph_intro_consents"):
        op.add_column(table, sa.Column("device_id", DEVICE_ID, nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET device_id = :d").bindparams(d=LEGACY_DEVICE_ID))
        op.alter_column(table, "device_id", existing_type=DEVICE_ID, nullable=False)

    op.drop_constraint("PRIMARY", "graph_persons", type_="primary")
    op.create_primary_key("pk_graph_persons", "graph_persons", ["device_id", "id"])

    op.drop_constraint("uq_graph_edge", "graph_edges", type_="unique")
    op.create_unique_constraint(
        "uq_graph_edge", "graph_edges", ["device_id", "person_a_id", "person_b_id"]
    )
    op.drop_constraint("uq_graph_consent", "graph_intro_consents", type_="unique")
    op.create_unique_constraint(
        "uq_graph_consent",
        "graph_intro_consents",
        ["device_id", "from_person_id", "to_person_id"],
    )

    op.create_index("ix_graph_edges_device_a", "graph_edges", ["device_id", "person_a_id"])
    op.create_index("ix_graph_edges_device_b", "graph_edges", ["device_id", "person_b_id"])
    op.create_index(
        "ix_graph_consents_from", "graph_intro_consents", ["device_id", "from_person_id"]
    )
    op.create_index(
        "ix_graph_consents_to_new",
        "graph_intro_consents",
        ["device_id", "to_person_id", "status"],
    )

    op.create_foreign_key(
        "fk_graph_edges_a",
        "graph_edges",
        "graph_persons",
        ["device_id", "person_a_id"],
        ["device_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_graph_edges_b",
        "graph_edges",
        "graph_persons",
        ["device_id", "person_b_id"],
        ["device_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_graph_consents_from",
        "graph_intro_consents",
        "graph_persons",
        ["device_id", "from_person_id"],
        ["device_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_graph_consents_to",
        "graph_intro_consents",
        "graph_persons",
        ["device_id", "to_person_id"],
        ["device_id", "id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema.

    Only meaningful while a single install's rows are in the tables — collapsing several
    devices back into one shared namespace would merge different people's contacts, and
    the graph's per-device `0` rows would collide outright. Everything but the first
    device's data is dropped, which is the honest version of "undo this".
    """
    op.execute(
        sa.text("DELETE FROM graph_persons WHERE device_id <> :d").bindparams(d=LEGACY_DEVICE_ID)
    )
    for table in ("battle_cards", "conversations", "persons"):
        op.execute(
            sa.text(f"DELETE FROM {table} WHERE device_id <> :d").bindparams(d=LEGACY_DEVICE_ID)
        )

    for name, table in (
        ("fk_graph_edges_a", "graph_edges"),
        ("fk_graph_edges_b", "graph_edges"),
        ("fk_graph_consents_from", "graph_intro_consents"),
        ("fk_graph_consents_to", "graph_intro_consents"),
    ):
        op.drop_constraint(name, table, type_="foreignkey")

    op.drop_index("ix_graph_consents_to_new", "graph_intro_consents")
    op.drop_index("ix_graph_consents_from", "graph_intro_consents")
    op.drop_index("ix_graph_edges_device_b", "graph_edges")
    op.drop_index("ix_graph_edges_device_a", "graph_edges")

    op.drop_constraint("uq_graph_consent", "graph_intro_consents", type_="unique")
    op.create_unique_constraint(
        "uq_graph_consent", "graph_intro_consents", ["from_person_id", "to_person_id"]
    )
    op.drop_constraint("uq_graph_edge", "graph_edges", type_="unique")
    op.create_unique_constraint("uq_graph_edge", "graph_edges", ["person_a_id", "person_b_id"])

    op.drop_constraint("PRIMARY", "graph_persons", type_="primary")
    op.create_primary_key("pk_graph_persons", "graph_persons", ["id"])

    for table in ("graph_intro_consents", "graph_edges", "graph_persons"):
        op.drop_column(table, "device_id")

    op.create_foreign_key(
        "graph_edges_ibfk_1",
        "graph_edges",
        "graph_persons",
        ["person_a_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "graph_edges_ibfk_2",
        "graph_edges",
        "graph_persons",
        ["person_b_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "graph_intro_consents_ibfk_1",
        "graph_intro_consents",
        "graph_persons",
        ["from_person_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "graph_intro_consents_ibfk_2",
        "graph_intro_consents",
        "graph_persons",
        ["to_person_id"],
        ["id"],
        ondelete="CASCADE",
    )

    for table in ("my_card", "game_deck"):
        op.drop_constraint("PRIMARY", table, type_="primary")
        op.add_column(table, sa.Column("id", sa.Integer(), nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET id = 1"))
        op.alter_column(table, "id", existing_type=sa.Integer(), nullable=False)
        op.create_primary_key(f"pk_{table}", table, ["id"])
        op.drop_column(table, "device_id")

    op.drop_index("ix_battle_cards_device", "battle_cards")
    op.drop_index("ix_conversations_device", "conversations")
    op.drop_index("ix_persons_device", "persons")
    for table in ("battle_cards", "conversations", "persons"):
        op.drop_column(table, "device_id")
