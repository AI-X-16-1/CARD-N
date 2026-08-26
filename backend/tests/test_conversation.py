"""Conversation feature: the save / read-back / re-save path.

STT and the LLM call are deliberately not exercised here — both reach outside the
process (model weights, Gemini). What is worth pinning down is everything around them:
that a summary lands on the right contact, that re-summarizing the same recording
updates in place instead of inflating the meeting count, and that the prompt context
the server assembles reflects that.
"""

from fastapi.testclient import TestClient

from app.features.conversation import models  # noqa: F401  registers the table on Base.metadata

SUMMARY = {
    "one_line": "온보딩 개편 초안 공유 및 11월 배포 일정 논의",
    "key_points": ["본인 인증 단계를 3단계에서 1단계로 축소", "11월 초 배포 목표"],
    "action_items": [
        {"content": "피그마 링크 정리해서 보내기", "due_date": "", "owner": "them"},
        {"content": "내부 리뷰 일정 잡기", "due_date": "2026-09-01", "owner": "me"},
    ],
    "mentioned_people": [{"name": "박준호", "relation": "개발 담당 연구원", "confidence": 0.95}],
    "next_hints": ["법무 검토 결과 확인"],
    "keywords": ["온보딩", "피그마"],
}


def _create_person(client: TestClient, name: str = "김서연") -> int:
    res = client.post("/api/v1/contacts", json={"name": name, "company": "토스"})
    assert res.status_code == 201
    return res.json()["id"]


def test_ping(client: TestClient) -> None:
    res = client.get("/api/v1/conversations/ping")
    assert res.status_code == 200
    assert res.json() == {"feature": "conversation", "status": "ok"}


def test_save_and_list(client: TestClient) -> None:
    person_id = _create_person(client)

    res = client.post(
        "/api/v1/conversations",
        json={
            "person_id": person_id,
            "transcript": "안녕하세요, 온보딩 개편 건으로 뵙습니다.",
            "summary": SUMMARY,
            "duration_seconds": 372,
        },
    )
    assert res.status_code == 201
    saved = res.json()
    assert saved["person_id"] == person_id
    assert saved["one_liner"] == SUMMARY["one_line"]
    assert saved["summary"]["action_items"][1]["owner"] == "me"
    assert saved["duration_seconds"] == 372

    listed = client.get("/api/v1/conversations", params={"person_id": person_id}).json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == saved["id"]

    # Saving bumps the contact's last_contact so timelines order correctly.
    person = client.get(f"/api/v1/contacts/{person_id}").json()
    assert person["last_contact"] is not None


def test_resaving_the_same_recording_updates_in_place(client: TestClient) -> None:
    person_id = _create_person(client)
    transcript = "같은 녹음을 두 번 요약하는 경우."

    first = client.post(
        "/api/v1/conversations",
        json={"person_id": person_id, "transcript": transcript, "summary": SUMMARY},
    ).json()

    revised = {**SUMMARY, "one_line": "다시 요약한 한 줄"}
    second = client.post(
        "/api/v1/conversations",
        json={"person_id": person_id, "transcript": transcript, "summary": revised},
    ).json()

    assert second["id"] == first["id"]
    assert second["one_liner"] == "다시 요약한 한 줄"

    listed = client.get("/api/v1/conversations", params={"person_id": person_id}).json()
    assert listed["total"] == 1, "the same recording must not count as a second meeting"


def test_different_recordings_stack_up(client: TestClient) -> None:
    person_id = _create_person(client)

    for text in ("첫 번째 대화입니다.", "두 번째 대화입니다."):
        client.post(
            "/api/v1/conversations",
            json={"person_id": person_id, "transcript": text, "summary": SUMMARY},
        )

    listed = client.get("/api/v1/conversations", params={"person_id": person_id}).json()
    assert listed["total"] == 2


def test_delete(client: TestClient) -> None:
    person_id = _create_person(client)
    saved = client.post(
        "/api/v1/conversations",
        json={"person_id": person_id, "transcript": "지울 대화", "summary": SUMMARY},
    ).json()

    assert client.delete(f"/api/v1/conversations/{saved['id']}").status_code == 204
    assert client.get("/api/v1/conversations", params={"person_id": person_id}).json()["total"] == 0
    assert client.delete(f"/api/v1/conversations/{saved['id']}").status_code == 404


def test_unknown_person_is_404(client: TestClient) -> None:
    res = client.post(
        "/api/v1/conversations",
        json={"person_id": 9999, "transcript": "없는 사람", "summary": SUMMARY},
    )
    assert res.status_code == 404

    assert client.get("/api/v1/conversations", params={"person_id": 9999}).status_code == 404


def test_summarize_rejects_empty_transcript(client: TestClient) -> None:
    res = client.post("/api/v1/conversations/summarize", json={"transcript": "   "})
    assert res.status_code == 400
