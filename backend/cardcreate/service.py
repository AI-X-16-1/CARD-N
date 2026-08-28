from sqlalchemy.ext.asyncio import AsyncSession

from app.core.image_store import person_image_path
from cardcreate.card_detection import crop_to_card
from cardcreate.client import ComfyUIClient
from cardcreate.config import settings
from cardcreate.image_utils import fill_crop_to_ratio
from cardcreate.overlay import draw_text_fields
from cardcreate.preprocessing import remove_faint_overlay
from cardcreate.repository import CardRecord, SourceImageMissingError, fetch_card_data
from cardcreate.storage import save_illustration
from cardcreate.text_removal import remove_hallucinated_text
from cardcreate.workflow import build_id_card_workflow


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
        """
        record = await fetch_card_data(self.db, card_id)
        source_bytes = self._load_source_image(record)

        card_only_bytes = crop_to_card(source_bytes)
        cleaned_bytes = remove_faint_overlay(
            card_only_bytes,
            settings.watermark_blur_radius,
            settings.watermark_amplitude_threshold,
        )
        uploaded_name = await self.client.upload_image(cleaned_bytes, record.image_path)
        workflow = build_id_card_workflow(uploaded_name, settings)
        prompt_id = await self.client.queue_prompt(workflow)
        raw_result = await self.client.wait_for_image(prompt_id)
        card_bytes = fill_crop_to_ratio(raw_result, settings.output_width, settings.output_height)
        card_bytes = remove_hallucinated_text(card_bytes)
        card_bytes = draw_text_fields(card_bytes, record.text)

        record.card.illustration_url = save_illustration(card_id, card_bytes)
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
