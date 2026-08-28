import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.contacts.router import router as contacts_router
from app.features.conversation.router import router as conversation_router
from app.features.conversation.stt import warmup as warmup_stt
from app.features.game.router import router as game_router
from app.features.graph.router import router as graph_router
from app.features.scan.ocr.pipeline import warmup as warmup_ocr
from app.features.scan.router import router as scan_router
from app.neo4j_driver import close_neo4j_driver


@asynccontextmanager
async def lifespan(app: FastAPI):
    # OCR and Whisper both load their models lazily (app/features/scan/ocr/pipeline.py,
    # app/features/conversation/stt.py) so they don't slow down every test/import, but
    # that means the first real scan or recording after a cold start pays that cost —
    # long enough to blow past the client's request timeout. Paying it once here,
    # before the server accepts traffic, avoids that. Both are CPU-bound, but they
    # spend that time inside C extensions that release the GIL, so loading them
    # together finishes sooner than one after the other.
    await asyncio.gather(
        asyncio.to_thread(warmup_ocr),
        asyncio.to_thread(warmup_stt),
    )
    yield
    await close_neo4j_driver()


app = FastAPI(title="CARD:N API", version="0.1.0", lifespan=lifespan)

# Local dev only (no deployment, per CLAUDE.md) — needed for the Expo web preview
# (react-native-web) to call this API from the browser without hitting CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan_router, prefix="/api/v1/scan", tags=["scan"])
app.include_router(contacts_router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(graph_router, prefix="/api/v1/graph", tags=["graph"])
app.include_router(conversation_router, prefix="/api/v1/conversations", tags=["conversation"])
app.include_router(game_router, prefix="/api/v1/game", tags=["game"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
