"""Turns a conversation transcript into the structured summary the UI renders.

Ported from the TEST_stt prototype (llm/summarize.py). Two things changed on the way
in: the API key now comes from app.config instead of a feature-local .env, and the
"who am I talking to" context is read from the contacts tables rather than a
standalone SQLite file.

The provider swap point is _call_llm() and nothing else — moving to Claude or Groq
means rewriting that one function while the prompt, schema, cache and retry loop stay
as they are.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v2"  # bump when the prompt changes — it invalidates the cache
MAX_RETRY = 3

# Prompt tuning burns through the free tier fast, so an identical prompt is answered
# from disk instead of the API.
CACHE_DIR = Path(__file__).resolve().parents[3] / ".cache" / "summaries"


# ─────────────────────────────────────────────────────────────
# Output schema — the model is forced to answer in exactly this shape
# ─────────────────────────────────────────────────────────────

SCHEMA = {
    "type": "object",
    "properties": {
        "one_line": {
            "type": "string",
            "description": "대화 전체를 한 문장으로. 40자 내외.",
        },
        "key_points": {
            "type": "array",
            "items": {"type": "string"},
            "description": "핵심 내용 3~5개. 각 한 문장.",
        },
        "mentioned_people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "relation": {
                        "type": "string",
                        "description": "대화 상대와 이 사람의 관계. 예: 같은 팀 후배, 전 직장 동료",
                    },
                    "confidence": {
                        "type": "number",
                        "description": "0.0~1.0. 이름을 정확히 들었는지에 대한 확신도.",
                    },
                },
                "required": ["name", "relation", "confidence"],
            },
            "description": "대화에 등장한 제3의 인물. 관계 그래프 엣지 후보가 된다.",
        },
        "keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": "태그로 쓸 키워드 3~6개.",
        },
    },
    "required": [
        "one_line",
        "key_points",
        "mentioned_people",
        "keywords",
    ],
}


SYSTEM_INSTRUCTION = """\
너는 비즈니스 대화 기록을 정리하는 어시스턴트다.
사용자가 방금 만난 사람과 나눈 대화의 음성 인식 결과를 받는다.

지켜야 할 것:
· 대화에 실제로 나온 내용만 쓴다. 추측하거나 보강하지 않는다.
· 음성 인식 오류로 깨진 단어는 문맥으로 판단하되, 확신이 없으면 빼라.
· 사람 이름은 특히 잘못 인식되기 쉽다. confidence를 정직하게 매겨라.
· 한국어로 쓴다. 존댓말 말고 간결한 개조식으로.
"""


def build_prompt(transcript: str, person: dict | None, history: list[str] | None) -> str:
    """Who it was and what was said last time is what makes next_hints worth reading."""
    parts: list[str] = []

    if person:
        parts.append(
            "[상대 정보]\n"
            f"이름: {person.get('name', '(모름)')}\n"
            f"소속: {person.get('company', '(모름)')} / {person.get('title', '(모름)')}\n"
            f"만난 횟수: {person.get('meet_count', '?')}회"
        )

    if history:
        parts.append("[이전 대화 요약]\n" + "\n".join(f"· {h}" for h in history))

    parts.append("[이번 대화 전문]\n" + transcript)
    return "\n\n".join(parts)


# ─────────────────────────────────────────────────────────────
# Cache
# ─────────────────────────────────────────────────────────────


def _cache_key(prompt: str) -> str:
    raw = f"{settings.gemini_model}|{PROMPT_VERSION}|{prompt}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _cache_load(key: str) -> dict | None:
    path = CACHE_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _cache_save(key: str, value: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"{key}.json").write_text(
        json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ─────────────────────────────────────────────────────────────
# ★ Provider swap point — rewriting this function is the whole migration
# ─────────────────────────────────────────────────────────────

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY가 설정되지 않았습니다. "
                "backend/.env 에 GEMINI_API_KEY=발급받은_키 를 추가하세요. "
                "키 발급: https://aistudio.google.com/apikey"
            )
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _call_llm(prompt: str) -> str:
    response = _get_client().models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=SCHEMA,
            temperature=0.2,  # summaries don't need creativity — pin it low
        ),
    )
    return response.text


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────


def summarize(
    transcript: str,
    person: dict | None = None,
    history: list[str] | None = None,
    use_cache: bool = True,
) -> dict:
    """Blocking call — the router hands this to a threadpool."""
    prompt = build_prompt(transcript, person, history)
    key = _cache_key(prompt)

    if use_cache and (hit := _cache_load(key)) is not None:
        logger.info("summary cache hit (%s) — no API call", key)
        return hit

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            result = json.loads(_call_llm(prompt))
            if use_cache:
                _cache_save(key, result)
            return result
        except json.JSONDecodeError as e:
            last_error = e
            logger.warning("summary JSON parse failed (%s/%s) — retrying", attempt, MAX_RETRY)
        except Exception as e:  # noqa: BLE001 — retry rate limits and transient errors alike
            last_error = e
            wait = 2**attempt
            logger.warning(
                "summary call failed (%s/%s): %s — retrying in %ss", attempt, MAX_RETRY, e, wait
            )
            time.sleep(wait)

    raise RuntimeError(f"요약에 {MAX_RETRY}번 실패했습니다: {last_error}")
