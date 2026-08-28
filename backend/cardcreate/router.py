# Draft only: not registered in app/main.py yet. This folder sits outside the
# documented feature-ownership table (docs/features.md), so wiring this router
# in requires a separate branch/PR with 2+ approvals per CLAUDE.md.
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from cardcreate.repository import CardDataNotFoundError, SourceImageMissingError
from cardcreate.service import IdCardService

router = APIRouter()


@router.post("/id-card/{card_id}")
async def generate_id_card(card_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    """Generate the battle-card image for ``card_id``.

    The card art is generated from the saved business-card photo of the contact
    the card's ``person_id`` points at (``persons.image_path``) - which must not
    be NULL. The contact's name / company / job class and the card's grade,
    cost, final stats, skill, passive and flavor text are then overlaid on top.
    The finished image is stored and its path saved to
    ``battle_cards.illustration_url``.
    """
    try:
        result = await IdCardService(db).generate(card_id)
    except CardDataNotFoundError:
        raise HTTPException(status_code=404, detail="Battle-card not found") from None
    except SourceImageMissingError:
        raise HTTPException(
            status_code=422, detail="The card's contact has no saved business-card image"
        ) from None
    return Response(content=result, media_type="image/png")
