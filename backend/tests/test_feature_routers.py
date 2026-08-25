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
