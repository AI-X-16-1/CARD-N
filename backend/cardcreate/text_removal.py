from io import BytesIO

import cv2
import numpy as np
from PIL import Image

# blackhat + tophat isolate small-scale dark / light detail (character
# strokes) and ignore anything larger than the kernel - a solid colour band, a
# big logo shape, the card background itself. This catches text of either
# polarity (dark-on-light and light-on-dark) without OCR.
_DETAIL_KERNEL_SIZE = (35, 35)
_INK_THRESHOLD = 26

# Merge the strokes of one text line into a single blob. A business card the
# edit model half-reproduces often has text running vertically up an edge or
# at an angle, so strokes are merged both ways and whichever pass yields a
# long, thin blob wins.
_H_LINE_KERNEL = (61, 9)
_V_LINE_KERNEL = (9, 61)

_MIN_AREA = 200
_MIN_ASPECT = 1.25  # a text line is much longer than it is thick, on some axis
_MIN_EDGE_DENSITY = 0.04  # text is packed with stroke edges; a solid shape / band is not

# Repaint only the dilated strokes, never the whole bounding box - a filled
# rectangle over a reproduced paragraph leaves an obvious flat patch, whereas
# inpainting thin strokes keeps the background between the lines intact.
_STROKE_DILATE = 7
_INPAINT_RADIUS = 4


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    """Binary mask of text-scale strokes, regardless of ink/background polarity."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, _DETAIL_KERNEL_SIZE)
    detail = cv2.max(
        cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel),  # dark strokes on light
        cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel),  # light strokes on dark
    )
    _, ink = cv2.threshold(detail, _INK_THRESHOLD, 255, cv2.THRESH_BINARY)
    return ink


def _text_line_boxes(ink: np.ndarray, gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    edges = cv2.Canny(gray, 50, 150)
    boxes: list[tuple[int, int, int, int]] = []
    for kernel_size, horizontal in ((_H_LINE_KERNEL, True), (_V_LINE_KERNEL, False)):
        merged = cv2.morphologyEx(
            ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, kernel_size)
        )
        contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w * h <= _MIN_AREA:
                continue
            aspect = w / max(h, 1) if horizontal else h / max(w, 1)
            if aspect <= _MIN_ASPECT:
                continue
            # A solid shape (an avatar silhouette, an icon, a colour band)
            # only has edges around its rim; a text line is edges all through.
            if cv2.countNonZero(edges[y : y + h, x : x + w]) / (w * h) < _MIN_EDGE_DENSITY:
                continue
            boxes.append((x, y, w, h))
    return boxes


def remove_hallucinated_text(image_bytes: bytes) -> bytes:
    """Detect text-shaped marks the edit model drew despite being asked for a
    textless badge, and inpaint them away.

    A blackhat/tophat pass isolates strokes at text scale (dark-on-light and
    light-on-dark) while ignoring anything bigger than the kernel - a solid
    band or a large logo. Strokes are merged into line-level blobs both
    horizontally and vertically, and a blob counts as text only when it is
    long and thin on one axis *and* dense with edges all through (so an avatar
    silhouette, an icon, or a colour band - edges only around the rim - is
    left alone). The dilated strokes - not the bounding boxes - are then
    inpainted, so the background between reproduced lines of text stays intact.

    A large colour graphic that is not text-shaped (e.g. a solid triangle
    logo) is out of scope here - stripping that is the generation prompt's job.
    """
    with Image.open(BytesIO(image_bytes)) as pil_image:
        rgb = np.array(pil_image.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    height, width = bgr.shape[:2]

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    ink = _ink_mask(gray)

    boxes = _text_line_boxes(ink, gray)
    if not boxes:
        return image_bytes

    paint_mask = np.zeros((height, width), np.uint8)
    for x, y, w, h in boxes:
        paint_mask[y : y + h, x : x + w] = cv2.max(
            paint_mask[y : y + h, x : x + w], ink[y : y + h, x : x + w]
        )
    paint_mask = cv2.dilate(
        paint_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (_STROKE_DILATE, _STROKE_DILATE))
    )

    cleaned = cv2.inpaint(bgr, paint_mask, _INPAINT_RADIUS, cv2.INPAINT_TELEA)

    cleaned_rgb = cv2.cvtColor(cleaned, cv2.COLOR_BGR2RGB)
    buffer = BytesIO()
    Image.fromarray(cleaned_rgb).save(buffer, format="PNG")
    return buffer.getvalue()
