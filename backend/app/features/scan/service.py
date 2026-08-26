from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

from app.features.scan.ocr.pipeline import OcrPipelineResult, extract_business_card
from app.features.scan.schemas import (
    OcrBatchItemResponse,
    OcrBatchResponse,
    OcrFieldResponse,
    OcrResponse,
    ParsedPerson,
    ParseRequest,
    ParseResponse,
)

# card_parser.py classifies fields but does not score them per instance. In place of a
# real per-field confidence, we use the field-type accuracy measured across move_ocr's
# validation set (see move_ocr/README.md) — a fixed value per field type rather than a
# fabricated per-request number. This is what drives the >=90% "needs review" split in
# ui-spec.md §3-2.
FIELD_CONFIDENCE: dict[str, float] = {
    "name": 0.98,
    "company": 0.955,
    "title": 0.935,
    "department": 0.865,
    "phone": 0.965,
    "postal_code": 0.93,
    "region": 0.93,
    "address": 0.93,
    "email": 0.90,
}

FIELD_LABELS: dict[str, str] = {
    "name": "Name",
    "company": "Company",
    "title": "Title",
    "department": "Department",
    "phone": "Mobile",
    "postal_code": "Postal Code",
    "region": "Region",
    "address": "Address",
    "email": "Email",
}


def _to_field_responses(fields: dict[str, str | None]) -> list[OcrFieldResponse]:
    return [
        OcrFieldResponse(
            label=FIELD_LABELS[key],
            value=value,
            confidence=FIELD_CONFIDENCE[key],
        )
        for key, value in fields.items()
        if value
    ]


def _to_ocr_response(result: OcrPipelineResult) -> OcrResponse:
    return OcrResponse(
        fields=_to_field_responses(result.fields),
        raw_text="\n".join(result.raw_lines),
    )


class ScanService:
    async def process_image(self, image: UploadFile) -> OcrResponse:
        image_bytes = await image.read()
        # card detection + PaddleOCR inference are CPU-bound and synchronous —
        # run off the event loop so one scan doesn't stall other requests.
        result = await run_in_threadpool(extract_business_card, image_bytes)
        return _to_ocr_response(result)

    async def process_batch(self, images: list[UploadFile]) -> OcrBatchResponse:
        items = []
        for image in images:
            image_bytes = await image.read()
            result = await run_in_threadpool(extract_business_card, image_bytes)
            ocr_response = _to_ocr_response(result)
            items.append(
                OcrBatchItemResponse(
                    filename=image.filename or "",
                    fields=ocr_response.fields,
                    raw_text=ocr_response.raw_text,
                )
            )
        return OcrBatchResponse(items=items)

    async def parse(self, request: ParseRequest) -> ParseResponse:
        # Reverses _to_field_responses: user-edited (label, value) pairs from the
        # ScanResultScreen -> a structured person record.
        label_to_key = {label: key for key, label in FIELD_LABELS.items()}
        values = {field.label: field.value for field in request.fields}

        person_kwargs: dict[str, str] = {}
        for label, value in values.items():
            key = label_to_key.get(label)
            if key in ("name", "company", "department", "title", "phone", "email", "address"):
                person_kwargs[key] = value

        # job_class / grade (per api-spec.md's /scan/parse example) classify the role
        # and seniority conveyed by title/department into the game feature's 8 job
        # classes and 6 grades (docs/game-rules.md). That classification isn't part of
        # the ported card_parser.py (which only extracts the raw text), so it's left
        # out here rather than guessed.
        return ParseResponse(
            person=ParsedPerson(**person_kwargs, context=request.context)
        )
