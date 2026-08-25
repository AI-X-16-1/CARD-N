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
│   │   ├── neo4j_driver.py     ← Neo4j driver connection
│   │   ├── dependencies.py
│   │   ├── core/
│   │   │   └── base.py         ← SQLAlchemy declarative Base
│   │   │
│   │   └── features/           ← per-feature schemas.py / queries.py / router.py / service.py
│   │       ├── scan/           ← 강민구
│   │       ├── contacts/       ← 강민구
│   │       ├── graph/          ← 김민경 (queries.py instead of schemas.py — talks to Neo4j)
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
└── docker-compose.yml          ← MySQL + Neo4j + Backend
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

### Neo4j Community Edition (relationship graph only)

Runs **Neo4j Community Edition** (GPL-3.0, free) locally via Docker.
Since there is no deployment, the AuraDB cloud service is not used.

```yaml
# docker-compose.yml
services:
  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"   # Browser UI
      - "7687:7687"   # Bolt protocol
    environment:
      NEO4J_AUTH: neo4j/cardncardn123
    volumes:
      - neo4j_data:/data
```

**Graph Data Model (Cypher)**:

```cypher
// Nodes
(:Person {id: 1, name: "홍길동", job_class: "marketing"})
(:Company {name: "카카오", domain: "kakao.com"})

// Relationships
(:Person)-[:MET_AT {date: "2024-03-15", context: "AI conference"}]->(:Person)
(:Person)-[:WORKS_AT {title: "Manager", department: "Marketing Team"}]->(:Company)
(:Person)-[:DISCUSSED {summary: "Q4 budget discussion", date: "2024-03-15"}]->(:Person)
```

**MySQL ↔ Neo4j Synchronization**:
- When a person is created/updated → create/update the corresponding node in Neo4j (handled in the graph feature's service)
- When a conversation is saved → update the Neo4j edge weight
- MySQL is the source of truth; Neo4j is used only for relationship traversal

**Community Edition Constraints (know these before using)**:
- No clustering (single instance only)
- No role-based access control
- No hot backups
- Since this is for local development only, these constraints are not a problem

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

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
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
      - path: ./backend/.env
        required: false

volumes:
  mysql_data:
  neo4j_data:
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
