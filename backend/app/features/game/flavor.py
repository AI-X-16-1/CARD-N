"""Regenerate a battle card's flavor line with the LLM.

Same provider (Gemini) and same swap-point shape as
``app/features/conversation/summarizer.py`` — the one function that talks to the
model is ``_call_llm``; everything else is plain string work.
"""

from __future__ import annotations

import logging

from google import genai

from app.config import settings

logger = logging.getLogger(__name__)


class FlavorUnavailable(RuntimeError):
    """LLM misconfigured or unreachable — the caller should surface a 503."""


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise FlavorUnavailable("gemini_api_key is not set")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def _build_prompt(card: dict) -> str:
    return (
        "너는 명함 배틀 카드 게임의 카피라이터다. "
        "아래 인물 카드에 어울리는 한국어 플레이버 문구를 한 줄로 새로 지어라. "
        "20자 내외, 따옴표 없이, 직업의 개성을 위트있게 담아라.\n"
        f"- 이름: {card['name']}\n"
        f"- 회사: {card.get('company') or '미상'}\n"
        f"- 직군: {card['job_label']} (★{card['grade']} {card['grade_label']})\n"
        "플레이버 문구:"
    )


def _call_llm(prompt: str) -> str:
    response = _get_client().models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
    )
    return (response.text or "").strip()


def regenerate_flavor(card: dict) -> str:
    """Return a fresh one-line flavor for ``card``; raise FlavorUnavailable on failure."""
    try:
        text = _call_llm(_build_prompt(card))
    except FlavorUnavailable:
        raise
    except Exception as exc:  # any model/transport error becomes a 503 for the caller
        logger.warning("flavor regeneration failed: %s", exc)
        raise FlavorUnavailable(str(exc)) from exc

    text = text.splitlines()[0].strip().strip("\"'") if text else ""
    if not text:
        raise FlavorUnavailable("model returned an empty flavor line")
    return text[:120]
