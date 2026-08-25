# Initial Project Scaffold — Design

Date: 2026-08-25
Author: 김민경 (via Claude Code)
Status: Approved by user, pending implementation

## Goal

`frontend/` and `backend/` currently contain only their `CLAUDE.md` instruction
files — no app code exists yet. This spec covers the initial scaffold for
both projects plus the local infra (Docker Compose for MySQL + Neo4j) so that
all 5 team members can clone the repo and start building inside their own
feature folder immediately, without needing to make any project-setup
decisions themselves.

This is infra/bootstrap work, not a feature. It intentionally creates
placeholder files inside every team member's feature folder (normally
off-limits to other members per `CLAUDE.md`) — a one-time exception, done at
the explicit request of the project owner (김민경) for this bootstrap task
only.

Non-goals: no CI pipeline, no actual OCR/STT/LLM integration, no real game
logic, no deployment config (per project rules, this app never deploys).

## Decisions

- **RN tooling**: Expo (managed, TypeScript template). Chosen over bare RN
  CLI so all 5 members can run the app without a full Android SDK/Studio
  setup; native modules (camera, av) come from Expo's own packages, and a
  dev client can be added later if a native module outside Expo's ecosystem
  becomes necessary.
- **Python packaging**: `uv`. Single `pyproject.toml` + `uv.lock`, `uv sync`
  reproduces the environment for anyone cloning the repo.
- **Scope**: app shell + feature-folder stubs (not just an empty shell, not
  full feature implementations). Every screen/router that exists at this
  stage is a placeholder that renders/returns a static value.
- **Verification**: actually install dependencies and boot both halves
  before calling this done (see Testing section).

## Frontend (`frontend/`)

### Setup
- `npx create-expo-app@latest frontend --template blank-typescript` (run
  from repo root, so the result lands at `frontend/`)
- `app.json`: `"userInterfaceStyle": "dark"` (app is dark-mode only per
  `frontend/CLAUDE.md` rule 5)
- Dependencies to add on top of the template:
  - `@react-navigation/native`, `@react-navigation/bottom-tabs`,
    `@react-navigation/native-stack`, `react-native-screens`,
    `react-native-safe-area-context`
  - `react-native-svg` (relationship graph rendering)
  - `react-native-reanimated` (+ babel plugin)
  - `expo-camera`, `expo-av` (scan / recording)
  - `zustand` (state management, per `frontend/CLAUDE.md` tech stack)
  - `axios`
- `tsconfig.json` + `babel.config.js`: configure `@/` → `src/` path alias
  (`babel-plugin-module-resolver`), matching `docs/conventions.md`.

### Structure

```
frontend/
├── App.tsx                        ← renders <RootNavigator/>, sets StatusBar
├── app.json
├── babel.config.js
├── tsconfig.json
└── src/
    ├── navigation/
    │   └── RootNavigator.tsx      ← Bottom Tabs + Stack, per frontend/CLAUDE.md nav spec
    ├── shared/
    │   ├── theme/
    │   │   ├── colors.ts          ← from docs/design-tokens.md
    │   │   ├── typography.ts
    │   │   └── spacing.ts
    │   ├── types/
    │   │   └── person.ts          ← minimal shared Person type (id, name, company, title)
    │   └── components/            ← empty, ready for shared components
    └── features/
        ├── home/screens/HomeScreen.tsx
        ├── scan/screens/ScanCameraScreen.tsx
        ├── contacts/screens/ContactListScreen.tsx
        ├── graph/screens/GraphScreen.tsx
        ├── conversation/screens/ConversationRecordScreen.tsx
        └── game/
            ├── screens/GameHomeScreen.tsx
            └── engine/               ← empty, pure-function battle engine goes here (rule 6)
```

Each placeholder screen: a `SafeAreaView` with a centered `<Text>` naming the
screen in Korean (matching the UI-language rule), styled with tokens from
`shared/theme`. No business logic.

