"""PaddleOCR business card pipeline, adapted from move_ocr/run_cards.py to run
on in-memory image bytes inside a FastAPI request instead of a CLI script over a
folder of files.
"""
import os
from io import BytesIO

os.environ.setdefault("FLAGS_use_mkldnn", "0")

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.features.scan.ocr.card_detect import crop_by_text_cluster, detect_cards
from app.features.scan.ocr.card_parser import parse_fields

MAX_SIDE = 1800  # downscale above this to avoid native OCR engine crashes on huge photos

_ocr = None


def _get_ocr():
    # Loaded lazily (not at import time) since building it loads PaddleOCR's models,
    # which is slow and should not happen on every worker startup / test import.
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR

        _ocr = PaddleOCR(
            use_textline_orientation=True,
            use_doc_orientation_classify=True,
            use_doc_unwarping=False,
            enable_mkldnn=False,
            lang="korean",
            text_det_unclip_ratio=1.0,
        )
    return _ocr


def _bytes_to_image(image_bytes: bytes) -> np.ndarray:
    # cv2.imdecode ignores EXIF orientation; PIL's exif_transpose applies it first
    # (smartphone photos are commonly stored rotated with only the EXIF tag saying so).
    pil_img = ImageOps.exif_transpose(Image.open(BytesIO(image_bytes)))
    return cv2.cvtColor(np.array(pil_img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _downscale(image: np.ndarray, max_side: int = MAX_SIDE) -> np.ndarray:
    h, w = image.shape[:2]
    if max(h, w) <= max_side:
        return image
    scale = max_side / max(h, w)
    return cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _ocr_predict(ocr, image: np.ndarray) -> tuple[list[str], list[tuple[int, int, int, int]]]:
    result = ocr.predict(image)
    if not result:
        return [], []
    lines = list(result[0]["rec_texts"])
    boxes = [tuple(int(v) for v in b) for b in result[0].get("rec_boxes", [])]
    return lines, boxes


class OcrPipelineResult:
    def __init__(self, fields: dict, etc: list[str], raw_lines: list[str]):
        self.fields = fields
        self.etc = etc
        self.raw_lines = raw_lines


def extract_business_card(image_bytes: bytes) -> OcrPipelineResult:
    """Runs card detection + OCR + field parsing on one photo.

    Mirrors move_ocr/run_cards.py's per-image pipeline, but only keeps the single
    largest detected card (the mobile capture flow guides the user to frame exactly
    one card — multi-card-per-photo batch scanning is out of scope here).
    """
    ocr = _get_ocr()
    image = _downscale(_bytes_to_image(image_bytes))

    cards = detect_cards(image)
    crop = cards[0] if cards else image
    contour_detected = bool(cards)

    lines, boxes = _ocr_predict(ocr, crop)

    # Contour detection failed (e.g. weak card/background contrast) — retry against
    # just the region where OCR found text clustered together.
    if not contour_detected and boxes:
        text_crop = crop_by_text_cluster(crop, boxes)
        if text_crop is not None:
            cluster_lines, _ = _ocr_predict(ocr, text_crop)
            if cluster_lines:
                lines = cluster_lines

    fields, etc = parse_fields(lines)
    return OcrPipelineResult(fields=fields, etc=etc, raw_lines=lines)
