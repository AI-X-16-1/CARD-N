"""Two installs must not see each other's data.

This is the whole point of app/device.py, and it is the kind of property that silently
stops holding: one forgotten `.where(device_id == ...)` in a future query is a leak, and
nothing else in the suite would notice, because every other test speaks as a single
device.

So these tests set up two devices with deliberately *colliding* ids — same person id, same
graph node ids, same "me" — and check that each one only ever sees its own.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import TEST_DEVICE_ID

OTHER = "other-device-9999"


def _client_for(client: TestClient, device_id: str) -> TestClient:
    """The same app and database, spoken to as a different install."""
    return TestClient(app, headers={"X-Device-Id": device_id})


def _create(client: TestClient, name: str, **overrides) -> dict:
    payload = {"name": name, "company": "테스트", "job_class": "dev", "relation": "other"}
    payload.update(overrides)
    response = client.post("/api/v1/contacts", json=payload)
    assert response.status_code == 201
    return response.json()


# ─────────────────────────────────────────────────────────────
# The header itself
# ─────────────────────────────────────────────────────────────


def test_a_request_without_a_device_id_is_refused() -> None:
    """No header used to mean "the only user". Falling back to a shared bucket is exactly
    the data-mixing this exists to stop, so it has to fail loudly instead.
    """
    response = TestClient(app).get("/api/v1/contacts")

    assert response.status_code == 422


@pytest.mark.parametrize("bad", ["", "short", "x" * 65, "has spaces", "drop;table"])
def test_a_malformed_device_id_is_refused(bad: str) -> None:
    response = TestClient(app, headers={"X-Device-Id": bad}).get("/api/v1/contacts")

    assert response.status_code in (400, 422)
    if response.status_code == 400:
        assert response.json()["detail"] == "INVALID_DEVICE_ID"


# ─────────────────────────────────────────────────────────────
# Contacts
# ─────────────────────────────────────────────────────────────


def test_contacts_are_not_shared_between_devices(client: TestClient) -> None:
    mine = _create(client, "내 연락처")
    other = _client_for(client, OTHER)
    theirs = _create(other, "남의 연락처")

    my_list = client.get("/api/v1/contacts").json()
    their_list = other.get("/api/v1/contacts").json()

    assert [p["name"] for p in my_list["items"]] == ["내 연락처"]
    assert [p["name"] for p in their_list["items"]] == ["남의 연락처"]
    assert my_list["total"] == their_list["total"] == 1
    assert mine["id"] != theirs["id"]


def test_another_devices_contact_reads_as_not_found(client: TestClient) -> None:
    """Guessing an integer must not reach someone else's business card."""
    theirs = _create(_client_for(client, OTHER), "남의 연락처")

    assert client.get(f"/api/v1/contacts/{theirs['id']}").status_code == 404
    assert (
        client.put(f"/api/v1/contacts/{theirs['id']}", json={"company": "탈취"}).status_code == 404
    )
    assert client.delete(f"/api/v1/contacts/{theirs['id']}").status_code == 404


def test_my_card_is_per_device(client: TestClient) -> None:
    other = _client_for(client, OTHER)

    client.put("/api/v1/contacts/me", json={"name": "김민경"})
    other.put("/api/v1/contacts/me", json={"name": "다른 사람"})

    assert client.get("/api/v1/contacts/me").json()["name"] == "김민경"
    assert other.get("/api/v1/contacts/me").json()["name"] == "다른 사람"


# ─────────────────────────────────────────────────────────────
# Graph — where the ids actually collide
# ─────────────────────────────────────────────────────────────


def test_each_device_has_its_own_graph(client: TestClient) -> None:
    other = _client_for(client, OTHER)
    _create(client, "내 연락처")
    _create(other, "남의 연락처")
    _create(other, "남의 연락처 2")

    mine = client.get("/api/v1/graph").json()
    theirs = other.get("/api/v1/graph").json()

    assert mine["stats"]["degree_1_count"] == 1
    assert theirs["stats"]["degree_1_count"] == 2
    assert [n["name"] for n in mine["nodes"] if n["type"] == "person"] == ["내 연락처"]