`RootNavigator.tsx` wires the bottom tabs (`홈`, `목록`, `관계도`, `게임`,
with `ScanStack` reachable via a center FAB per `frontend/CLAUDE.md`) and
stacks each screen into its owning tab per the documented nav structure.
`PersonDetailScreen`, `ConversationRecordScreen`, and `CardDetailOverlay` are
stubbed as stack screens per the same doc, even though only
`ConversationRecordScreen` has a real owning feature folder yet — the other
two are placeholders inside the folders `frontend/CLAUDE.md` assigns them to
(`contacts` and `game` respectively).

## Backend (`backend/`)

### Setup
- `uv init backend --python 3.11` then `uv add fastapi "uvicorn[standard]"
  "sqlalchemy[asyncio]" alembic asyncmy pydantic-settings neo4j httpx
  python-multipart` and `uv add --dev ruff pytest pytest-asyncio`
- `alembic init -t async alembic` inside `backend/`, `alembic.ini`
  `sqlalchemy.url` left blank (read from `Settings` at runtime in `env.py`,
  per standard Alembic-with-async-URL pattern)

### Structure

```
backend/
├── pyproject.toml
├── uv.lock
├── alembic.ini
├── alembic/
│   ├── env.py                     ← configured for async MySQL + models metadata
│   └── versions/                  ← empty
├── .env.example                   ← matches docs/conventions.md
├── app/
│   ├── main.py                    ← FastAPI(title="CARD:N API"), registers 5 routers + GET /health
│   ├── config.py                  ← Settings (database_url, neo4j_uri/user/password, api keys)
│   ├── database.py                ← async engine + sessionmaker + get_db dependency
│   ├── neo4j_driver.py            ← async Neo4j driver singleton + get_neo4j dependency
│   ├── dependencies.py            ← re-exports get_db / get_neo4j for convenience
│   ├── core/                      ← empty, shared cross-feature service code goes here
│   └── features/
│       ├── scan/{router,service,schemas}.py
│       ├── contacts/{router,service,schemas}.py
│       ├── graph/{router,service,queries}.py
│       ├── conversation/{router,service,schemas}.py
│       └── game/{router,service,schemas}.py
└── tests/
    └── test_health.py             ← GET /health returns 200
```

Each feature `router.py` exposes one placeholder `GET` endpoint (e.g.
`GET /api/v1/scan/ping`) returning a static JSON payload, matching the
prefix/tag scheme already registered in `backend/CLAUDE.md`. No models yet —
the first real model/migration is left to whoever implements the first
feature that needs one.

`database.py` connects using `asyncmy` against MySQL; `neo4j_driver.py` uses
the official `neo4j` async driver against the Neo4j container. Neither
raises at import time if the DB isn't reachable — connection happens lazily
per-request via the `Depends()` dependencies, so `uvicorn` can boot even if
Docker isn't running (useful for quick frontend-only work).

## Infra

- Root `docker-compose.yml`: copy the MySQL 8 + Neo4j 5-community + backend
  service definition already written in `docs/architecture.md` into an
  actual file at the repo root, unchanged.
- `backend/.env.example` values match `docs/conventions.md`'s
  `DATABASE_URL=mysql+asyncmy://cardn:cardn@localhost:3306/cardn_db` block.

## Testing / Verification

Before calling this done:
1. **Frontend**: `npx tsc --noEmit` passes; `npx expo export` completes
   without bundler errors (proves every screen/nav file resolves and
   type-checks; a real device/simulator boot is out of scope since none is
   available in this environment).
2. **Backend**: `docker compose up -d mysql neo4j`, wait for health, then
   `uv run uvicorn app.main:app --port 8000` and `curl localhost:8000/health`
   returns `200`. `uv run pytest` passes (the one health-check test).
   `docker compose down` after.

## Out of scope / left for feature owners

- Any real screen UI beyond the placeholder text
- Any DB models/migrations (first feature to need one adds it)
- Auth, error-handling middleware, logging setup
- Frontend test tooling (not specified anywhere in `docs/`, left for later)
- CI (project has none configured; not requested)
