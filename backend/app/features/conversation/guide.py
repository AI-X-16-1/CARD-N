"""The in-app guide chatbot — answers "how do I use CARD:N" from a fixed rule table.

No model call. The answers this bot gives are a closed set: the app has five tabs and a
handful of flows, and what to say about each one does not change between users or
between askings. Generating that text on every question spent free-tier Gemini quota to
re-derive a paragraph we already knew, and bought a chance of inventing a screen that
does not exist. A lookup costs nothing and cannot hallucinate.

What is given up is phrasing the bot has never seen. `_match` scores the user's last
question against each topic's keywords; anything that clears the threshold gets that
topic's answer verbatim, and anything that does not gets FALLBACK plus the list of
topics it can speak to. That is the whole design — an unmatched question is answered by
a menu, not by a guess.

The answers are written to the voice the model prompt used to ask for, since it is the
same bot: 합쇼체, no emoji, numbered steps for procedures the user follows in order,
plain sentences otherwise, five lines at most. Keep them in sync with docs/ui-spec.md,
and with what the code actually does when the two disagree.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Long questions are a sign of something this bot cannot answer anyway, but the cap is
# really here so that a client cannot post a novel. Imported by schemas.py.
MAX_MESSAGE_CHARS = 500

# A keyword that names a screen ("관계도") identifies a topic on its own; one that names a
# common action ("등록", "파일") only supports whichever topic it lands next to.
NAMING_WEIGHT = 2
SUPPORTING_WEIGHT = 1

# One naming keyword, or two supporting ones. Below this the question counts as
# unrecognised — answering it off a single generic verb is how a guide starts handing
# out wrong directions.
MATCH_THRESHOLD = 2


@dataclass(frozen=True)
class Topic:
    """One question this bot can answer, and the words that mean the user asked it.

    No string in `naming` or `supporting` may be a substring of another in the same
    topic: both would match the same text and the topic would score itself twice.
    """

    id: str
    question: str  # canonical phrasing, offered as a chip when nothing matches
    naming: tuple[str, ...]
    supporting: tuple[str, ...]
    answer: str


# Order is the tie-break: the first topic holding the top score wins, so the specific
# ones ("여러 장 찍기") come before the general one ("명함 등록") they would tie with.
TOPICS: tuple[Topic, ...] = (
    Topic(
        id="overview",
        question="CARD:N은 어떤 앱인가요?",
        naming=("cardn", "무슨앱", "어떤앱", "뭐하는", "앱소개"),
        supporting=("처음", "뭐부터", "설명"),
        answer=(
            "CARD:N은 명함으로 사람을 등록하고, 그 사람과 나눈 대화를 녹음해 요약하고, "
            "그렇게 쌓인 관계를 그래프로 보고, 카드 배틀 게임까지 하는 앱입니다.\n"
            "하단 탭은 홈, 목록, 가운데 스캔 버튼, 관계도, 게임 다섯 개입니다."
        ),
    ),
    Topic(
        id="scan_batch",
        question="명함을 여러 장 연속으로 찍을 수 있나요?",
        naming=("여러장", "연속", "배치", "한번에"),
        supporting=("명함", "찍", "스캔"),
        answer=(
            "명함을 여러 장 연속으로 찍는 배치 모드가 스캔 화면에 있습니다.\n"
            "한 장씩 저장하지 않고 몰아서 찍은 뒤 결과를 한 번에 확인합니다."
        ),
    ),
    Topic(
        id="scan",
        question="명함은 어떻게 등록하나요?",
        naming=("명함", "스캔", "ocr"),
        supporting=("등록", "찍", "촬영", "카메라", "인식", "추가"),
        answer=(
            "1. 하단 가운데 보라색 동그란 버튼을 누르면 카메라가 열립니다.\n"
            "2. 명함을 찍으면 이름, 회사, 부서, 직함, 전화, 이메일을 자동으로 읽습니다.\n"
            "3. 인식 결과 화면에서 틀린 글자를 고친 뒤 저장합니다.\n"
            "4. 저장하면 그 사람의 배틀 카드가 만들어지는 연출이 나옵니다.\n"
            "명함이 없거나 인식이 안 되면 직접 입력으로 등록할 수 있습니다."
        ),
    ),
    Topic(
        id="record_leaving",
        question="녹음 중에 다른 탭을 눌러도 되나요?",
        naming=("다른탭", "홈탭", "백그라운드", "나가면", "꺼지"),
        supporting=("녹음", "중간", "날아", "괜찮"),
        answer=(
            "녹음 중에 홈 탭이나 다른 탭을 눌러도 녹음은 날아가지 않습니다.\n"
            "상세 화면으로 돌아오면 그대로 이어집니다."
        ),
    ),
    Topic(
        id="call_recording",
        question="통화 녹음 파일도 가져올 수 있나요?",
        naming=("통화",),
        supporting=("파일", "가져", "불러", "찾"),
        answer=(
            "사람 상세 화면에 통화 녹음 파일을 찾아서 가져오는 기능이 있습니다.\n"
            "가져온 파일도 직접 녹음한 것과 똑같이 음성 인식과 요약을 거칩니다."
        ),
    ),
    Topic(
        id="record",
        question="대화 녹음은 어디서 하나요?",
        naming=("녹음", "음성인식", "stt"),
        supporting=("대화", "시작", "어디서", "마이크", "업로드"),
        answer=(
            "1. 목록이나 홈에서 사람을 눌러 상세 화면으로 갑니다.\n"
            "2. 오른쪽 아래 + 버튼을 누르고 '녹음'과 '녹음 파일 업로드' 중 고릅니다.\n"
            "3. 녹음을 마치거나 파일을 올리면 음성 인식이 돌아 대화 전문이 나옵니다.\n"
            "4. 전문을 확인하고 요약을 요청한 뒤 저장하면 그 사람의 대화 기록에 쌓입니다."
        ),
    ),
    Topic(
        id="summary",
        question="대화 요약에는 뭐가 나오나요?",
        naming=("요약", "정리"),
        supporting=("전문", "키워드", "핵심", "한줄", "대화"),
        answer=(
            "대화 전문이 나온 화면에서 요약을 요청하면 한 줄 요약, 핵심 내용, "
            "대화에 나온 다른 사람, 키워드가 정리됩니다.\n"
            "저장하면 그 사람의 대화 기록에 쌓이고, 대화에 나온 사람은 관계도에 반영됩니다."
        ),
    ),
    Topic(
        id="introduction",
        question="소개 요청은 어떻게 보내나요?",
        naming=("소개",),
        supporting=("종", "요청", "알림", "부탁", "다리"),
        answer="관계도 탭의 종 모양 아이콘에서 소개 요청을 주고받을 수 있습니다.",
    ),
    Topic(
        id="graph",
        question="관계도는 뭘 보여주나요?",
        naming=("관계도", "그래프", "노드"),
        supporting=("연결", "한눈에", "지도"),
        answer=(
            "관계도 탭입니다. 사람이 노드, 관계가 선으로 그려집니다.\n"
            "검색과 필터로 특정 사람만 볼 수 있고, 노드를 누르면 아래에서 그 사람 "
            "정보가 올라옵니다."
        ),
    ),
    Topic(
        id="delete_person",
        question="등록한 사람을 어떻게 지우나요?",
        naming=("삭제", "지우", "지울", "없애"),
        supporting=("목록", "연락처", "사람"),
        answer="목록 탭에서 지울 사람의 행을 길게 누르면 삭제할 수 있습니다.",
    ),
    Topic(
        id="contacts",
        question="목록에서 사람은 어떻게 찾나요?",
        naming=("목록", "검색", "찾"),
        supporting=("이름", "회사", "필터", "카테고리", "칩", "분류"),
        answer=(
            "목록 탭에서 등록한 사람을 전부 봅니다.\n"
            "검색창은 이름과 회사 이름으로만 찾습니다. 직함이나 직군으로는 검색되지 "
            "않습니다.\n"
            "카테고리 칩(전체, 클라이언트, 파트너, 네트워킹, 그 외)으로 관계별로 거를 "
            "수 있습니다."
        ),
    ),
    Topic(
        id="game",
        question="게임은 어떻게 하나요?",
        naming=("게임", "배틀", "덱"),
        supporting=("카드", "등급", "능력치", "대전"),
        answer=(
            "게임 탭입니다. 등록한 사람들이 카드가 되고, 덱을 짜서 배틀합니다.\n"
            "카드의 등급과 능력치는 그 사람의 직함과 직군으로 정해집니다."
        ),
    ),
    Topic(
        id="person_detail",
        question="사람 상세 화면에는 뭐가 있나요?",
        naming=("상세", "프로필"),
        supporting=("화면", "사람", "정보", "뭐가"),
        answer=(
            "목록이나 홈에서 사람을 누르면 상세 화면이 열립니다.\n"
            "연락처 정보, 배틀 카드 미리보기, 통화 녹음 찾기, 지금까지의 대화 기록 "
            "타임라인이 있고, 오른쪽 아래 + 버튼으로 녹음을 시작합니다."
        ),
    ),
    Topic(
        # The bot is never given contacts, conversations or the graph, so this is not a
        # lookup it would do badly — it is one it cannot do at all. Say so, and hand the
        # user the screen that can.
        id="who_is_registered",
        question="누가 등록돼 있는지 알려줄 수 있나요?",
        naming=("인맥", "몇명", "등록된사람"),
        supporting=("누가", "누구", "있어", "알려", "중에"),
        answer=(
            "누가 등록돼 있는지는 확인해 드릴 수 없습니다.\n"
            "목록 탭에서 직접 찾아 주세요. 검색창은 이름과 회사 이름으로 찾고, "
            "카테고리 칩으로 관계별로 거를 수 있습니다."
        ),
    ),
)

# What to offer when nothing matched. Not every topic — a menu of fourteen is a wall of
# text; these five are the tabs everything else hangs off.
SUGGESTED_IDS = ("scan", "record", "graph", "contacts", "game")

FALLBACK = "그건 아직 안내해 드릴 수 없습니다.\n아래 주제는 안내해 드릴 수 있습니다."

# Korean spacing is inconsistent enough that "명함 등록" and "명함등록" have to look
# identical to the matcher, so spacing is dropped rather than normalised.
_NOISE = re.compile(r"[\s?!.,~…·:;\"'“”‘’()\[\]{}/\\-]+")


@dataclass(frozen=True)
class GuideAnswer:
    reply: str
    #: Topic questions to offer as chips. Empty when a topic matched.
    suggestions: tuple[str, ...] = ()


def _normalize(text: str) -> str:
    return _NOISE.sub("", text).lower()


def _score(topic: Topic, question: str) -> int:
    naming = sum(NAMING_WEIGHT for word in topic.naming if word in question)
    return naming + sum(SUPPORTING_WEIGHT for word in topic.supporting if word in question)


def _match(question: str) -> Topic | None:
    """The best-scoring topic, or None when nothing cleared MATCH_THRESHOLD."""
    normalized = _normalize(question)
    best: Topic | None = None
    best_score = MATCH_THRESHOLD - 1
    for topic in TOPICS:
        score = _score(topic, normalized)
        if score > best_score:  # strict, so a tie leaves the earlier topic in place
            best, best_score = topic, score
    return best


def suggestions() -> tuple[str, ...]:
    """The topic questions offered when the bot cannot match — also the greeting chips."""
    by_id = {topic.id: topic for topic in TOPICS}
    return tuple(by_id[topic_id].question for topic_id in SUGGESTED_IDS)


def answer(messages: list[dict]) -> GuideAnswer:
    """Answer the last question in `messages`.

    The whole visible conversation is accepted because that is the endpoint's contract
    and the router has already checked it ends with a user turn, but only that last turn
    decides the answer — a rule table has no way to use what came before it.
    """
    topic = _match(messages[-1]["content"])
    if topic is None:
        return GuideAnswer(reply=FALLBACK, suggestions=suggestions())
    return GuideAnswer(reply=topic.answer)
