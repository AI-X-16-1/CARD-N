"""Endpoint tests for the game feature (/api/v1/game)."""

from unittest.mock import patch


def _make_person(client, **overrides) -> dict:
    payload = {"name": "홍길동", "company": "카카오", "job_class": "marketing", "title": "과장"}
    payload.update(overrides)
    res = client.post("/api/v1/contacts", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


# --- GET /cards -----------------------------------------------------------


def test_list_cards_creates_one_card_per_contact(client):
    _make_person(client, name="A", job_class="dev", title="팀장")
    _make_person(client, name="B", job_class="sales", title="인턴")

    res = client.get("/api/v1/game/cards")

    assert res.status_code == 200
    cards = res.json()
    assert len(cards) == 2
    by_name = {c["name"]: c for c in cards}
    assert by_name["A"]["job_class"] == "dev"
    assert by_name["A"]["grade"] == 4  # 팀장 -> Manager
    assert by_name["B"]["grade"] == 1  # 인턴
    assert by_name["A"]["final_stats"]["atk"] == 9  # floor(7 * 1.35)


def test_list_cards_is_idempotent(client):
    _make_person(client, name="A")
    first = client.get("/api/v1/game/cards").json()
    second = client.get("/api/v1/game/cards").json()

    assert [c["id"] for c in first] == [c["id"] for c in second]


def test_list_cards_response_matches_the_api_spec_shape(client):
    _make_person(client, name="홍길동", company="카카오", job_class="marketing", title="과장")

    card = client.get("/api/v1/game/cards").json()[0]

    for key in (
        "id",
        "person_id",
        "name",
        "company",
        "job_class",
        "job_label",
        "grade",
        "grade_label",
        "stars",
        "cost",
        "base_stats",
        "final_stats",
        "skill",
        "passive",
        "flavor_text",
        "illustration_url",
        "created_at",
    ):
        assert key in card, key
    assert card["stars"] == card["grade"]
    assert card["illustration_url"] is None  # no art yet
    assert set(card["base_stats"]) == {"atk", "def", "int", "hp"}
    assert card["skill"]["name"]


# --- POST /cards --------------------------------------------------------


def test_create_card_for_a_person(client):
    person = _make_person(client)

    res = client.post("/api/v1/game/cards", json={"person_id": person["id"]})

    assert res.status_code == 201
    assert res.json()["person_id"] == person["id"]


def test_create_card_is_idempotent_per_person(client):
    person = _make_person(client)
    a = client.post("/api/v1/game/cards", json={"person_id": person["id"]}).json()
    b = client.post("/api/v1/game/cards", json={"person_id": person["id"]}).json()

    assert a["id"] == b["id"]


def test_create_card_unknown_person_is_404(client):
    res = client.post("/api/v1/game/cards", json={"person_id": 9999})
    assert res.status_code == 404


# --- GET /cards/{id} --------------------------------------------------


def test_get_card_by_id(client):
    _make_person(client)
    card_id = client.get("/api/v1/game/cards").json()[0]["id"]

    res = client.get(f"/api/v1/game/cards/{card_id}")

    assert res.status_code == 200
    assert res.json()["id"] == card_id


def test_get_card_unknown_id_is_404(client):
    assert client.get("/api/v1/game/cards/9999").status_code == 404


# --- PUT /cards/{id}/art -------------------------------------------


def test_set_card_art_stores_the_illustration_url(client):
    _make_person(client)
    card_id = client.get("/api/v1/game/cards").json()[0]["id"]
    url = "http://localhost:8188/view?filename=card_3.png"

    res = client.put(f"/api/v1/game/cards/{card_id}/art", json={"illustration_url": url})

    assert res.status_code == 200
    assert res.json()["illustration_url"] == url
    assert client.get(f"/api/v1/game/cards/{card_id}").json()["illustration_url"] == url


def test_set_card_art_unknown_id_is_404(client):
    res = client.put("/api/v1/game/cards/9999/art", json={"illustration_url": "x"})
    assert res.status_code == 404


# --- deck -----------------------------------------------------------


def test_get_deck_starts_empty(client):
    res = client.get("/api/v1/game/deck")

    assert res.status_code == 200
    assert res.json() == {"card_ids": [], "count": 0, "max": 8, "avg_cost": 0.0}


def test_put_deck_saves_and_reports_avg_cost(client):
    _make_person(client, name="A", title="인턴")  # cost 1
    _make_person(client, name="B", title="팀장")  # cost 4
    cards = {c["name"]: c for c in client.get("/api/v1/game/cards").json()}
    ids = [cards["A"]["id"], cards["B"]["id"]]

    res = client.put("/api/v1/game/deck", json={"card_ids": ids})

    assert res.status_code == 200
    body = res.json()
    assert body["card_ids"] == ids
    assert body["count"] == 2
    assert body["avg_cost"] == 2.5

    assert client.get("/api/v1/game/deck").json()["card_ids"] == ids


def test_put_deck_rejects_more_than_eight(client):
    _make_person(client)
    cid = client.get("/api/v1/game/cards").json()[0]["id"]

    res = client.put("/api/v1/game/deck", json={"card_ids": [cid] * 9})

    assert res.status_code == 422


def test_put_deck_rejects_duplicates(client):
    _make_person(client)
    cid = client.get("/api/v1/game/cards").json()[0]["id"]

    res = client.put("/api/v1/game/deck", json={"card_ids": [cid, cid]})

    assert res.status_code == 422


def test_put_deck_rejects_unknown_card_id(client):
    res = client.put("/api/v1/game/deck", json={"card_ids": [4242]})
    assert res.status_code == 422


# --- POST /cards/{id}/flavor --------------------------------------


def test_regenerate_flavor_persists_the_new_line(client):
    _make_person(client)
    card_id = client.get("/api/v1/game/cards").json()[0]["id"]

    with patch("app.features.game.flavor.regenerate_flavor", return_value="새로 지은 문구"):
        res = client.post(f"/api/v1/game/cards/{card_id}/flavor")

    assert res.status_code == 200
    assert res.json()["flavor_text"] == "새로 지은 문구"
    assert client.get(f"/api/v1/game/cards/{card_id}").json()["flavor_text"] == "새로 지은 문구"


def test_regenerate_flavor_returns_503_when_the_model_is_unavailable(client):
    from app.features.game.flavor import FlavorUnavailable

    _make_person(client)
    card_id = client.get("/api/v1/game/cards").json()[0]["id"]

    with patch(
        "app.features.game.flavor.regenerate_flavor",
        side_effect=FlavorUnavailable("no key"),
    ):
        res = client.post(f"/api/v1/game/cards/{card_id}/flavor")

    assert res.status_code == 503
