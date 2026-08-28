import asyncio

import httpx
import pytest

from cardcreate.client import ComfyUIClient, ComfyUIGenerationError
from cardcreate.config import ComfyUISettings


def _client_with_history(monkeypatch, history_payload: dict) -> ComfyUIClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=history_payload)

    real = httpx.AsyncClient

    def fake(*args, **kwargs):
        kwargs.pop("base_url", None)
        return real(
            *args, base_url="http://comfy.test", transport=httpx.MockTransport(handler), **kwargs
        )

    monkeypatch.setattr("cardcreate.client.httpx.AsyncClient", fake)
    return ComfyUIClient(ComfyUISettings(request_timeout_seconds=1, poll_interval_seconds=0.01))


def test_wait_for_image_fails_fast_when_comfyui_reports_an_error(monkeypatch) -> None:
    client = _client_with_history(
        monkeypatch,
        {
            "pid": {
                "status": {"status_str": "error", "messages": [["execution_error", {"m": "OOM"}]]},
                "outputs": {},
            }
        },
    )

    with pytest.raises(ComfyUIGenerationError, match="failed to run prompt"):
        asyncio.run(client.wait_for_image("pid"))
