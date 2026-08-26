from fastapi import APIRouter, UploadFile

from app.features.scan.schemas import OcrBatchResponse, OcrResponse, ParseRequest, ParseResponse
from app.features.scan.service import ScanService

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"feature": "scan", "status": "ok"}


@router.post("/ocr")
async def scan_ocr(image: UploadFile) -> OcrResponse:
    return await ScanService().process_image(image)


@router.post("/ocr/batch")
async def scan_ocr_batch(images: list[UploadFile]) -> OcrBatchResponse:
    return await ScanService().process_batch(images)


@router.post("/parse")
async def scan_parse(request: ParseRequest) -> ParseResponse:
    return await ScanService().parse(request)
