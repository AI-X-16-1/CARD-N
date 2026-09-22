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
from app.features.graph import models as graph_models  # noqa: F401  same
from app.main import app

# The install every test speaks as, unless it is specifically testing isolation.
TEST_DEVICE_ID = "test-device-0001"


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
    try:
        # Every route requires X-Device-Id (app/device.py). Setting it on the client
        # rather than overriding the dependency keeps the real header parsing and
        # validation in the path under test.
        yield TestClient(app, headers={"X-Device-Id": TEST_DEVICE_ID})
    finally:
        app.dependency_overrides.pop(get_db, None)
        asyncio.run(engine.dispose())
