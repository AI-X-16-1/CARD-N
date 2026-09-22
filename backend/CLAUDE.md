# Backend — CLAUDE.md

Agent instructions for the FastAPI (Python 3.11+) backend.

## Documents to Read First

1. `/docs/api-spec.md` — endpoints, request/response schemas
2. `/docs/architecture.md` — feature folder structure
3. `/docs/conventions.md` — code style, naming
4. `/docs/game-rules.md` — battle card stat calculation rules (game feature)

## Tech Stack

- Python 3.11+, FastAPI, uvicorn
- SQLAlchemy 2.0 (async), Alembic (migration)
- MySQL 8+ (main DB, relationship graph included), via the `asyncmy` async driver
- Pydantic v2 (schema validation)
- httpx (external API calls: Google Vision, OpenAI)
- python-multipart (file upload)
- Ruff (lint + format)

## Core Rules

### 1. Respect feature folder boundaries

```
Do not import services from app/features/game/ directly within app/features/scan/.
Communication between features must go only through API calls or a shared service (app/core/).
```

### 2. Keep routers thin, services thick

```python
# ✅ router.py — HTTP concerns only
@router.post("/ocr")
async def scan_ocr(image: UploadFile, db=Depends(get_db)):
    result = await ScanService(db).process_image(image)
    return result

# ✅ service.py — business logic
class ScanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_image(self, image: UploadFile) -> OcrResponse:
        raw_text = await self._call_vision_api(image)
        fields = self._parse_fields(raw_text)
        return OcrResponse(fields=fields, raw_text=raw_text)
```

### 3. Type hints are required

```python
# ✅
async def get_person(self, person_id: int) -> PersonResponse:
    ...

# ❌
async def get_person(self, person_id):
    ...
```

### 4. Pydantic model naming

```python
# Request: ~Request
class CreatePersonRequest(BaseModel):
    name: str
    company: str
    ...

# Response: ~Response
class PersonResponse(BaseModel):
    id: int
    name: str
    ...
    model_config = ConfigDict(from_attributes=True)

# DB Model: no suffix
class Person(Base):
    __tablename__ = "persons"
    id: Mapped[int] = mapped_column(primary_key=True)
    ...
```

### 5. Error handling

```python
from fastapi import HTTPException

# Use HTTPException in feature services
raise HTTPException(status_code=404, detail="Person not found")

# Or register a custom exception handler in core/errors.py
class PersonNotFoundError(Exception):
    pass
```

### 6. Environment variables

```python
# app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    google_vision_api_key: str
    openai_api_key: str

    model_config = ConfigDict(env_file=".env")

settings = Settings()
```

### 7. DB migrations

```bash
# Generate a new migration
alembic revision --autogenerate -m "add conversations table"

# Apply migrations
alembic upgrade head
```

Always create a migration when adding a model for a feature.
Do not modify another feature's tables directly.

## Registering Routers per Feature

```python
# app/main.py
from fastapi import FastAPI
from app.features.scan.router import router as scan_router
from app.features.contacts.router import router as contacts_router
from app.features.graph.router import router as graph_router
from app.features.conversation.router import router as conversation_router
from app.features.game.router import router as game_router

app = FastAPI(title="CARD:N API", version="0.1.0")

app.include_router(scan_router, prefix="/api/v1/scan", tags=["scan"])
app.include_router(contacts_router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(graph_router, prefix="/api/v1/graph", tags=["graph"])
app.include_router(conversation_router, prefix="/api/v1/conversations", tags=["conversation"])
app.include_router(game_router, prefix="/api/v1/game", tags=["game"])
```

## The Relationship Graph (graph feature only)

The graph used to be Neo4j. It is now three tables in the same MySQL database, reached
with SQLAlchemy like every other feature — that is the whole point of
`docs/neo4j-to-mysql-migration.md`. Keep the SQL in `app/features/graph/queries.py`, as
the Cypher was.

Two invariants live there and are easy to break by accident:

```python
# Edges are undirected and stored once, smallest id first. Write through pair(); read
# through the ADJACENCY CTE, which expands each row into both directions.
lo, hi = queries.pair(me_id, person_id)

# MySQL DATETIME has no timezone. Write naive UTC, re-attach it on read — the API
# contract is "...T14:00:00Z" and a naive string is read as local time by the client.
```

Other features write graph rows on their own session (`contacts/graph_sync.py`,
`graph/conversation_sync.py`), so those writes belong to the caller's transaction. Do not
wrap them in try/except: there is no separate database to be down any more, and a failed
statement poisons the session the caller is about to commit.

## Testing

```bash
# Run all tests
pytest tests/

# Run tests for a specific feature
pytest tests/features/test_scan.py -v

# Coverage
pytest --cov=app tests/
```

Write at least a happy-path test for each feature's service.

## Privacy Rules

- Delete audio files immediately after STT processing. Do not persist them on the server.
- Legal notices related to recording consent must be shown on the client.
- Personal information (phone numbers, emails) should be stored encrypted.
