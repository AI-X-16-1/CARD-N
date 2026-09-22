# Architecture

## Monorepo Structure

```
/
├── CLAUDE.md
├── docs/
│   ├── architecture.md        ← this file
│   ├── conventions.md
│   ├── ui-spec.md
│   ├── design-tokens.md
│   ├── api-spec.md
│   ├── features.md
│   └── game-rules.md
│
├── frontend/                   ← React Native (Android)
│   ├── CLAUDE.md
│   ├── package.json
│   ├── tsconfig.json
│   ├── app.json
│   ├── App.tsx
│   └── src/
│       ├── navigation/
│       │   └── RootNavigator.tsx
│       ├── shared/             ← shared modules (PR review required)
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── theme/
│       │   ├── types/
│       │   └── utils/
│       │
│       └── features/           ← ★ independent folder per feature
│           ├── home/           ← 강민구
│           ├── scan/           ← 강민구
│           ├── contacts/       ← 강민구
│           ├── graph/          ← 김민경
│           ├── conversation/   ← 박재경
│           └── game/           ← 이승환
│
├── backend/                    ← FastAPI
│   ├── CLAUDE.md
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py         ← MySQL connection
│   │   ├── dependencies.py
│   │   ├── core/
│   │   │   └── base.py         ← SQLAlchemy declarative Base
│   │   │
│   │   └── features/           ← per-feature schemas.py / queries.py / router.py / service.py
│   │       ├── scan/           ← 강민구
│   │       ├── contacts/       ← 강민구
│   │       ├── graph/          ← 김민경 (queries.py alongside schemas.py — the graph tables)
│   │       ├── conversation/   ← 박재경
│   │       └── game/           ← 이승환
│   │
│   └── tests/                  ← flat directory, one test module per concern
│
├── assets/                     ← 문민재 (graphic assets)
│   ├── card-illustrations/     ← card illustrations by role (ComfyUI)
│   │   ├── dev.png
│   │   ├── design.png
│   │   ├── marketing.png
│   │   └── ...
│   ├── icons/                  ← app icons, tab icons (Krea2)
│   └── README.md               ← asset naming, size guide
│
└── docker-compose.yml          ← MySQL + Backend
```

## Feature Folder Rules

### Principle: "Only modify your own folder"

| Team Member | Owned Folder |
|------|----------|
| 김민경 | `features/graph/` (FE+BE) |
| 박재경 | `features/conversation/` (FE+BE) |
| 강민구 | `features/scan/` + `features/contacts/` + `features/home/` (FE+BE) |
| 문민재 | `assets/` (no code) |
| 이승환 | `features/game/` (FE+BE) |

### Communication Between Features

```
[scan/강민구] ──save──→ [contacts DB] ←──query── [contacts/강민구]
                            ↓
                  [read by graph/김민경]
                            ↓
[conversation/박재경] ──save summary──→ [conversation table in contacts DB]
                            ↓
[game/이승환] ──create card──→ [card table in game DB] (references contacts)
```

When data needs to flow between features:
1. **Communicate via API** (between backend features)
2. **Define interfaces via shared types in shared/types**
3. **Pass data between screens via Navigation params** (frontend)

### shared/ Modification Rules

Since the `shared/` directory is a dependency for every feature:
- PRs require **at least 2 approvals**
- **Notify all feature owners** when changing an existing interface
- Adding a new shared component is unrestricted; modifying an existing one requires discussion first

### assets/ Usage Rules

When 문민재 adds an asset to `assets/`, the frontend owner imports it into their own feature.
Asset file names follow the format `{job_class}_{usage}_{size}.png`.
Example: `dev_card_250.png`, `marketing_avatar_56.png`

## Dependency Direction

```
features/* → shared/*   ✅ allowed
features/* → features/*  ❌ forbidden (communicate via API or Navigation)
shared/*   → features/*  ❌ forbidden
features/* → assets/*    ✅ allowed (referencing image resources)
```

## Database Structure

### MySQL (relational data — main DB)

- `users` — app users
- `persons` — registered persons (business card info)
- `conversations` — conversation records (summary text)
- `battle_cards` — battle cards (references persons)
- `decks` — user deck composition

### Relationship graph (same MySQL instance)

The graph used to live in Neo4j. It doesn't any more — every query the app makes is a
fixed 1- or 2-hop lookup, which a second database engine was not buying us anything for.
See `docs/neo4j-to-mysql-migration.md` for the reasoning, the query-by-query translation
and the behaviour that needed preserving.

Three tables, owned by `features/graph/` (`app/features/graph/models.py`):

- `graph_persons` — a node. The id space is shared and meaningful:
  `0` is me, a positive id is `persons.id`, a negative id is an acquaintance who exists
  only in the graph. Not a foreign key to `persons`, because two of those three cases have
  no row there.
- `graph_edges` — "I have met this person", carrying `weight` (the conversation count) and
  `last_interaction`. **Undirected**: the pair is stored once, always smallest id first,
  which is what lets `UNIQUE (person_a_id, person_b_id)` reject duplicates. Reads go
  through the `ADJACENCY` CTE in `features/graph/queries.py`, which expands each row into
  both directions.
- `graph_intro_consents` — one person's consent to being surfaced to another. **Directed**,
  and the direction is the privacy rule: `from` is the person agreeing to be shown,
  `to` is the contact they would be shown through.

Both tables cascade on delete from `graph_persons`, which is what `DETACH DELETE` used to do.

**Synchronization**: there is nothing to synchronize any more, which was the point. A
person's node is written in the same transaction as the contact
(`features/contacts/graph_sync.py`), and a conversation's weight bump in the same
transaction as the conversation (`features/graph/conversation_sync.py`). `persons` is
still the source of truth; the graph is a derived view that can no longer fall behind it.

**Timestamps**: MySQL `DATETIME` has no timezone, so `features/graph/queries.py` writes
naive UTC and re-attaches it on read. The API keeps serializing `"...T14:00:00Z"`, which
is what `api-spec.md` documents and what the client parses — a naive string would be read
as local time, nine hours off.

### Full Docker Compose

```yaml
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

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - mysql
    env_file:
      - path: ./backend/.env
        required: false

volumes:
  mysql_data:
```

## Backend Feature Router Registration

```python
# app/main.py
from app.features.scan.router import router as scan_router
from app.features.contacts.router import router as contacts_router
from app.features.graph.router import router as graph_router
from app.features.conversation.router import router as conversation_router
from app.features.game.router import router as game_router

app.include_router(scan_router, prefix="/api/v1/scan", tags=["scan"])
app.include_router(contacts_router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(graph_router, prefix="/api/v1/graph", tags=["graph"])
app.include_router(conversation_router, prefix="/api/v1/conversations", tags=["conversation"])
app.include_router(game_router, prefix="/api/v1/game", tags=["game"])
```
