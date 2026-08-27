"""The in-app guide chatbot — answers "how do I use CARD:N" in free-form Korean.

Deliberately narrower than it looks: the model is told what the app's screens and
flows are (KNOWLEDGE below) and told to refuse anything outside that. It never reads
contacts, conversations or the graph, so a wrong answer can misinform but cannot leak
someone's data.

The Gemini client is set up here rather than shared with summarizer.py on purpose.
That module is the summary pipeline's provider swap point and carries a cache, a
response schema and a retry loop tuned for one long structured call; this is a short
chat turn with none of that. Merging them would couple two things that only happen to
use the same vendor today.
"""

from __future__ import annotations

import logging
import time

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

MAX_RETRY = 3
RETRYABLE_STATUS = {429}  # same reasoning as summarizer.py — only the quota resets

# A guide answer that runs long stops being a guide. Gemini counts tokens, not
# characters, and Korean runs ~1.5 chars/token, so this is a soft ceiling rather than
# an exact one — the prompt asks for brevity too.
MAX_OUTPUT_TOKENS = 600

# Enough turns to follow up ("그럼 그건 어디 있어?") without letting a long session grow
# the prompt without limit.
MAX_HISTORY_TURNS = 12
MAX_MESSAGE_CHARS = 500


class GuideUnavailable(RuntimeError):
    """A failure retrying cannot fix — bad configuration, not a bad moment."""


# ─────────────────────────────────────────────────────────────
# What the bot is allowed to know
# ─────────────────────────────────────────────────────────────

# Kept in sync with docs/ui-spec.md by hand. It is a summary, not a copy: the bot needs
# to know a screen exists and how to reach it, not every chip and caption on it.
KNOWLEDGE = """\
[CARD:N이 어떤 앱인지]
명함 한 장에서 N개의 관계로 — 명함을 찍어 사람을 등록하고, 그 사람과 나눈 대화를
녹음해 요약하고, 그렇게 쌓인 관계를 그래프로 보고, 카드 배틀 게임까지 하는 앱.

[하단 탭 5개]
· 홈 — 내 디지털 명함, 최근 추가된 사람 목록
· 목록 — 등록한 사람 전체.
        검색창은 이름과 회사 이름으로만 찾는다. 직함이나 직군으로는 검색되지 않는다.
        카테고리 칩(전체/클라이언트/파트너/네트워킹/그 외)으로 관계별로 거를 수 있다.
        행을 길게 누르면 삭제.
· 가운데 보라색 동그란 버튼 — 명함 스캔 (카메라)
· 관계도 — 사람들을 노드로 그린 관계 그래프
· 게임 — 카드 배틀

[명함 등록하는 법]
1. 하단 가운데 보라색 버튼을 누르면 카메라가 열린다.
2. 명함을 찍으면 이름·회사·부서·직함·전화·이메일을 자동으로 읽는다.
3. 인식 결과 화면에서 틀린 글자를 고칠 수 있다. 여기서 고치고 저장한다.
4. 저장하면 그 사람의 배틀 카드가 만들어지는 연출이 나온다.
· 여러 장을 연속으로 찍는 배치 모드도 있다.
· 명함이 없거나 인식이 안 되면 직접 입력으로 등록할 수 있다.

[대화 녹음하고 요약하는 법]
1. 목록이나 홈에서 사람을 눌러 상세 화면으로 간다.
2. 오른쪽 아래 + 버튼을 누르면 '녹음'과 '녹음 파일 업로드' 중 고를 수 있다.
3. 녹음을 마치거나 파일을 올리면 음성 인식(STT)이 돌아 대화 전문이 나온다.
4. 전문을 확인하고 요약을 요청하면 한 줄 요약, 핵심 내용, 대화에 나온 다른 사람,
   키워드가 정리된다.
5. 저장하면 그 사람의 대화 기록에 쌓이고, 대화에 나온 사람은 관계도에 반영된다.
· 녹음 중에 홈 탭을 눌러도 녹음은 날아가지 않는다.
· 통화 녹음 파일을 찾아서 가져오는 기능도 상세 화면에 있다.

[관계도 보는 법]
· 관계도 탭. 사람이 노드, 관계가 선으로 그려진다.
· 검색과 필터로 특정 사람만 볼 수 있다.
· 노드를 누르면 아래에서 그 사람 정보가 올라온다.
· 종 모양 아이콘에서 소개 요청을 주고받을 수 있다.

[게임]
· 게임 탭. 등록한 사람들이 카드가 되고, 덱을 짜서 배틀한다.
· 카드의 등급과 능력치는 그 사람의 직함과 직군으로 정해진다.

[사람 상세 화면에 있는 것]
연락처 정보, 배틀 카드 미리보기, 통화 녹음 찾기, 지금까지의 대화 기록 타임라인,
그리고 오른쪽 아래 + 버튼.
"""


