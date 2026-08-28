import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.mark.parametrize(
    "prefix,feature",
    [
        ("/api/v1/scan", "scan"),
        ("/api/v1/contacts", "contacts"),
        ("/api/v1/graph", "graph"),
        ("/api/v1/conversations", "conversation"),
        ("/api/v1/game", "game"),
    ],
)
def test_feature_ping(prefix: str, feature: str) -> None:
    response = client.get(f"{prefix}/ping")
    assert response.status_code == 200
    assert response.json() == {"feature": feature, "status": "ok"}


def test_introduction_request_routes_do_not_shadow_each_other() -> None:
    """GET /graph/introduction-requests is my inbox; GET /graph/{id}/introduction-requests
    is my outgoing request toward one person. They differ only in segment count, so pin
    that both stay reachable and neither swallows the other.
    """
    paths = app.openapi()["paths"]

    assert "get" in paths["/api/v1/graph/introduction-requests"]
    assert set(paths["/api/v1/graph/{person_id}/introduction-requests"]) == {"get", "post"}


def test_no_mutual_connections_endpoint() -> None:
    """Mutual connections were removed on privacy grounds: the list named people a
    contact knows without any of them consenting, which is what INTRO_CONSENT gates
    for 2nd-degree nodes. Pinned so it does not come back as a convenience.
    """
    assert "/api/v1/graph/{person_id}/mutual" not in app.openapi()["paths"]


def test_acquaintance_routes_do_not_shadow_each_other() -> None:
    """`/{person_id}/acquaintances` and `/acquaintances/{id}/consent` differ only in shape,
    and the second one's id is negative — pin that both stay reachable.
    """
    paths = app.openapi()["paths"]

    assert set(paths["/api/v1/graph/{person_id}/acquaintances"]) == {"get", "post"}
    assert "post" in paths["/api/v1/graph/acquaintances/{acquaintance_id}/consent"]
