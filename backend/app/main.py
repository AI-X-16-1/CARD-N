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
