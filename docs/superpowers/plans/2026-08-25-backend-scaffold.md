# Backend Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running FastAPI backend skeleton (MySQL + Neo4j wired, 5 feature routers registered, Alembic ready) so every team member can `uv sync` and start building inside their own `app/features/<name>/` folder immediately.

**Architecture:** A single FastAPI app (`app/main.py`) mounts one router per feature folder. `app/database.py` owns the async SQLAlchemy engine (MySQL via `asyncmy`); `app/neo4j_driver.py` owns a lazily-created async Neo4j driver. Both are exposed as FastAPI dependencies so routes never touch connection setup directly. No business logic exists yet — every feature gets a placeholder `GET /ping` endpoint and empty `Service`/`schemas`/`queries` files to build on.

**Tech Stack:** Python 3.11+, FastAPI, uv, SQLAlchemy 2.0 (async) + Alembic, `asyncmy` (MySQL driver), `neo4j` (official async driver), Pydantic v2, Ruff, pytest.

**Spec:** `docs/superpowers/specs/2026-08-25-initial-scaffold-design.md`

## Global Constraints

- Python 3.11+, FastAPI, async-first (sync only when required for I/O reasons)
- Package manager: `uv` — `pyproject.toml` + `uv.lock`, no `requirements.txt`
- Main DB: MySQL 8+ via the `asyncmy` async driver, URL scheme `mysql+asyncmy://`
- Graph DB: Neo4j Community Edition via the official `neo4j` async driver
- ORM: SQLAlchemy 2.0 async; migrations via Alembic (async template)
- FastAPI app title must be exactly `"CARD:N API"`
- No deployment target — Docker Compose is for local development only
- Type hints required on every function signature and return type
- Routers stay thin (HTTP concerns only); business logic lives in `service.py`
- Pydantic models: `Request`/`Response` suffix; DB models: no suffix
- Lint/format with Ruff (`pyproject.toml` config, default rules)
- All commit messages follow Conventional Commits (`docs/conventions.md`)

---

### Task 1: Root Docker Compose (MySQL + Neo4j)

**Files:**
- Create: `docker-compose.yml` (repo root)

