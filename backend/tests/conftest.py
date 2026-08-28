import asyncio
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.base import Base
from app.dependencies import get_db
from app.features.contacts import models  # noqa: F401  registers tables on Base.metadata
from app.features.game import models as game_models  # noqa: F401  same
from app.main import app
from app.neo4j_driver import get_neo4j_driver


async def _create_tables(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    asyncio.run(_create_tables(engine))
    app.dependency_overrides[get_db] = _override_get_db
    # Contacts CRUD must not depend on a real Neo4j instance being up in tests —
    # ContactsService already treats a None driver as "skip the graph sync".
    app.dependency_overrides[get_neo4j_driver] = lambda: None
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_neo4j_driver, None)
        asyncio.run(engine.dispose())
