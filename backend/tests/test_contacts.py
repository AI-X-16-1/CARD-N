import pytest
from fastapi.testclient import TestClient

from app.core import image_store


def _create_person(client: TestClient, **overrides) -> dict:
    payload = {
        "name": "Hong Gil-dong",
        "company": "Kakao",
        "department": "Marketing Team",
        "title": "Manager",
        "phone": "010-1234-5678",
        "email": "hong@kakao.com",
        "job_class": "marketing",
        "relation": "client",
        "context": "AI conference",
    }
    payload.update(overrides)
    response = client.post("/api/v1/contacts", json=payload)
    assert response.status_code == 201
    return response.json()


def test_create_and_get_contact(client: TestClient) -> None:
    created = _create_person(client)
    assert created["name"] == "Hong Gil-dong"
    assert created["conversation_count"] == 0

    response = client.get(f"/api/v1/contacts/{created['id']}")
    assert response.status_code == 200
    assert response.json()["email"] == "hong@kakao.com"


def test_list_contacts_filters_by_search_and_category(client: TestClient) -> None:
    _create_person(client, name="Hong Gil-dong", company="Kakao", relation="client")
    _create_person(client, name="Kim Cheol-su", company="Naver", relation="partner")

    response = client.get("/api/v1/contacts", params={"q": "Hong"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Hong Gil-dong"

    response = client.get("/api/v1/contacts", params={"category": "partner"})
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Kim Cheol-su"


def test_update_contact(client: TestClient) -> None:
    created = _create_person(client)

    response = client.put(f"/api/v1/contacts/{created['id']}", json={"title": "Director"})
    assert response.status_code == 200
    assert response.json()["title"] == "Director"
    assert response.json()["name"] == "Hong Gil-dong"


def test_delete_contact(client: TestClient) -> None:
    created = _create_person(client)

    response = client.delete(f"/api/v1/contacts/{created['id']}")
    assert response.status_code == 204

    response = client.get(f"/api/v1/contacts/{created['id']}")
    assert response.status_code == 404


def test_get_and_update_my_card(client: TestClient) -> None:
    response = client.get("/api/v1/contacts/me")
    assert response.status_code == 200
    assert response.json()["name"] == ""

    response = client.put(
        "/api/v1/contacts/me",
        json={
            "name": "Kang Min-gu",
            "company": "CARD:N",
            "department": "Engineering",
            "grade": "Backend",
            "job_function": "Server",
            "address": "Seoul",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Kang Min-gu"
    assert body["department"] == "Engineering"
    assert body["grade"] == "Backend"
    assert body["job_function"] == "Server"
    assert body["address"] == "Seoul"


@pytest.fixture()
def isolated_image_store(tmp_path, monkeypatch) -> None:
    # Redirects app.core.image_store's directories to a per-test tmp_path instead of
    # the real backend/storage/ — these tests exercise real file I/O (not mocked), and
    # shouldn't read/write dev-machine state or leave files behind across runs.
    monkeypatch.setattr(image_store, "STAGING_DIR", tmp_path / "staging")
    monkeypatch.setattr(image_store, "PERSONS_DIR", tmp_path / "persons")


def test_contact_without_scan_has_no_image(client: TestClient) -> None:
    created = _create_person(client)
    assert created["has_image"] is False

    response = client.get(f"/api/v1/contacts/{created['id']}/image")
    assert response.status_code == 404


def test_contact_claims_staged_scan_image(client: TestClient, isolated_image_store) -> None:
    token = image_store.stage_image(b"fake-jpeg-bytes")
    created = _create_person(client, image_token=token)
    assert created["has_image"] is True

    response = client.get(f"/api/v1/contacts/{created['id']}/image")
    assert response.status_code == 200
    assert response.content == b"fake-jpeg-bytes"


def test_contact_ignores_unknown_image_token(client: TestClient, isolated_image_store) -> None:
    # A stale/replayed token (staged file already claimed, or never existed) must not
    # fail contact creation over a missing picture.
    created = _create_person(client, image_token="not-a-real-token")
    assert created["has_image"] is False
