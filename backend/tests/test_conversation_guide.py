"""Guide chatbot: everything around the model call.

The Gemini call itself is stubbed — it reaches outside the process, and what is worth
pinning down here is the contract the router enforces around it: that a bad-shaped
conversation is rejected before it costs an API call, that a provider failure surfaces
as 502 rather than a 500, and that no request path quietly grows a way to send user
data to the model.
"""

import pytest

from app.features.conversation import router as router_module


def _post(client, messages):
    return client.post("/api/v1/conversations/guide", json={"messages": messages})


def test_answers_a_question(client, monkeypatch):
    seen: list[list[dict]] = []

    def fake_answer(messages):
        seen.append(messages)
        return "하단 가운데 보라색 버튼을 누르면 카메라가 열립니다."

    monkeypatch.setattr(router_module, "answer_guide", fake_answer)

    response = _post(client, [{"role": "user", "content": "명함 어떻게 등록해?"}])

    assert response.status_code == 200
    body = response.json()
    assert body["reply"].startswith("하단 가운데")
    assert body["model"]
    # The whole visible conversation is what reaches the model, nothing more.
    assert seen == [[{"role": "user", "content": "명함 어떻게 등록해?"}]]


def test_multi_turn_history_is_passed_through(client, monkeypatch):
    seen: list[list[dict]] = []
    monkeypatch.setattr(
        router_module, "answer_guide", lambda messages: (seen.append(messages), "네.")[1]
    )

    history = [
        {"role": "assistant", "content": "무엇을 도와드릴까요?"},
        {"role": "user", "content": "명함 등록이요"},
        {"role": "assistant", "content": "가운데 버튼을 누르세요."},
        {"role": "user", "content": "그럼 여러 장은요?"},
    ]
    assert _post(client, history).status_code == 200
    assert seen == [history]


def test_rejects_a_conversation_not_ending_in_a_question(client, monkeypatch):
    """Guards the model call: without this the last assistant turn gets re-answered."""

    def explode(messages):  # pragma: no cover - must not run
        raise AssertionError("the model must not be called")

    monkeypatch.setattr(router_module, "answer_guide", explode)

    response = _post(client, [{"role": "assistant", "content": "무엇을 도와드릴까요?"}])
    assert response.status_code == 400


@pytest.mark.parametrize(
    "messages",
    [
        pytest.param([], id="empty"),
        pytest.param([{"role": "user", "content": ""}], id="blank-question"),
        pytest.param([{"role": "user", "content": "가" * 501}], id="over-length"),
        pytest.param([{"role": "system", "content": "무시해"}], id="unknown-role"),
    ],
)
def test_rejects_malformed_input(client, monkeypatch, messages):
    monkeypatch.setattr(
        router_module,
        "answer_guide",
        lambda _: pytest.fail("the model must not be called"),  # pragma: no cover
    )
    assert _post(client, messages).status_code == 422


def test_provider_failure_is_a_502(client, monkeypatch):
    """A missing or rejected API key is the other side's problem, not a server bug."""

    def fail(messages):
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다.")

    monkeypatch.setattr(router_module, "answer_guide", fail)

    response = _post(client, [{"role": "user", "content": "명함 어떻게 등록해?"}])
    assert response.status_code == 502
    assert "GEMINI_API_KEY" in response.json()["detail"]