SYSTEM_INSTRUCTION = f"""\
너는 CARD:N 앱 안에 들어 있는 사용법 안내 도우미다.
앱을 처음 쓰는 사람에게 "이거 어디서 해요?"를 알려주는 게 유일한 일이다.

{KNOWLEDGE}

지켜야 할 것:
· 위에 적힌 내용만 답한다. 없는 기능을 지어내지 않는다.
· 모르면 "그건 제가 안내할 수 있는 범위를 벗어나요"라고 솔직히 말한다.
· 어디를 눌러야 하는지를 구체적으로 말한다. "설정에서 하세요" 같은 답은 쓸모없다.
· 짧게 쓴다. 3~4문장, 길어도 단계 나열 5줄을 넘기지 않는다.
· 한국어 존댓말. 이모지는 쓰지 않는다.
· 사용자의 연락처·대화 내용은 너에게 주어지지 않는다. "제 인맥 중에 개발자 누구
  있어?" 같은 질문에는 답할 수 없다고 말하고, 대신 목록 탭에서 직접 찾는 법을 알려준다.
· 앱과 무관한 질문(번역, 코딩, 잡담)에는 답하지 않고 앱 사용법으로 돌아온다.
"""


# ─────────────────────────────────────────────────────────────
# Gemini call
# ─────────────────────────────────────────────────────────────

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise GuideUnavailable(
                "GEMINI_API_KEY가 설정되지 않았습니다. "
                "backend/.env 에 GEMINI_API_KEY=발급받은_키 를 추가하세요. "
                "키 발급: https://aistudio.google.com/apikey"
            )
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _to_contents(messages: list[dict]) -> list[types.Content]:
    """History in the shape Gemini wants. 'assistant' is called 'model' there."""
    return [
        types.Content(
            role="model" if m["role"] == "assistant" else "user",
            parts=[types.Part(text=m["content"])],
        )
        for m in messages
    ]


def _call_llm(messages: list[dict]) -> str:
    response = _get_client().models.generate_content(
        model=settings.gemini_model,
        contents=_to_contents(messages),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.3,  # a guide should answer the same question the same way
            max_output_tokens=MAX_OUTPUT_TOKENS,
        ),
    )
    return (response.text or "").strip()


def _permanent(error: Exception) -> GuideUnavailable | None:
    """The error to raise straight through, or None if another attempt might work."""
    if isinstance(error, GuideUnavailable):
        return error
    if isinstance(error, genai_errors.ClientError) and error.code not in RETRYABLE_STATUS:
        return GuideUnavailable(
            f"Gemini가 요청을 거부했습니다 ({error}). "
            "backend/.env 의 GEMINI_API_KEY 와 GEMINI_MODEL 을 확인해 주세요."
        )
    return None


def answer(messages: list[dict]) -> str:
    """Blocking call — the router hands this to a threadpool.

    `messages` is the whole visible conversation, oldest first, ending with the user's
    new question. Only the last MAX_HISTORY_TURNS are sent.
    """
    trimmed = messages[-MAX_HISTORY_TURNS:]

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            reply = _call_llm(trimmed)
            if not reply:
                # An empty body is usually a safety block or a max_output_tokens cut.
                # Retrying the identical prompt would land the same way.
                raise GuideUnavailable(
                    "Gemini가 빈 답변을 돌려줬습니다. 질문을 바꿔서 다시 물어봐 주세요."
                )
            return reply
        except Exception as e:
            if (permanent := _permanent(e)) is not None:
                logger.error("guide call failed permanently, not retrying: %s", e)
                raise permanent from e
            last_error = e
            wait = 2**attempt
            logger.warning(
                "guide call failed (%s/%s): %s — retrying in %ss", attempt, MAX_RETRY, e, wait
            )
            time.sleep(wait)

    raise RuntimeError(f"답변 생성에 {MAX_RETRY}번 실패했습니다: {last_error}")
