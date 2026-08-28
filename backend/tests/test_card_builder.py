"""Unit tests for the card-generation derivation (app/features/game/card_builder.py)."""

import math

import pytest

from app.features.game.card_builder import (
    BASE_STATS,
    GRADE_TABLE,
    build_snapshot,
    grade_from_title,
    resolve_job_class,
    scale_stats,
)


class _Person:
    """Minimal stand-in for the Person model — build_snapshot only reads these."""

    def __init__(self, id=1, name="홍길동", company="카카오", job_class="marketing", title="과장"):
        self.id = id
        self.name = name
        self.company = company
        self.job_class = job_class
        self.title = title


@pytest.mark.parametrize(
    "title,expected",
    [
        ("대표이사", 6),
        ("공동 창업자 / CEO", 6),
        ("전무", 5),
        ("본부장", 5),
        ("Head of Design", 5),
        ("마케팅팀 팀장", 4),
        ("Engineering Manager", 4),
        ("과장", 3),
        ("책임연구원", 3),
        ("Senior Developer", 3),
        ("사원", 2),
        ("주임", 2),
        ("인턴", 1),
        ("Trainee", 1),
    ],
)
def test_grade_from_title_matches_the_seniority_ladder(title, expected):
    assert grade_from_title(title) == expected


def test_grade_from_title_defaults_to_one_when_unknown_or_missing():
    assert grade_from_title(None) == 1
    assert grade_from_title("") == 1
    assert grade_from_title("우주 해적") == 1


def test_resolve_job_class_passes_through_a_known_class():
    assert resolve_job_class("dev") == "dev"
    assert resolve_job_class("sales") == "sales"


def test_resolve_job_class_falls_back_to_pm_for_unknown_or_missing():
    assert resolve_job_class(None) == "pm"
    assert resolve_job_class("astronaut") == "pm"


def test_scale_stats_floors_each_stat_like_the_ts_engine():
    # marketing base {7,3,6,10} at ×1.35 (Manager) -> floor
    assert scale_stats({"atk": 7, "def": 3, "int": 6, "hp": 10}, 1.35) == {
        "atk": 9,  # floor(9.45)
        "def": 4,  # floor(4.05)
        "int": 8,  # floor(8.1)
        "hp": 13,  # floor(13.5)
    }


def test_build_snapshot_assembles_the_full_card_row():
    snap = build_snapshot(
        _Person(id=7, name="김마케", company="토스", job_class="marketing", title="과장")
    )

    assert snap["person_id"] == 7
    assert snap["job_class"] == "marketing"
    assert snap["grade"] == 3
    assert snap["cost"] == GRADE_TABLE[3]["cost"]
    assert snap["base_stats"] == BASE_STATS["marketing"]
    assert snap["final_stats"] == scale_stats(BASE_STATS["marketing"], GRADE_TABLE[3]["multiplier"])
    assert snap["skill"]["name"]  # non-empty skill
    assert snap["passive"]  # non-empty passive name
    assert snap["flavor_text"]  # seeded from FLAVOR_TEXT
    assert snap["illustration_url"] is None  # art is filled in later by the asset pipeline


def test_build_snapshot_handles_a_person_with_no_job_class_or_title():
    snap = build_snapshot(_Person(job_class=None, title=None))

    assert snap["job_class"] == "pm"
    assert snap["grade"] == 1
    assert snap["final_stats"]["hp"] == math.floor(BASE_STATS["pm"]["hp"] * 1.0)