def test_both_devices_get_their_own_me_node(client: TestClient) -> None:
    """`ME_PERSON_ID` is 0 on every install. The composite key is what keeps those two
    rows from being the same row.
    """
    other = _client_for(client, OTHER)
    _create(client, "내 연락처")
    _create(other, "남의 연락처")

    client.put("/api/v1/contacts/me", json={"name": "김민경"})

    mine = [n for n in client.get("/api/v1/graph").json()["nodes"] if n["type"] == "me"]
    theirs = [n for n in other.get("/api/v1/graph").json()["nodes"] if n["type"] == "me"]

    assert len(mine) == len(theirs) == 1
    assert mine[0]["id"] == theirs[0]["id"] == 0


def test_acquaintance_ids_restart_at_minus_one_per_device(client: TestClient) -> None:
    """Both devices allocate -1. They are different people, and must stay so."""
    other = _client_for(client, OTHER)
    mine = _create(client, "내 연락처")
    theirs = _create(other, "남의 연락처")

    a = client.post(f"/api/v1/graph/{mine['id']}/acquaintances", json={"name": "내 지인"})
    b = other.post(f"/api/v1/graph/{theirs['id']}/acquaintances", json={"name": "남의 지인"})

    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] == b.json()["id"] == -1

    assert [
        x["name"]
        for x in client.get(f"/api/v1/graph/{mine['id']}/acquaintances").json()["acquaintances"]
    ] == ["내 지인"]
    assert [
        x["name"]
        for x in other.get(f"/api/v1/graph/{theirs['id']}/acquaintances").json()["acquaintances"]
    ] == ["남의 지인"]


def test_introduction_requests_do_not_cross_devices(client: TestClient) -> None:
    other = _client_for(client, OTHER)
    theirs = _create(other, "남의 연락처")

    # Their contact is not in my graph, so this is not a 1st-degree person of mine.
    response = client.post(f"/api/v1/graph/{theirs['id']}/introduction-requests")

    assert response.status_code == 404
    assert response.json()["detail"] == "NOT_FIRST_DEGREE"
    assert other.get("/api/v1/graph/introduction-requests").json()["requests"] == []


# ─────────────────────────────────────────────────────────────
# Conversations and the game
# ─────────────────────────────────────────────────────────────


def test_another_devices_conversations_are_unreachable(client: TestClient) -> None:
    theirs = _create(_client_for(client, OTHER), "남의 연락처")

    response = client.get(f"/api/v1/conversations?person_id={theirs['id']}")

    assert response.status_code == 404


def test_the_card_collection_is_per_device(client: TestClient) -> None:
    other = _client_for(client, OTHER)
    _create(client, "내 연락처")
    _create(other, "남의 연락처")
    _create(other, "남의 연락처 2")

    mine = client.get("/api/v1/game/cards").json()
    theirs = other.get("/api/v1/game/cards").json()

    assert len(mine) == 1
    assert len(theirs) == 2


def test_decks_are_per_device(client: TestClient) -> None:
    other = _client_for(client, OTHER)
    _create(client, "내 연락처")
    [card] = client.get("/api/v1/game/cards").json()

    client.put("/api/v1/game/deck", json={"card_ids": [card["id"]]})

    assert client.get("/api/v1/game/deck").json()["card_ids"] == [card["id"]]
    assert other.get("/api/v1/game/deck").json()["card_ids"] == []


def test_a_deck_cannot_be_built_from_another_devices_cards(client: TestClient) -> None:
    other = _client_for(client, OTHER)
    _create(other, "남의 연락처")
    [theirs] = other.get("/api/v1/game/cards").json()

    response = client.put("/api/v1/game/deck", json={"card_ids": [theirs["id"]]})

    assert response.status_code == 422
    assert "Unknown card ids" in response.json()["detail"]


def test_the_default_test_device_is_the_one_the_fixture_uses(client: TestClient) -> None:
    """Guards the assumption the rest of this module rests on."""
    created = _create(client, "내 연락처")

    assert (
        _client_for(client, TEST_DEVICE_ID).get(f"/api/v1/contacts/{created['id']}").status_code
        == 200
    )
    assert _client_for(client, OTHER).get(f"/api/v1/contacts/{created['id']}").status_code == 404
