"""Guide chatbot: the rule table, and the router around it.

There is no provider to stub any more — the endpoint is a lookup, so these run it for
real. What is worth pinning down is that the questions users actually type reach the
topic they mean, that the ones the bot has no business answering fall through to the
menu instead of being answered off one stray verb, and that no request path grows a way
to send user data anywhere.
"""

import pytest

from app.features.conversation.guide import (
    FALLBACK,
    SUGGESTED_IDS,
    TOPICS,
    _match,
    suggestions,
)


def _post(client, messages):
    return client.post("/api/v1/conversations/guide", json={"messages": messages})


def _topic(topic_id):
    return next(t for t in TOPICS if t.id == topic_id)


# ─────────────────────────────────────────────────────────────
# The rule table
# ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("명함 어떻게 등록해?", "scan"),
        ("명함 찍는 거 어케 함?", "scan"),
        ("명함등록", "scan"),  # Korean spacing is not reliable, so it is stripped
        ("명함 여러 장 한번에 찍고 싶어요", "scan_batch"),
        ("대화 녹음은 어디서 해요?", "record"),
        ("녹음 파일 업로드하고 싶은데", "record"),
        ("녹음 중에 다른 탭 눌러도 돼요?", "record_leaving"),
        ("통화 녹음 파일 가져올 수 있어?", "call_recording"),
        ("요약에는 뭐가 나와요?", "summary"),
        ("관계도는 뭘 보여주나요?", "graph"),
        ("소개 요청 어떻게 보내요", "introduction"),
        ("목록에서 사람 어떻게 찾아요", "contacts"),
        ("직함으로 검색돼요?", "contacts"),
        ("사람 삭제하고 싶어요", "delete_person"),
        ("등록한 사람 어떻게 지워요?", "delete_person"),
        ("연락처 지우고 싶어", "delete_person"),
        ("명함 삭제할래", "delete_person"),  # a deletion, not a scan
        ("대화 기록 삭제할 수 있어요?", "delete_conversation"),
        ("대화 삭제하고 싶어요", "delete_conversation"),
        ("녹음 기록 지우고 싶어", "delete_conversation"),
        ("요약 지울 수 있나요?", "delete_conversation"),
        ("게임 어떻게 해요?", "game"),
        ("덱은 어디서 짜요", "game"),
        ("상세 화면에 뭐가 있어요?", "person_detail"),
        ("이 앱 무슨 앱이야?", "overview"),
    ],
)
def test_a_question_reaches_the_topic_it_means(question, expected):
    matched = _match(question)
    assert matched is not None, f"{question!r} matched nothing"
    assert matched.id == expected


@pytest.mark.parametrize(
    "question",
    [
        pytest.param("비밀번호 바꾸고 싶은데", id="feature-we-do-not-have"),
        pytest.param("오늘 날씨 어때?", id="small-talk"),
        pytest.param("파이썬으로 퀵소트 짜줘", id="off-topic-task"),
        pytest.param("누가 만들었어요?", id="one-generic-word-is-not-enough"),
        pytest.param("삭제하고 싶어요", id="delete-what-exactly"),
        pytest.param("ㅁㄴㅇㄹ", id="gibberish"),
    ],
)
def test_an_unrecognised_question_matches_nothing(question):
    """The threshold earns its keep here: a near miss must fall through, not guess."""
    assert _match(question) is None


def test_asking_who_is_registered_is_declined_not_guessed():
    """The bot is never given contacts, so this is refused by rule, not by wording."""
    matched = _match("내 인맥 중에 개발자 누구 있어?")
    assert matched is not None and matched.id == "who_is_registered"
    assert "확인해 드릴 수 없습니다" in matched.answer
    assert "목록 탭" in matched.answer


def test_deleting_a_conversation_is_not_confused_with_deleting_a_person():
    """The two share every delete verb, so the noun is what has to tell them apart.

    Reported on #54 by the contacts owner: 대화 기록 삭제 used to land on delete_person,
    which sent people to long-press a row in 목록 — that deletes the person. Conversation
    summaries have their own 삭제 on each row of the timeline
    (features/contacts/components/ConversationTimeline.tsx).
    """
    conversation = _match("대화 기록 삭제할 수 있어요?")
    assert conversation is not None and conversation.id == "delete_conversation"
    assert "대화 기록" in conversation.answer
    assert "사람은 목록에 그대로" in conversation.answer

    person = _match("등록한 사람 어떻게 지워요?")
    assert person is not None and person.id == "delete_person"


def test_a_delete_topic_needs_a_delete_verb():
    """`requires` is what keeps these two early in the table without them stealing.

    They are declared before scan and contacts so they win the tie on 명함 삭제 and
    목록에서 삭제 — which is only safe because a question that never asked to delete
    anything cannot reach them at all.
    """
    for question, expected in [
        ("명함 어떻게 등록해?", "scan"),
        ("목록에서 사람 어떻게 찾아요", "contacts"),
        ("녹음 기록은 어디서 봐요?", "record"),
        ("요약에는 뭐가 나와요?", "summary"),
    ]:
        matched = _match(question)
        assert matched is not None and matched.id == expected, question


def test_no_keyword_is_a_substring_of_another_in_the_same_topic():
    """Both would match the same text and the topic would score itself twice."""
    for topic in TOPICS:
        words = topic.naming + topic.supporting
        overlaps = [(a, b) for a in words for b in words if a != b and a in b]
        assert not overlaps, f"{topic.id}: {overlaps}"


def test_suggested_ids_all_name_a_real_topic():
    known = {topic.id for topic in TOPICS}
    assert set(SUGGESTED_IDS) <= known
    assert len(suggestions()) == len(SUGGESTED_IDS)


# ─────────────────────────────────────────────────────────────
# The endpoint
# ─────────────────────────────────────────────────────────────


def test_answers_a_question(client):
    response = _post(client, [{"role": "user", "content": "명함 어떻게 등록해?"}])

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == _topic("scan").answer
    # A matched answer stands on its own; chips would only be noise under it.
    assert body["suggestions"] == []


def test_an_unanswerable_question_comes_back_as_a_menu(client):
    response = _post(client, [{"role": "user", "content": "비밀번호 바꾸고 싶은데"}])

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == FALLBACK
    assert body["suggestions"] == list(suggestions())


def test_only_the_last_turn_decides_the_answer(client):
    """History is accepted for the contract's sake, but a rule table cannot use it."""
    history = [
        {"role": "assistant", "content": "무엇을 도와드릴까요?"},
        {"role": "user", "content": "명함 등록이요"},
        {"role": "assistant", "content": "가운데 버튼을 누르세요."},
        {"role": "user", "content": "게임은 어떻게 해요?"},
    ]
    response = _post(client, history)

    assert response.status_code == 200
    assert response.json()["reply"] == _topic("game").answer


def test_rejects_a_conversation_not_ending_in_a_question(client):
    """Without this the last assistant turn gets fed to the matcher as a question."""
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
def test_rejects_malformed_input(client, messages):
    assert _post(client, messages).status_code == 422
