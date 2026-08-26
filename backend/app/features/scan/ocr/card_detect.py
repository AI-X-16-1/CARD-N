"""Finds a business-card-shaped rectangle in a photo and warps it flat (same idea as a
document-scanner app). Meant to preprocess photos where the background (desk, keyboard,
etc.) got captured too, or the card is tilted/rotated.
Doesn't train on any specific card design — it's a general-purpose image-processing
technique (contour detection + filtering by the standard card aspect ratio, ~1.6:1), so
no training data is needed.
"""
import cv2
import numpy as np

CARD_RATIO_RANGE = (1.3, 2.3)  # a standard card (90x50mm) is 1.8; allow some slack
MIN_AREA_RATIO = 0.15  # contours smaller than this were mostly false positives in testing
MAX_CARDS = 4  # even if multiple cards are in one photo, too many detections is likely noise


def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def four_point_transform(image, pts):
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    width = max(int(np.linalg.norm(br - bl)), int(np.linalg.norm(tr - tl)))
    height = max(int(np.linalg.norm(tr - br)), int(np.linalg.norm(tl - bl)))
    if width < 10 or height < 10:
        return None
    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype="float32")
    matrix = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, matrix, (width, height))
    # A card should naturally be wider than tall -> rotate 90 degrees if it came out portrait.
    if warped.shape[0] > warped.shape[1]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    return warped


# Card-vs-background contrast varies a lot photo to photo, so a single detection setting
# misses often. Trying several methods/sensitivities and pooling the candidates is safer
# than missing a card (wrong candidates get filtered out by the aspect-ratio check below).
# Each strategy also runs twice, with and without CLAHE (adaptive histogram equalization).
# Applying CLAHE to every photo uniformly actually made detection worse for photos that
# already worked well (confirmed by testing) — but used alongside the original-contrast
# version as a way to "gather more candidates", it purely widens detection coverage
# (wrong candidates get filtered out by the aspect-ratio check below anyway).
EDGE_STRATEGIES = [
    {"mode": "canny_dilate", "low": 40, "high": 120, "kernel": 3, "iters": 2, "clahe": False},  # good contrast (default)
    {"mode": "canny_close", "low": 15, "high": 60, "kernel": 9, "iters": 3, "clahe": False},    # low contrast (bridges broken edges more aggressively)
    {"mode": "canny_dilate", "low": 40, "high": 120, "kernel": 3, "iters": 2, "clahe": True},
    {"mode": "canny_close", "low": 15, "high": 60, "kernel": 9, "iters": 3, "clahe": True},
    {"mode": "adaptive_thresh", "block": 35, "c": 10, "kernel": 7, "iters": 2, "clahe": True},  # uneven lighting
]


def _find_contours_for_strategy(blur, blur_clahe, strat):
    src = blur_clahe if strat["clahe"] else blur
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (strat["kernel"], strat["kernel"]))
    if strat["mode"] == "adaptive_thresh":
        # Thresholds against local neighborhoods, so card edges survive even in
        # photos where lighting is uneven across the frame.
        mask = cv2.adaptiveThreshold(src, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                      cv2.THRESH_BINARY, strat["block"], strat["c"])
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=strat["iters"])
        edges = cv2.Canny(mask, 50, 150)
        edges = cv2.dilate(edges, kernel, iterations=1)
    else:
        edges = cv2.Canny(src, strat["low"], strat["high"])
        if strat["mode"] == "canny_close":
            edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=strat["iters"])
        else:
            edges = cv2.dilate(edges, kernel, iterations=strat["iters"])
    return cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]


def _find_quads(small, small_area):
    quads = []
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    blur_clahe = cv2.GaussianBlur(clahe.apply(gray), (5, 5), 0)

    for strat in EDGE_STRATEGIES:
        contours = _find_contours_for_strategy(blur, blur_clahe, strat)
        for c in contours:
            area = cv2.contourArea(c)
            if area < small_area * MIN_AREA_RATIO:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.03 * peri, True)
            if len(approx) != 4:
                rect = cv2.minAreaRect(c)
                approx = cv2.boxPoints(rect).reshape(-1, 1, 2)
            pts = approx.reshape(4, 2).astype("float32")

            ordered = order_points(pts)
            wA = np.linalg.norm(ordered[1] - ordered[0])
            wB = np.linalg.norm(ordered[2] - ordered[3])
            hA = np.linalg.norm(ordered[3] - ordered[0])
            hB = np.linalg.norm(ordered[2] - ordered[1])
            avg_w, avg_h = (wA + wB) / 2, (hA + hB) / 2
            if avg_w < 5 or avg_h < 5:
                continue
            ratio = max(avg_w, avg_h) / min(avg_w, avg_h)
            if not (CARD_RATIO_RANGE[0] <= ratio <= CARD_RATIO_RANGE[1]):
                continue

            quads.append((area, pts))
    return quads


def _iou_boxes(pts_a, pts_b):
    """Rough overlap (bounding-box IoU) used to filter out duplicate candidates."""
    ax0, ay0 = pts_a.min(axis=0)
    ax1, ay1 = pts_a.max(axis=0)
    bx0, by0 = pts_b.min(axis=0)
    bx1, by1 = pts_b.max(axis=0)
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    inter = max(0, ix1 - ix0) * max(0, iy1 - iy0)
    area_a = (ax1 - ax0) * (ay1 - ay0)
    area_b = (bx1 - bx0) * (by1 - by0)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0


