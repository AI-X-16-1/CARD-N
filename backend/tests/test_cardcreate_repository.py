import contextlib

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.base import Base
from app.features.contacts.models import Person
from app.features.game.models import BattleCard
from cardcreate.repository import (
    CardDataNotFoundError,
    SourceImageMissingError,
    fetch_card_data,
)
from cardcreate.schemas import GameCardData


@contextlib.asynccontextmanager
async def _session():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            yield session
    finally:
        await engine.dispose()


async def _seed(session, *, image_path: str | None = "7.jpg") -> int:
    person = Person(
        name="홍길동",
        company="주식회사 카드엔",
        job_class="marketing",
        title="마케팅팀장",
        image_path=image_path,
    )
    session.add(person)
    await session.flush()
    card = BattleCard(
        person_id=person.id,
        job_class="marketing",
        grade=4,
        cost=4,
        base_stats={"atk": 7, "def": 3, "int": 6, "hp": 10},
        final_stats={"atk": 9, "def": 4, "int": 8, "hp": 13},
        skill={"name": "캠페인", "cost": 2, "description": "아군 전체 ATK +2 (영구)"},
        passive="트렌드세터",
        flavor_text="트렌드는 내가 만든다",
    )
    session.add(card)
    await session.commit()
    return card.id


async def test_fetch_card_data_maps_person_and_battle_card_columns() -> None:
    async with _session() as session:
        card_id = await _seed(session)

        record = await fetch_card_data(session, card_id)

    assert isinstance(record.text, GameCardData)
    # from persons
    assert record.text.name == "홍길동"
    assert record.text.company == "주식회사 카드엔"
    assert record.text.job_class == "marketing"
    assert record.image_path == "7.jpg"
    # from battle_cards
    assert record.text.grade == 4
    assert record.text.cost == 4
    assert record.text.final_stats.atk == 9
    assert record.text.final_stats.defense == 4
    assert record.text.final_stats.intelligence == 8
    assert record.text.final_stats.hp == 13
    assert record.text.skill.name == "캠페인"
    assert record.text.skill.cost == 2
    assert record.text.skill.description == "아군 전체 ATK +2 (영구)"
    assert record.text.passive == "트렌드세터"
    assert record.text.flavor_text == "트렌드는 내가 만든다"
    # the ORM row is handed back so the caller can write illustration_url onto it
    assert record.card.id == card_id


async def test_fetch_card_data_raises_for_an_unknown_id() -> None:
    async with _session() as session:
        with pytest.raises(CardDataNotFoundError):
            await fetch_card_data(session, 9999)


async def test_fetch_card_data_raises_when_the_contact_has_no_saved_image() -> None:
    async with _session() as session:
        card_id = await _seed(session, image_path=None)

        with pytest.raises(SourceImageMissingError):
            await fetch_card_data(session, card_id)
