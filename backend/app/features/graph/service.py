"""Business logic for the graph feature."""

from datetime import UTC, datetime

from fastapi import HTTPException
from neo4j import AsyncDriver

from app.features.graph import queries
from app.features.graph.schemas import (
    AcquaintanceResponse,
    AcquaintancesResponse,
    GraphEdgeResponse,
    GraphNodeResponse,
    GraphResponse,
    GraphStatsResponse,
    IncomingIntroductionRequest,
    IncomingIntroductionRequestsResponse,
    IntroductionRequestResponse,
    IntroductionRequestStatusResponse,
)


class GraphService:
    def __init__(self, driver: AsyncDriver):
        self.driver = driver

    async def get_graph(self, depth: int = 1, job_filter: str = "all") -> GraphResponse:
        me_id = queries.ME_PERSON_ID
        me = await queries.fetch_me(self.driver, me_id)

        first_degree = self._filter_by_job(
            await queries.fetch_first_degree(self.driver, me_id), job_filter
        )

        second_degree: list[dict] = []
        if depth >= 2 and first_degree:
            first_degree_ids = [row["id"] for row in first_degree]
            second_degree = self._filter_by_job(
                await queries.fetch_second_degree(self.driver, me_id, first_degree_ids),
                job_filter,
            )

        nodes = [
            GraphNodeResponse(id=me["id"], type="me", name=me["name"]),
            *(self._person_node(row, degree=1) for row in first_degree),
            *(self._person_node(row, degree=2) for row in second_degree),
        ]

        edges = [
            GraphEdgeResponse(
                source=me_id,
                target=row["id"],
                weight=row["weight"] or 0,
                last_interaction=row["last_interaction"],
            )
            for row in first_degree
        ] + [
            GraphEdgeResponse(
                source=row["parent_id"],
                target=row["id"],
                weight=row["weight"] or 0,
                last_interaction=row["last_interaction"],
            )
            for row in second_degree
        ]

        stats = GraphStatsResponse(
            degree_1_count=len(first_degree),
            degree_2_count=len(second_degree),
        )

        return GraphResponse(nodes=nodes, edges=edges, stats=stats)

    @staticmethod
    def _filter_by_job(rows: list[dict], job_filter: str) -> list[dict]:
        if job_filter == "all":
            return rows
        return [row for row in rows if row.get("job_class") == job_filter]

    @staticmethod
    def _person_node(row: dict, degree: int) -> GraphNodeResponse:
        return GraphNodeResponse(
            id=row["id"],
            type="person",
            name=row["name"],
            job_class=row.get("job_class"),
            company=row.get("company"),
            degree=degree,
            conversation_count=row.get("weight") or 0,
            last_conversation=row.get("last_interaction"),
            introduction_request_status=row.get("introduction_request_status"),
        )

    async def add_acquaintance(
        self, contact_person_id: int, *, name: str, job_class: str | None
    ) -> AcquaintanceResponse:
        """Record that one of my contacts knows someone who is not a contact of mine.

        This is the only thing that produces a contact-to-contact `MET_AT` edge, and so
        the only way anyone reaches the 2nd-degree section of the graph at all.

        The person starts unapproved. They are invisible until their consent is recorded
        (see `record_acquaintance_consent`), which is the privacy rule in api-spec.md —
        creating them already approved would have this endpoint hand out exactly the
        exposure that rule withholds.
        """
        if not await queries.is_first_degree(self.driver, queries.ME_PERSON_ID, contact_person_id):
            raise HTTPException(status_code=404, detail="NOT_FIRST_DEGREE")

        person_id = await queries.next_acquaintance_id(self.driver)
        row = await queries.create_acquaintance(
            self.driver,
            contact_id=contact_person_id,
            person_id=person_id,
            name=name,
            job_class=job_class,
        )
        if row is None:
            raise HTTPException(status_code=404, detail="CONTACT_NOT_IN_GRAPH")

        return AcquaintanceResponse(**row)

    async def record_acquaintance_consent(self, acquaintance_id: int) -> AcquaintanceResponse:
        """Record that this person agreed to be surfaced through the contact who knows them.

        In a multi-user product this is their own action, taken in their own app. There is
        one user here, so it is recorded on their behalf — see api-spec.md. The endpoint
        stays named for what it records rather than for who taps it, so the distinction
        survives into a multi-user version.
        """
        row = await queries.approve_acquaintance(self.driver, acquaintance_id)
        if row is None:
            raise HTTPException(status_code=404, detail="ACQUAINTANCE_NOT_FOUND")

        return AcquaintanceResponse(**row)

    async def list_acquaintances(self, contact_person_id: int) -> AcquaintancesResponse:
        rows = await queries.fetch_acquaintances(self.driver, contact_person_id)
        return AcquaintancesResponse(
            person_id=contact_person_id,
            acquaintances=[AcquaintanceResponse(**row) for row in rows],
        )

    async def request_introduction(self, target_person_id: int) -> IntroductionRequestResponse:
        me_id = queries.ME_PERSON_ID

        if not await queries.is_first_degree(self.driver, me_id, target_person_id):
            raise HTTPException(status_code=404, detail="NOT_FIRST_DEGREE")

        existing = await queries.get_intro_consent(self.driver, me_id, target_person_id)
        if existing is not None and existing["status"] in ("pending", "approved"):
            raise HTTPException(status_code=409, detail="ALREADY_REQUESTED")

        row = await queries.upsert_intro_request(
            self.driver, me_id, target_person_id, datetime.now(UTC)
        )
        return IntroductionRequestResponse(
            person_id=target_person_id,
            status=row["status"],
            requested_at=row["requested_at"],
        )

    async def get_introduction_request(
        self, target_person_id: int
    ) -> IntroductionRequestStatusResponse:
        """The state of my own outgoing request toward one contact.

        Exists so a screen showing a single person doesn't have to pull the whole graph
        just to read one field off one node — features/contacts' PersonDetailScreen was
        doing exactly that (#45).

        Never 404s on "no request yet": not having asked is a normal state the UI renders
        as the default row, not an error. A person who isn't a 1st-degree contact also
        comes back null — there is nothing to report, and saying more would leak whether
        that id exists at all.
        """
        row = await queries.get_intro_consent(self.driver, queries.ME_PERSON_ID, target_person_id)
        if row is None:
            return IntroductionRequestStatusResponse(person_id=target_person_id)

        return IntroductionRequestStatusResponse(
            person_id=target_person_id,
            status=row["status"],
            requested_at=row["requested_at"],
            responded_at=row["responded_at"],
        )

    async def list_incoming_requests(self) -> IncomingIntroductionRequestsResponse:
        rows = await queries.fetch_incoming_intro_requests(self.driver, queries.ME_PERSON_ID)
        return IncomingIntroductionRequestsResponse(
            requests=[IncomingIntroductionRequest(**row) for row in rows]
        )

    async def respond_to_request(
        self, requester_person_id: int, *, approve: bool
    ) -> IntroductionRequestResponse:
        status = "approved" if approve else "declined"
        row = await queries.respond_to_intro_request(
            self.driver,
            requester_person_id,
            queries.ME_PERSON_ID,
            status,
            datetime.now(UTC),
        )
        if row is None:
            raise HTTPException(status_code=404, detail="REQUEST_NOT_FOUND")

        return IntroductionRequestResponse(
            person_id=requester_person_id,
            status=row["status"],
            requested_at=row["requested_at"],
            responded_at=row["responded_at"],
        )

    async def get_stats(self) -> GraphStatsResponse:
        me_id = queries.ME_PERSON_ID
        first_degree = await queries.fetch_first_degree(self.driver, me_id)

        second_degree: list[dict] = []
        if first_degree:
            first_degree_ids = [row["id"] for row in first_degree]
            second_degree = await queries.fetch_second_degree(self.driver, me_id, first_degree_ids)

        return GraphStatsResponse(
            degree_1_count=len(first_degree),
            degree_2_count=len(second_degree),
        )
