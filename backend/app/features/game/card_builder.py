"""Turns a contact (``persons`` row) into a battle-card snapshot.

This is a hand port of ``frontend/src/features/game/engine/cardData.ts`` plus the
grade-from-title mapping (which the frontend fakes randomly in mockCollection).
The two runtimes cannot share code, so the numbers are duplicated on purpose —
keep this file and ``cardData.ts`` / ``docs/game-rules.md`` in sync.
"""

from __future__ import annotations

import math

# --- Static per-role data (docs/game-rules.md) -----------------------------

JOB_CLASSES: tuple[str, ...] = (
    "dev",
    "design",
    "hr",
    "finance",
    "legal",
    "marketing",
    "sales",
    "pm",
)

BASE_STATS: dict[str, dict[str, int]] = {
    "dev": {"atk": 7, "def": 3, "int": 7, "hp": 8},
    "design": {"atk": 4, "def": 5, "int": 9, "hp": 8},
    "hr": {"atk": 4, "def": 5, "int": 6, "hp": 10},
    "finance": {"atk": 4, "def": 9, "int": 6, "hp": 8},
    "legal": {"atk": 6, "def": 8, "int": 7, "hp": 6},
    "marketing": {"atk": 7, "def": 3, "int": 6, "hp": 10},
    "sales": {"atk": 9, "def": 3, "int": 4, "hp": 10},
    "pm": {"atk": 6, "def": 6, "int": 6, "hp": 10},
}

JOB_LABEL: dict[str, str] = {
    "dev": "개발팀",
    "design": "디자이너",
    "hr": "인사팀",
    "finance": "재무팀",
    "legal": "법무팀",
    "marketing": "마케팅팀",
    "sales": "영업팀",
    "pm": "기획/PM",
}

SKILL: dict[str, dict[str, object]] = {
    "dev": {"name": "핫픽스", "cost": 2, "description": "아군 전체 HP + ceil(INT/2) 회복"},
    "design": {
        "name": "UI 개편",
        "cost": 2,
        "description": "적 필드에서 ATK가 가장 높은 카드의 ATK를 ceil(INT/2)만큼 감소",
    },
    "hr": {
        "name": "복지 포인트",
        "cost": 2,
        "description": "아군 전체 최대 HP +2 & 2 회복, 카드 1장 드로우",
    },
    "finance": {"name": "긴축 예산", "cost": 2, "description": "아군 전체 DEF +3 (영구)"},
    "legal": {"name": "소송", "cost": 3, "description": "적 히어로에게 INT만큼 직접 피해"},
    "marketing": {"name": "캠페인", "cost": 2, "description": "아군 전체 ATK +2 (영구)"},
    "sales": {"name": "콜드콜", "cost": 3, "description": "적 필드의 무작위 카드에게 INT+3 피해"},
    "pm": {"name": "로드맵", "cost": 2, "description": "카드 2장 드로우"},
}

PASSIVE: dict[str, str] = {
    "dev": "밤샘코딩",
    "design": "디테일광",
    "hr": "복지왕",
    "finance": "짠돌이",
    "legal": "빈틈없음",
    "marketing": "트렌드세터",
    "sales": "영업왕",
    "pm": "일정관리",
}

FLAVOR_TEXT: dict[str, str] = {
    "dev": "오늘도 야근, 그래도 코드는 돌아간다",
    "design": "픽셀 1개도 그냥 넘어가지 않는다",
    "hr": "연차는 아끼는 게 아니라 쓰는 것",
    "finance": "엑셀 한 줄로 예산을 지킨다",
    "legal": "계약서 한 줄 한 줄이 무기",
    "marketing": "트렌드는 내가 만든다",
    "sales": "숫자로 증명하는 사람",
    "pm": "일정표가 곧 인생",
}

# Grade & Multiplier by Position (docs/game-rules.md).
GRADE_TABLE: dict[int, dict[str, float]] = {
    1: {"cost": 1, "multiplier": 1.0},
    2: {"cost": 2, "multiplier": 1.1},
    3: {"cost": 3, "multiplier": 1.2},
    4: {"cost": 4, "multiplier": 1.35},
    5: {"cost": 5, "multiplier": 1.5},
    6: {"cost": 7, "multiplier": 1.7},
}

GRADE_LABEL: dict[int, str] = {
    1: "인턴",
    2: "사원",
    3: "대리/과장",
    4: "부장/팀장",
    5: "임원",
    6: "대표",
}

DEFAULT_JOB_CLASS = "pm"
DEFAULT_GRADE = 1

# Seniority ladder, checked top (★6) down. First keyword hit wins; nothing
# matched -> DEFAULT_GRADE. Matching is case-insensitive substring.
_GRADE_KEYWORDS: list[tuple[int, tuple[str, ...]]] = [
    (6, ("대표", "사장", "회장", "총괄", "창업", "ceo", "founder", "president", "owner")),
    (
        5,
        (
            "부사장",
            "전무",
            "상무",
            "이사",
            "본부장",
            "실장",
            "cto",
            "cfo",
            "coo",
            "vp",
            "vice president",
            "director",
            "head of",
        ),
    ),
    (4, ("부장", "팀장", "파트장", "그룹장", "manager", "lead", "principal")),
    (3, ("차장", "과장", "대리", "선임", "책임", "senior", "staff engineer")),
    (2, ("사원", "주임", "전임", "associate", "junior", "member")),
    (1, ("인턴", "수습", "intern", "trainee")),
]


def resolve_job_class(job_class: str | None) -> str:
    """A contact's stored job_class if it is one of the 8, else the neutral pm."""
    return job_class if job_class in JOB_CLASSES else DEFAULT_JOB_CLASS


def grade_from_title(title: str | None) -> int:
    """Map a free-text job title onto a ★1–6 grade; ★1 when nothing matches."""
    if not title:
        return DEFAULT_GRADE
    haystack = title.casefold()
    for grade, keywords in _GRADE_KEYWORDS:
        if any(kw in haystack for kw in keywords):
            return grade
    return DEFAULT_GRADE


def scale_stats(base: dict[str, int], multiplier: float) -> dict[str, int]:
    """floor(base * multiplier) per stat — identical to the TS engine."""
    return {key: math.floor(value * multiplier) for key, value in base.items()}


def build_snapshot(person: object) -> dict[str, object]:
    """Column values for a ``battle_cards`` row derived from a Person."""
    job_class = resolve_job_class(getattr(person, "job_class", None))
    grade = grade_from_title(getattr(person, "title", None))
    base = BASE_STATS[job_class]
    row = GRADE_TABLE[grade]

    return {
        "person_id": person.id,
        "job_class": job_class,
        "grade": grade,
        "cost": int(row["cost"]),
        "base_stats": dict(base),
        "final_stats": scale_stats(base, row["multiplier"]),
        "skill": dict(SKILL[job_class]),
        "passive": PASSIVE[job_class],
        "flavor_text": FLAVOR_TEXT[job_class],
    }
