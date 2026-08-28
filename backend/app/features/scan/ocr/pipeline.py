"""PaddleOCR business card pipeline, adapted from move_ocr/run_cards.py to run
on in-memory image bytes inside a FastAPI request instead of a CLI script over a
folder of files.
"""

import os
import threading
from io import BytesIO

os.environ.setdefault("FLAGS_use_mkldnn", "0")
# Skips PaddleX's "checking connectivity to the model hosters" network round-trip on
# every cold start — models are already cached locally (see _get_ocr below), so that
# check only adds latency. Without this, a client's first scan after backend startup
# can take long enough to blow past the app's request timeout and surface as a
# "network error" even though the backend eventually finishes the OCR successfully.
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.features.scan.ocr.card_detect import crop_by_text_cluster, detect_cards
from app.features.scan.ocr.card_parser import parse_fields

MAX_SIDE = 1800  # downscale above this to avoid native OCR engine crashes on huge photos

_ocr = None
_ocr_lock = threading.Lock()


def _get_ocr():
    # Loaded lazily (not at import time) since building it loads PaddleOCR's models,
    # which is slow and should not happen on every worker startup / test import. Each
    # request runs in its own threadpool thread (see ScanService), so two requests
    # racing to build the singleton on first use is a real possibility without the lock.
    global _ocr
    if _ocr is None:
        with _ocr_lock:
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


def warmup() -> None:
    """Builds the OCR singleton now instead of on the first real request.

    Intended for the FastAPI lifespan startup hook (app/main.py) — a real server
    process, not test/import time, which is why this stays a separate opt-in call
    rather than happening at module import.
    """
    _get_ocr()


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


def _ocr_predict(
    ocr, image: np.ndarray
) -> tuple[list[str], list[tuple[int, int, int, int]], np.ndarray]:
    result = ocr.predict(image)
    if not result:
        return [], [], image
    r0 = result[0]
    lines = list(r0["rec_texts"])
    boxes = [tuple(int(v) for v in b) for b in r0.get("rec_boxes", [])]
    # use_doc_orientation_classify=True (see _get_ocr) already corrects for a
    # sideways/upside-down card before reading it — that correction just never made it
    # back into the image we save. `rot_img` is that same corrected image (a no-op
    # rotation when the card was already upright), so using it here instead of the raw
    # `image` we were given fixes the saved card photo the same way the recognized text
    # already benefits from, at no extra inference cost.
    dpr = r0.get("doc_preprocessor_res")
    corrected = dpr["rot_img"] if dpr is not None else image
    return lines, boxes, corrected


class OcrPipelineResult:
    def __init__(self, fields: dict, etc: list[str], raw_lines: list[str], image_bytes: bytes):
        self.fields = fields
        self.etc = etc
        self.raw_lines = raw_lines
        # The corrected (contour-detected + perspective-warped, or text-cluster-cropped)
        # card image actually used for OCR — not the original photo — re-encoded to JPEG
        # so ScanService can offer it for saving alongside the recognized fields.
        self.image_bytes = image_bytes


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

    lines, boxes, crop = _ocr_predict(ocr, crop)

    # Contour detection failed (e.g. weak card/background contrast) — retry against
    # just the region where OCR found text clustered together. `boxes` are in `crop`'s
    # coordinate frame (post orientation-correction, since that's what detection actually
    # ran against), so this has to crop from `crop`, not the original `image`.
    if not contour_detected and boxes:
        text_crop = crop_by_text_cluster(crop, boxes)
        if text_crop is not None:
            cluster_lines, _, cluster_crop = _ocr_predict(ocr, text_crop)
            if cluster_lines:
                lines = cluster_lines
                crop = cluster_crop  # the (orientation-corrected) region fields were actually read from

    fields, etc = parse_fields(lines)
    ok, encoded = cv2.imencode(".jpg", crop)
    image_bytes = encoded.tobytes() if ok else b""
    return OcrPipelineResult(fields=fields, etc=etc, raw_lines=lines, image_bytes=image_bytes)
