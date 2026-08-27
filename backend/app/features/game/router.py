from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.features.game.schemas import (
    BattleCardResponse,
    CreateCardRequest,
    DeckResponse,
    UpdateDeckRequest,
)
from app.features.game.service import GameService

router = APIRouter()


def _service(db: AsyncSession = Depends(get_db)) -> GameService:
    return GameService(db)


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "game", "status": "ok"}


@router.get("/cards", response_model=list[BattleCardResponse])
async def list_cards(service: GameService = Depends(_service)) -> list[BattleCardResponse]:
    return await service.list_cards()


@router.post("/cards", response_model=BattleCardResponse, status_code=201)
async def create_card(
    data: CreateCardRequest, service: GameService = Depends(_service)
) -> BattleCardResponse:
    return await service.create_card(data.person_id)


@router.get("/cards/{card_id}", response_model=BattleCardResponse)
async def get_card(card_id: int, service: GameService = Depends(_service)) -> BattleCardResponse:
    return await service.get_card(card_id)


@router.post("/cards/{card_id}/flavor", response_model=BattleCardResponse)
async def regenerate_flavor(
    card_id: int, service: GameService = Depends(_service)
) -> BattleCardResponse:
    return await service.regenerate_flavor(card_id)


@router.get("/deck", response_model=DeckResponse)
async def get_deck(service: GameService = Depends(_service)) -> DeckResponse:
    return await service.get_deck()


@router.put("/deck", response_model=DeckResponse)
async def update_deck(
    data: UpdateDeckRequest, service: GameService = Depends(_service)
) -> DeckResponse:
    return await service.update_deck(data.card_ids)
