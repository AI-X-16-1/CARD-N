from fastapi.testclient import TestClient

from app import main
from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_a_failed_warmup_does_not_stop_the_server(monkeypatch) -> None:
    """Warming up is an optimisation; the server has to come up either way.

    A teammate on an empty model cache downloads ~1.6GB during startup, and a network
    that drops halfway through used to leave the whole backend refusing to boot — with
    contacts, graph and game unreachable over a model none of them use.

    `TestClient` only runs the lifespan when used as a context manager, which is why
    the other tests in this suite never load a model.
    """

    def explode() -> None:
        raise OSError("could not download model weights")

    monkeypatch.setattr(main, "warmup_ocr", lambda: None)
    monkeypatch.setattr(main, "warmup_stt", explode)

    with TestClient(app) as started:
        assert started.get("/health").status_code == 200
