from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.image_store import person_image_path
from cardcreate.card_detection import crop_to_card
from cardcreate.client import ComfyUIClient
from cardcreate.config import settings
from cardcreate.image_utils import fill_crop_to_ratio
from cardcreate.overlay import draw_text_fields
from cardcreate.preprocessing import remove_faint_overlay
from cardcreate.repository import CardRecord, SourceImageMissingError, fetch_card_data
from cardcreate.schemas import GameCardData
from cardcreate.storage import save_illustration
from cardcreate.text_removal import remove_hallucinated_text
from cardcreate.workflow import build_id_card_workflow


def _prepare_source(source_bytes: bytes) -> bytes:
    """CPU-bound: crop the photo down to the card and strip faint watermarks."""
    card_only = crop_to_card(source_bytes)
    return remove_faint_overlay(
        card_only,
        settings.watermark_blur_radius,
        settings.watermark_amplitude_threshold,
    )


def _finalize_card(raw_result: bytes, text: GameCardData) -> bytes:
    """CPU-bound: fit the generated art to the card frame, erase any text the
    model hallucinated, then overlay the real battle-card text."""
    card_bytes = fill_crop_to_ratio(raw_result, settings.output_width, settings.output_height)
    card_bytes = remove_hallucinated_text(card_bytes)
    return draw_text_fields(card_bytes, text)


class IdCardService:
    def __init__(self, db: AsyncSession, client: ComfyUIClient | None = None):
        self.db = db
        self.client = client or ComfyUIClient(settings)

    async def generate(self, card_id: int) -> bytes:
        """Generate the battle-card image for ``card_id``.

        Reads the card + contact from the DB, generates the card art from the
        contact's saved business-card photo, overlays the contact's
        name/company/job class and the card's grade/cost/final stats/skill/
        passive/flavor text, then stores the result and writes its path to
        ``battle_cards.illustration_url``.

        The OpenCV / PIL steps are CPU-bound and synchronous, so they run on a
        worker thread (like the scan feature's OCR) - a single request must not
        stall the event loop for the seconds-to-minutes the pipeline takes.
        """
        record = await fetch_card_data(self.db, card_id)
        source_bytes = await run_in_threadpool(self._load_source_image, record)

        cleaned_bytes = await run_in_threadpool(_prepare_source, source_bytes)
        uploaded_name = await self.client.upload_image(cleaned_bytes, record.image_path)
        workflow = build_id_card_workflow(uploaded_name, settings)
        prompt_id = await self.client.queue_prompt(workflow)
        raw_result = await self.client.wait_for_image(prompt_id)
        card_bytes = await run_in_threadpool(_finalize_card, raw_result, record.text)

        # NOTE (PR #64 review): writing battle_cards.illustration_url from here
        # reaches into another feature's table. The intended path is to call the
        # game feature's `PUT /game/cards/{id}/art` (or GameService.set_illustration)
        # once this module lands; kept as a direct write while it is a draft.
        record.card.illustration_url = await run_in_threadpool(
            save_illustration, card_id, card_bytes
        )
        await self.db.commit()
        return card_bytes

    @staticmethod
    def _load_source_image(record: CardRecord) -> bytes:
        # image_path is guaranteed non-NULL by fetch_card_data; this only
        # guards against the file having gone missing on disk.
        try:
            return person_image_path(record.image_path).read_bytes()
        except FileNotFoundError as exc:
            raise SourceImageMissingError(record.card.id) from exc
