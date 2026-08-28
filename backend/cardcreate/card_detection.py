from io import BytesIO

import cv2
import numpy as np
from PIL import Image

_GRABCUT_ITERATIONS = 5
_MARGIN_FRACTION = 0.08
_MIN_AREA_FRACTION = 0.05

# Skin-tone ranges (YCrCb and HSV) used to carve fingers/hand out of the
# foreground mask when they overlap the card. Skipped when skin covers most
# of the foreground (_MAX_SKIN_FRACTION) - a warm-toned card (gold, tan) can
# read as "skin" too, and this stops that false positive from wiping out the
# whole card instead of just an actual hand.
_SKIN_YCRCB_RANGE = ((0, 130, 75), (255, 180, 135))
_SKIN_HSV_RANGE = ((0, 15, 60), (25, 200, 255))
_MAX_SKIN_FRACTION = 0.6


def _skin_mask(bgr: np.ndarray) -> np.ndarray:
    ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    mask = cv2.bitwise_or(
        cv2.inRange(ycrcb, *_SKIN_YCRCB_RANGE), cv2.inRange(hsv, *_SKIN_HSV_RANGE)
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    return cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=2)


def _order_points(points: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    total = points.sum(axis=1)
    rect[0] = points[np.argmin(total)]
    rect[2] = points[np.argmax(total)]
    diff = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def _warp_to_rect(image: np.ndarray, box: np.ndarray) -> np.ndarray:
    rect = _order_points(box)
    top_left, top_right, bottom_right, bottom_left = rect
    width = int(
        max(np.linalg.norm(bottom_right - bottom_left), np.linalg.norm(top_right - top_left))
    )
    height = int(
        max(np.linalg.norm(top_right - bottom_right), np.linalg.norm(top_left - bottom_left))
    )
    destination = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype="float32"
    )
    matrix = cv2.getPerspectiveTransform(rect, destination)
    return cv2.warpPerspective(image, matrix, (width, height))


def crop_to_card(image_bytes: bytes) -> bytes:
    """Find the business card inside a photographed scene (a hand holding
    it, a tilted card, a blurred background, ...) and perspective-correct it
    to a flat, straight-on crop.

    The edit model otherwise reproduces the whole photographic composition
    (hand included) instead of just the card's printed design - asking it
    via the prompt to ignore the composition didn't work (see README).

    Falls back to the original image untouched if no big enough foreground
    region is found (e.g. the source is already a flat, uncropped card).
    """
    with Image.open(BytesIO(image_bytes)) as pil_image:
        rgb = np.array(pil_image.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    height, width = bgr.shape[:2]

    mask = np.zeros((height, width), np.uint8)
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    margin_x, margin_y = int(width * _MARGIN_FRACTION), int(height * _MARGIN_FRACTION)
    rect = (margin_x, margin_y, width - 2 * margin_x, height - 2 * margin_y)
    cv2.grabCut(
        bgr,
        mask,
        rect,
        background_model,
        foreground_model,
        _GRABCUT_ITERATIONS,
        cv2.GC_INIT_WITH_RECT,
    )

    foreground = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype("uint8")
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))

    foreground_area = cv2.countNonZero(foreground)
    if foreground_area:
        skin = cv2.bitwise_and(foreground, _skin_mask(bgr))
        if cv2.countNonZero(skin) / foreground_area <= _MAX_SKIN_FRACTION:
            foreground = cv2.bitwise_and(foreground, cv2.bitwise_not(skin))
            foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((11, 11), np.uint8))

    contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image_bytes

    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < _MIN_AREA_FRACTION * width * height:
        return image_bytes

    # minAreaRect (not approxPolyDP-to-4-points) - it always yields a proper
    # rectangle, so point ordering never degenerates into a broken transform
    # the way it did for an irregular/non-rectangular contour approximation.
    box = cv2.boxPoints(cv2.minAreaRect(largest)).astype("float32")
    cropped_bgr = _warp_to_rect(bgr, box)

    cropped_rgb = cv2.cvtColor(cropped_bgr, cv2.COLOR_BGR2RGB)
    buffer = BytesIO()
    Image.fromarray(cropped_rgb).save(buffer, format="PNG")
    return buffer.getvalue()