**Interfaces:**
- Produces: a `mysql` service reachable at `localhost:3307` (mapped to the container's 3306 — 3307 avoids clashing with a MySQL already installed natively on some developer machines; db `cardn_db`, user/pass `cardn`/`cardn`) and a `neo4j` service reachable at `bolt://localhost:7687` (user/pass `neo4j`/`cardncardn123`) — later tasks' `.env.example` values must match these exactly.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
version: "3.9"
services:
  mysql:
    image: mysql:8
    ports:
      - "3307:3306"   # host 3307 avoids clashing with a locally installed MySQL on 3306
    environment:
      MYSQL_DATABASE: cardn_db
      MYSQL_USER: cardn
      MYSQL_PASSWORD: cardn
      MYSQL_ROOT_PASSWORD: cardn
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-ucardn", "-pcardn"]
      interval: 5s
      timeout: 5s
      retries: 10

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"   # Browser UI
      - "7687:7687"   # Bolt protocol
    environment:
      NEO4J_AUTH: neo4j/cardncardn123
    volumes:
      - neo4j_data:/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - mysql
      - neo4j
    env_file:
      - ./backend/.env

volumes:
  mysql_data:
  neo4j_data:
```

There is no `backend/Dockerfile` yet, so `docker compose up` (with no
service names) or `docker compose build` will fail on the `backend`
service until one is added — that's expected at this stage. Local
development runs the backend directly with `uv run uvicorn` (Task 7),
not through this compose service; this task's own verification only
brings up `mysql` and `neo4j` by name, so the missing Dockerfile doesn't
block it.

- [ ] **Step 2: Validate the compose file parses**

Run: `docker compose config -q`
Expected: no output, exit code 0.

- [ ] **Step 3: Bring the two services up and confirm health**

Run:
```bash
docker compose up -d mysql neo4j
docker compose ps
```
Expected: both rows show `running` (mysql eventually `running (healthy)` — poll `docker compose ps` every few seconds until it flips from `starting` to `healthy`, up to ~30s).

- [ ] **Step 4: Tear down**

Run: `docker compose down -v`
Expected: containers and named volumes removed, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(infra): add MySQL + Neo4j docker compose"
```

---

### Task 2: Backend project init with uv

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`
- Create: `backend/uv.lock` (generated)

**Interfaces:**
- Produces: a `backend/` uv project with `fastapi`, `uvicorn[standard]`,
  `sqlalchemy[asyncio]`, `alembic`, `asyncmy`, `pydantic-settings`, `neo4j`,
  `httpx`, `python-multipart` as runtime deps and `ruff`, `pytest`,
  `pytest-asyncio` as dev deps — every later task's `uv add`/`uv run` calls
  depend on this environment existing.

- [ ] **Step 1: Initialize the uv project**

Run (from repo root):
```bash
cd backend
uv init --bare --name backend --python 3.11 --vcs none
```
Expected: creates `backend/pyproject.toml` and `backend/.python-version`. No `hello.py`/`README.md`/nested `.git` should appear (`--bare --vcs none` skips them — if any of those three files exist anyway, delete them).

- [ ] **Step 2: Add runtime dependencies**

Run (from `backend/`):
```bash
uv add fastapi "uvicorn[standard]" "sqlalchemy[asyncio]" alembic asyncmy pydantic-settings neo4j httpx python-multipart
```
Expected: exits 0, `pyproject.toml`'s `[project.dependencies]` lists all 9 packages, `uv.lock` is created/updated.

> If `asyncmy` fails to build from source: `brew install mysql-client pkg-config` then retry — it ships prebuilt wheels for most platforms so this should rarely be needed.

- [ ] **Step 3: Add dev dependencies**

Run (from `backend/`):
```bash
uv add --dev ruff pytest pytest-asyncio
```
Expected: exits 0, `[dependency-groups.dev]` (or `[tool.uv.dev-dependencies]`, depending on uv version) lists all 3.

- [ ] **Step 4: Verify the environment resolves and imports cleanly**

Run (from `backend/`):
```bash
uv run python -c "import fastapi, uvicorn, sqlalchemy, alembic, asyncmy, pydantic_settings, neo4j, httpx; print('ok')"
```
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
cd backend
git add pyproject.toml uv.lock .python-version
git commit -m "chore(backend): init uv project with FastAPI/MySQL/Neo4j deps"
```

---

### Task 3: Settings + DB/Neo4j connections

**Files:**
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `backend/app/neo4j_driver.py`
- Create: `backend/app/dependencies.py`
- Create: `backend/.env.example`
- Test: `backend/tests/__init__.py` (empty), `backend/tests/test_config.py`

**Interfaces:**
- Produces: `app.config.settings` (a `Settings` instance with fields
  `database_url: str`, `google_vision_api_key: str`, `openai_api_key: str`,
  `neo4j_uri: str`, `neo4j_user: str`, `neo4j_password: str`, each with a
  local-dev default matching Task 1's compose credentials); `app.database.get_db`
  (async generator FastAPI dependency yielding an `AsyncSession`);
  `app.neo4j_driver.get_neo4j_driver() -> AsyncDriver`. Task 4 and Task 5
  import these directly.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/__init__.py` (empty file) and `backend/tests/test_config.py`:

```python
from app.config import Settings


def test_settings_defaults_match_local_docker_compose():
    settings = Settings(_env_file=None)
    assert settings.database_url == "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"
    assert settings.neo4j_uri == "bolt://localhost:7687"
    assert settings.neo4j_user == "neo4j"
    assert settings.neo4j_password == "cardncardn123"
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'` or `No module named 'app.config'` (module doesn't exist yet).

- [ ] **Step 3: Write `app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"
    google_vision_api_key: str = ""
    openai_api_key: str = ""
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "cardncardn123"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
```

- [ ] **Step 4: Write `app/database.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
```

- [ ] **Step 5: Write `app/neo4j_driver.py`**

```python
from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import settings

_driver: AsyncDriver | None = None


def get_neo4j_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


async def close_neo4j_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
```

- [ ] **Step 6: Write `app/dependencies.py`**

```python
from app.database import get_db
from app.neo4j_driver import get_neo4j_driver

__all__ = ["get_db", "get_neo4j_driver"]
```

- [ ] **Step 7: Write `backend/.env.example`**

```env
DATABASE_URL=mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db
GOOGLE_VISION_API_KEY=
OPENAI_API_KEY=
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=cardncardn123
```

- [ ] **Step 8: Create empty `backend/app/__init__.py`**

- [ ] **Step 9: Run test to verify it passes**

Run (from `backend/`): `uv run pytest tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd backend
git add app/__init__.py app/config.py app/database.py app/neo4j_driver.py app/dependencies.py .env.example tests/__init__.py tests/test_config.py
git commit -m "feat(backend): add settings, MySQL, and Neo4j connections"
```

---

### Task 4: FastAPI app shell + `/health`

**Files:**
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nothing from Task 3 yet (health check has no DB dependency by
  design, so it works even if Docker isn't running).
- Produces: `app.main.app` (the `FastAPI` instance) — Task 5 imports this to
  register feature routers on it.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 3: Write `app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="CARD:N API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `backend/`): `uv run pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/main.py tests/test_health.py
git commit -m "feat(backend): add FastAPI app shell with /health"
```

---

### Task 5: Feature routers (scan, contacts, graph, conversation, game)

**Files:**
- Create: `backend/app/features/__init__.py` (empty)
- Create: `backend/app/features/scan/__init__.py`, `router.py`, `service.py`, `schemas.py`
- Create: `backend/app/features/contacts/__init__.py`, `router.py`, `service.py`, `schemas.py`
- Create: `backend/app/features/graph/__init__.py`, `router.py`, `service.py`, `queries.py`
- Create: `backend/app/features/conversation/__init__.py`, `router.py`, `service.py`, `schemas.py`
- Create: `backend/app/features/game/__init__.py`, `router.py`, `service.py`, `schemas.py`
- Modify: `backend/app/main.py` — import and register all 5 routers
- Test: `backend/tests/test_feature_routers.py`

**Interfaces:**
- Consumes: `app.main.app` from Task 4.
- Produces: `GET /api/v1/scan/ping`, `GET /api/v1/contacts/ping`,
  `GET /api/v1/graph/ping`, `GET /api/v1/conversations/ping`,
  `GET /api/v1/game/ping` — each returns `{"feature": "<name>", "status": "ok"}`.
  Each `features/<name>/service.py` exports an empty `<Name>Service` class
  that future work adds methods to.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_feature_routers.py`:

```python
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.mark.parametrize(
    "prefix,feature",
    [
        ("/api/v1/scan", "scan"),
        ("/api/v1/contacts", "contacts"),
        ("/api/v1/graph", "graph"),
        ("/api/v1/conversations", "conversation"),
        ("/api/v1/game", "game"),
    ],
)
def test_feature_ping(prefix: str, feature: str) -> None:
    response = client.get(f"{prefix}/ping")
    assert response.status_code == 200
    assert response.json() == {"feature": feature, "status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_feature_routers.py -v`
Expected: FAIL — all 5 cases 404 (routes don't exist yet).

- [ ] **Step 3: Create `backend/app/features/__init__.py`** (empty)

- [ ] **Step 4: Write the scan feature**

`backend/app/features/scan/__init__.py` — empty file.

`backend/app/features/scan/router.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "scan", "status": "ok"}
```

`backend/app/features/scan/service.py`:
```python
class ScanService:
    pass
```

`backend/app/features/scan/schemas.py`:
```python
"""Pydantic schemas for the scan feature."""
```

- [ ] **Step 5: Write the contacts feature** (same pattern as Step 4)

`backend/app/features/contacts/__init__.py` — empty.

`backend/app/features/contacts/router.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "contacts", "status": "ok"}
```

`backend/app/features/contacts/service.py`:
```python
class ContactsService:
    pass
```

`backend/app/features/contacts/schemas.py`:
```python
"""Pydantic schemas for the contacts feature."""
```

- [ ] **Step 6: Write the graph feature**

`backend/app/features/graph/__init__.py` — empty.

`backend/app/features/graph/router.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "graph", "status": "ok"}
```

`backend/app/features/graph/service.py`:
```python
class GraphService:
    pass
```

`backend/app/features/graph/queries.py`:
```python
"""Neo4j Cypher queries for the graph feature."""
```

- [ ] **Step 7: Write the conversation feature**

`backend/app/features/conversation/__init__.py` — empty.

`backend/app/features/conversation/router.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "conversation", "status": "ok"}
```

`backend/app/features/conversation/service.py`:
```python
class ConversationService:
    pass
```

`backend/app/features/conversation/schemas.py`:
```python
"""Pydantic schemas for the conversation feature."""
```

- [ ] **Step 8: Write the game feature**

`backend/app/features/game/__init__.py` — empty.

`backend/app/features/game/router.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "game", "status": "ok"}
```

`backend/app/features/game/service.py`:
```python
class GameService:
    pass
```

`backend/app/features/game/schemas.py`:
```python
"""Pydantic schemas for the game feature."""
```

- [ ] **Step 9: Register all 5 routers in `app/main.py`**

Replace the full contents of `backend/app/main.py` with:

```python
from fastapi import FastAPI

from app.features.conversation.router import router as conversation_router
from app.features.contacts.router import router as contacts_router
from app.features.game.router import router as game_router
from app.features.graph.router import router as graph_router
from app.features.scan.router import router as scan_router

app = FastAPI(title="CARD:N API", version="0.1.0")

app.include_router(scan_router, prefix="/api/v1/scan", tags=["scan"])
app.include_router(contacts_router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(graph_router, prefix="/api/v1/graph", tags=["graph"])
app.include_router(conversation_router, prefix="/api/v1/conversations", tags=["conversation"])
app.include_router(game_router, prefix="/api/v1/game", tags=["game"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 10: Run tests to verify they pass**

Run (from `backend/`): `uv run pytest -v`
Expected: all tests across `test_config.py`, `test_health.py`, and
`test_feature_routers.py` PASS.

- [ ] **Step 11: Commit**

```bash
cd backend
git add app/features app/main.py tests/test_feature_routers.py
git commit -m "feat(backend): register scan/contacts/graph/conversation/game routers"
```

---

### Task 6: Alembic (async) setup

**Files:**
- Create: `backend/app/core/__init__.py` (empty)
- Create: `backend/app/core/base.py`
- Create (via `alembic init`): `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/`
- Modify: `backend/alembic/env.py`
- Create (via `alembic revision`): `backend/alembic/versions/<hash>_initial_no_models_yet.py`

**Interfaces:**
- Produces: `app.core.base.Base` (a `DeclarativeBase` subclass) — every
  future feature's SQLAlchemy models inherit from this so Alembic
  autogenerate can see them. `backend/alembic/versions/` is empty of real
  schema changes; the first feature to add a model runs its own
  `alembic revision --autogenerate`.

- [ ] **Step 1: Write `app/core/__init__.py`** (empty) and `app/core/base.py`

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 2: Generate the Alembic scaffold**

Run (from `backend/`): `uv run alembic init -t async alembic`
Expected: creates `alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`,
`alembic/versions/` (empty).

- [ ] **Step 3: Rewrite `alembic/env.py` to use our Settings + Base**

Replace the full contents of `backend/alembic/env.py` with:

```python
import asyncio
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

sys.path.insert(0, os.getcwd())

from app.config import settings
from app.core.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return settings.database_url


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 4: Bring MySQL up and generate the initial (empty) revision**

Run (from repo root): `docker compose up -d mysql` and wait until
`docker compose ps` shows it `healthy`.

Run (from `backend/`):
```bash
uv run alembic revision -m "initial (no models yet)"
```
Expected: creates one file in `backend/alembic/versions/` with empty
`upgrade()`/`downgrade()` bodies.

- [ ] **Step 5: Apply the migration and verify**

Run (from `backend/`):
```bash
uv run alembic upgrade head
uv run alembic current
```
Expected: `upgrade head` exits 0; `current` prints the new revision hash,
confirming the `alembic_version` table was created in `cardn_db`.

- [ ] **Step 6: Tear down MySQL**

Run (from repo root): `docker compose down -v`

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/core alembic.ini alembic/
git commit -m "chore(backend): configure async Alembic against MySQL"
```

---

### Task 7: Full-stack verification

**Files:** none (verification only — fix forward if any step below fails).

- [ ] **Step 1: Bring up the databases**

Run (from repo root):
```bash
docker compose up -d mysql neo4j
```
Wait until `docker compose ps` shows `mysql` healthy (poll every few
seconds, up to ~30s).

- [ ] **Step 2: Sync deps and apply migrations**

Run (from `backend/`):
```bash
uv sync
uv run alembic upgrade head
```
Expected: both exit 0.

- [ ] **Step 3: Boot the API and smoke-test every endpoint**

Run (from `backend/`):
```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 2
curl -sf localhost:8000/health
curl -sf localhost:8000/api/v1/scan/ping
curl -sf localhost:8000/api/v1/contacts/ping
curl -sf localhost:8000/api/v1/graph/ping
curl -sf localhost:8000/api/v1/conversations/ping
curl -sf localhost:8000/api/v1/game/ping
kill %1
```
Expected: every `curl` prints a `200`-backed JSON body (`-f` makes curl
exit non-zero on HTTP errors, so no error output means success).

- [ ] **Step 4: Run the full test suite and lint**

Run (from `backend/`):
```bash
uv run pytest -v
uv run ruff check .
```
Expected: all tests PASS; Ruff reports no issues (if it does, fix them and
re-run — do not disable rules to silence it).

- [ ] **Step 5: Tear down**

Run (from repo root): `docker compose down -v`

- [ ] **Step 6: Commit any fixes made during verification**

If Steps 3–4 required code changes to pass, commit them:
```bash
git add -A
git commit -m "fix(backend): address issues found during full-stack verification"
```
If nothing needed changing, skip this step — there is nothing to commit.
