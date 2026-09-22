"""Contacts' half of the relationship graph.

Was a Cypher-text assertion against a fake Neo4j driver. Since
docs/neo4j-to-mysql-migration.md the graph is in the same database as `persons`, so these
go through the API and check what actually came out the other end.

The original regression this file exists for: sync_person_node's MERGE created the "me"
node with no name, which made every GET /graph 500 once a single contact existed
(graph/queries.py's "Me" fallback only applies when the node is missing entirely, not when
it exists with name=None). The shape of that bug is gone — graph_persons.name is NOT NULL
— but the behaviour it needed is still pinned below.
"""

from fastapi.testclient import TestClient


def _create_person(client: TestClient, **overrides) -> dict:
    payload = {
        "name": "Hong Gil-dong",
        "company": "Kakao",
        "job_class": "marketing",
        "relation": "client",
    }
    payload.update(overrides)
    response = client.post("/api/v1/contacts", json=payload)
    assert response.status_code == 201
    return response.json()


def test_a_new_contact_is_in_the_graph_immediately(client: TestClient) -> None:
    """The node is written in the contact's own transaction now, so "saved but not in the
    graph" — the state frontend/src/features/contacts/api.ts had to work around — cannot
    happen any more.
    """
    created = _create_person(client)

    response = client.get("/api/v1/graph")

    assert response.status_code == 200
    body = response.json()
    assert body["stats"]["degree_1_count"] == 1
    [contact] = [node for node in body["nodes"] if node["type"] == "person"]
    assert contact["id"] == created["id"]
    assert contact["name"] == "Hong Gil-dong"
    assert contact["company"] == "Kakao"
    assert contact["degree"] == 1


def test_a_contact_with_no_conversations_reads_zero(client: TestClient) -> None:
    """The number under the contact on the graph screen is the edge weight. It used to
    start at 1, so a card you had just saved claimed one conversation.
    """
    _create_person(client)

    body = client.get("/api/v1/graph").json()

    [contact] = [node for node in body["nodes"] if node["type"] == "person"]
    assert contact["conversation_count"] == 0
    assert body["edges"][0]["weight"] == 0


def test_the_me_node_always_has_a_name(client: TestClient) -> None:
    _create_person(client)

    body = client.get("/api/v1/graph").json()

    [me] = [node for node in body["nodes"] if node["type"] == "me"]
    assert me["id"] == 0
    assert me["name"] == "Me"


def test_editing_a_contact_updates_the_graph_and_keeps_the_edge(client: TestClient) -> None:
    """The edge carries the conversation count, so an edit must refresh the node's display
    fields without recreating the edge underneath them.
    """
    created = _create_person(client)

    response = client.put(
        f"/api/v1/contacts/{created['id']}",
        json={"company": "Naver", "job_class": "dev"},
    )
    assert response.status_code == 200

    body = client.get("/api/v1/graph").json()
    [contact] = [node for node in body["nodes"] if node["type"] == "person"]
    assert contact["company"] == "Naver"
    assert contact["job_class"] == "dev"
    assert body["stats"]["degree_1_count"] == 1
    assert len(body["edges"]) == 1


def test_deleting_a_contact_takes_them_out_of_the_graph(client: TestClient) -> None:
    created = _create_person(client)

    assert client.delete(f"/api/v1/contacts/{created['id']}").status_code == 204

    body = client.get("/api/v1/graph").json()
    assert body["stats"]["degree_1_count"] == 0
    assert body["edges"] == []
    assert [node["type"] for node in body["nodes"]] == ["me"]