def _union_find_merge(items, should_merge):
    """Groups item indices via union-find, based on should_merge(i, j)."""
    n = len(items)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(n):
        for j in range(i + 1, n):
            if should_merge(i, j):
                union(i, j)
    return [find(i) for i in range(n)]


def _bbox_gap(a, b):
    """Chebyshev-distance gap between two boxes (x0,y0,x1,y1). 0 if they overlap."""
    xgap = max(0, max(a[0], b[0]) - min(a[2], b[2]))
    ygap = max(0, max(a[1], b[1]) - min(a[3], b[3]))
    return max(xgap, ygap)


def cluster_text_boxes(boxes, fine_gap_factor=1.8, merge_size_ratio=0.7):
    """Clusters text box coordinates by proximity, in two passes:
    1) Tightly-packed lines are first grouped into sub-clusters based on text height.
    2) Sub-clusters are merged into one card if "the gap between them is smaller than
       the larger sub-cluster's own size" — this keeps a logo/name block and a contact
       block together even when a card's layout puts whitespace between them, while
       noise that's far outside the card itself (e.g. a keyboard key in the background)
       stays separate.
    Doesn't rely on card-vs-background contrast, so it also works on low-contrast photos.
    boxes: [(x0,y0,x1,y1), ...]. Returns: a list of cluster indices (same length as boxes)."""
    if not boxes:
        return []

    heights = [b[3] - b[1] for b in boxes]
    median_h = sorted(heights)[len(heights) // 2]
    margin = max(median_h * fine_gap_factor, 5)
    inflated = [(b[0] - margin, b[1] - margin, b[2] + margin, b[3] + margin) for b in boxes]

    fine_labels = _union_find_merge(
        boxes,
        lambda i, j: (inflated[i][0] < inflated[j][2] and inflated[j][0] < inflated[i][2]
                      and inflated[i][1] < inflated[j][3] and inflated[j][1] < inflated[i][3]),
    )

    sub_ids = sorted(set(fine_labels))
    sub_boxes = []
    for sid in sub_ids:
        members = [b for b, lbl in zip(boxes, fine_labels) if lbl == sid]
        sub_boxes.append((
            min(b[0] for b in members), min(b[1] for b in members),
            max(b[2] for b in members), max(b[3] for b in members),
        ))

    def sub_should_merge(i, j):
        a, b = sub_boxes[i], sub_boxes[j]
        size_a = max(a[2] - a[0], a[3] - a[1])
        size_b = max(b[2] - b[0], b[3] - b[1])
        return _bbox_gap(a, b) < max(size_a, size_b) * merge_size_ratio

    sub_merge_labels = _union_find_merge(sub_boxes, sub_should_merge)

    sid_to_final = dict(zip(sub_ids, sub_merge_labels))
    return [sid_to_final[lbl] for lbl in fine_labels]


def crop_by_text_cluster(image, boxes, margin_ratio=0.2, min_boxes=3):
    """Fallback for when card contour detection fails. Clusters text boxes and crops
    just the largest cluster (most likely the card body) with some margin. No
    perspective correction, so this is less accurate than card detection, but it still
    strips background noise (e.g. a keyboard) from photos where contrast is too low for
    contour detection to work at all.
    boxes: [(x0,y0,x1,y1), ...] (same coordinate space as the image). Returns None if no
    cluster looks reliable."""
    if len(boxes) < min_boxes:
        return None

    labels = cluster_text_boxes(boxes)
    clusters = {}
    for label, box in zip(labels, boxes):
        clusters.setdefault(label, []).append(box)

    # Pick by total area, not box "count" — small scattered characters (e.g. a keyboard)
    # can outnumber a card's actual body text while covering far less area, so area
    # correctly favors a handful of long text lines over many tiny noise boxes.
    best = max(clusters.values(), key=lambda members: sum((b[2] - b[0]) * (b[3] - b[1]) for b in members))
    if len(best) < min_boxes:
        return None

    x0 = min(b[0] for b in best)
    y0 = min(b[1] for b in best)
    x1 = max(b[2] for b in best)
    y1 = max(b[3] for b in best)

    w, h = x1 - x0, y1 - y0
    mx, my = w * margin_ratio, h * margin_ratio
    ih, iw = image.shape[:2]
    x0 = max(0, int(x0 - mx))
    y0 = max(0, int(y0 - my))
    x1 = min(iw, int(x1 + mx))
    y1 = min(ih, int(y1 + my))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return None
    return image[y0:y1, x0:x1]


def detect_cards(image):
    """image: a BGR ndarray read via cv2. Returns: a list of warped images for each
    region believed to be a business card (empty list if none found)."""
    h, w = image.shape[:2]
    scale = 1000 / max(h, w)
    small = cv2.resize(image, (int(w * scale), int(h * scale)))
    small_area = small.shape[0] * small.shape[1]

    quads = _find_quads(small, small_area)
    quads.sort(key=lambda x: -x[0])

    kept = []
    for area, pts in quads:
        if any(_iou_boxes(pts, kept_pts) > 0.5 for _, kept_pts in kept):
            continue  # a different strategy re-detected the same card — skip the duplicate
        kept.append((area, pts))
        if len(kept) >= MAX_CARDS:
            break

    warped_cards = []
    for _, pts in kept:
        warped = four_point_transform(image, pts / scale)
        if warped is not None:
            warped_cards.append(warped)
    return warped_cards
