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
- MySQL 8+ (main DB), via the `asyncmy` async driver
- Neo4j Community Edition (relationship graph, driven by the official `neo4j` async driver)
- Pydantic v2 (schema validation)
- google-genai (Gemini — conversation summaries, guide chatbot, game flavor text)
- faster-whisper (STT, runs in-process), PaddleOCR + OpenCV (business card OCR, self-hosted)
- httpx (outbound HTTP)
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
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

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

## Using the Graph DB (graph feature only)

The graph feature talks to Neo4j directly (not through MySQL/SQLAlchemy).

```python
# app/features/graph/queries.py
from neo4j import AsyncGraphDatabase

async def get_connections(driver, person_id: int, depth: int = 1):
    async with driver.session() as session:
        result = await session.run(
            "MATCH (me:Person {id: $pid})-[r:MET_AT*1..$depth]-(other:Person) "
            "RETURN other, r",
            pid=person_id, depth=depth
        )
        return [record async for record in result]
```

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
