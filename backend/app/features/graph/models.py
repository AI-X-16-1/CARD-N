"""SQLAlchemy models for the graph feature.

These three tables replace the Neo4j node/relationship model one for one — see
docs/neo4j-to-mysql-migration.md §3 for why the graph keeps its own mirror of a person's
display fields instead of joining features/contacts' `persons` table directly.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.device import DEVICE_ID_MAX_LENGTH

# SQLite only autoincrements a column declared INTEGER PRIMARY KEY — a BIGINT one is an
# ordinary column that insists on a value. The app runs on MySQL and the tests on SQLite,
# so the surrogate keys below say BIGINT to one and INTEGER to the other.
_AutoId = BigInteger().with_variant(Integer, "sqlite")


class GraphPerson(Base):
    """A node in the relationship graph. Was `(:Person)`.

    The id space is per install, and unchanged from the Neo4j model:

    * ``0``   — me (see `queries.ME_PERSON_ID`; my details live in `my_card`, not `persons`)
    * ``> 0`` — a contact, mirrored from `persons.id` by contacts/graph_sync.py
    * ``< 0`` — an acquaintance, who exists only in the graph

    The primary key is ``(device_id, id)``, which is what lets those three conventions
    survive more than one install: every device gets its own ``0`` for "me" and its own
    ``-1, -2, …`` for acquaintances, and the API keeps returning the same ids it always
    did. A single global id space would have forced "me" to become an arbitrary number
    and broken the sign convention that `fetch_acquaintances` reads.

    Deliberately *not* a foreign key to `persons.id`: two of those three cases have no row
    there. `company` is a plain column rather than the `(:Company)` node it used to be —
    nothing ever treated a company as an entity, only as a display string.
    """

    __tablename__ = "graph_persons"

    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH), primary_key=True)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(100))
    job_class: Mapped[str | None] = mapped_column(String(30))
    company: Mapped[str | None] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class GraphEdge(Base):
    """Evidence that I have met this person. Was `[:MET_AT]`.

    `MET_AT` is undirected in Cypher, and a SQL row is not, so the pair is stored once in a
    canonical order — `person_a_id <= person_b_id`, enforced by `queries.pair()` on every
    write. That invariant is what makes the unique constraint do the job `MERGE` used to:
    without it, (0, 5) and (5, 0) become two rows and the weight splits across them.

    Reads go through `queries.ADJACENCY`, which expands each row into both directions.
    """

    __tablename__ = "graph_edges"
    __table_args__ = (
        UniqueConstraint("device_id", "person_a_id", "person_b_id", name="uq_graph_edge"),
        ForeignKeyConstraint(
            ["device_id", "person_a_id"],
            ["graph_persons.device_id", "graph_persons.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["device_id", "person_b_id"],
            ["graph_persons.device_id", "graph_persons.id"],
            ondelete="CASCADE",
        ),
        Index("ix_graph_edges_device_a", "device_id", "person_a_id"),
        Index("ix_graph_edges_device_b", "device_id", "person_b_id"),
    )

    id: Mapped[int] = mapped_column(_AutoId, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH))
    person_a_id: Mapped[int] = mapped_column(BigInteger)
    person_b_id: Mapped[int] = mapped_column(BigInteger)
    # Number of recorded conversations, bumped by graph/conversation_sync.py. Starts at
    # 0: this is what the API returns as `conversation_count`, and a saved business card
    # is not a conversation.
    weight: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_interaction: Mapped[datetime | None] = mapped_column(DateTime)
    # "acquaintance" for an edge created by add_acquaintance, else NULL.
    origin: Mapped[str | None] = mapped_column(String(20))


class GraphIntroConsent(Base):
    """One person's consent to being surfaced to another. Was `[:INTRO_CONSENT]`.

    Directed, unlike GraphEdge: `(from_person_id)-[c]->(to_person_id)` reads as "from agreed
    to be shown through to". The direction is load-bearing — reversing it in a query hands
    out exactly the exposure the 2nd-degree privacy rule in docs/api-spec.md withholds.

    The cascades are what `DETACH DELETE` used to do: deleting a person takes their consent
    rows with them, in both directions.
    """

    __tablename__ = "graph_intro_consents"
    __table_args__ = (
        UniqueConstraint("device_id", "from_person_id", "to_person_id", name="uq_graph_consent"),
        ForeignKeyConstraint(
            ["device_id", "from_person_id"],
            ["graph_persons.device_id", "graph_persons.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["device_id", "to_person_id"],
            ["graph_persons.device_id", "graph_persons.id"],
            ondelete="CASCADE",
        ),
        Index("ix_graph_consents_from", "device_id", "from_person_id"),
        Index("ix_graph_consents_to", "device_id", "to_person_id", "status"),
    )

    id: Mapped[int] = mapped_column(_AutoId, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(DEVICE_ID_MAX_LENGTH))
    from_person_id: Mapped[int] = mapped_column(BigInteger)
    to_person_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "declined", name="consent_status")
    )
    requested_at: Mapped[datetime | None] = mapped_column(DateTime)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
