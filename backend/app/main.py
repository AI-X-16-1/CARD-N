from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.contacts.router import router as contacts_router
from app.features.conversation.router import router as conversation_router
from app.features.game.router import router as game_router
from app.features.graph.router import router as graph_router
from app.features.scan.router import router as scan_router
from app.neo4j_driver import close_neo4j_driver


@asynccontextmanager
async def lifespan(app: FastAPI):
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
