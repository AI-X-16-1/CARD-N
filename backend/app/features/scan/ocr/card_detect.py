"""사진 속에서 명함처럼 생긴 사각형 영역을 찾아 반듯하게 펴서 잘라낸다(문서 스캐너 앱과 같은 원리).
배경(책상, 키보드 등)이 같이 찍혔거나 명함이 기울어진/회전된 사진을 전처리하기 위함.
특정 명함 디자인을 학습한 게 아니라, 윤곽선 검출 + 명함 표준 비율(가로:세로 ≈ 1.6:1) 필터링만 사용하는
범용 이미지 처리 기법이라 별도 학습 데이터가 필요 없다.
"""
import cv2
import numpy as np

CARD_RATIO_RANGE = (1.3, 2.3)  # 표준 명함(90x50mm)은 1.8, 여유를 두고 허용
MIN_AREA_RATIO = 0.15  # 이보다 작은 윤곽선은 실전 테스트 결과 대부분 명함이 아닌 오탐이었음
MAX_CARDS = 4  # 한 사진에 명함이 여러 장 찍혀도 너무 많이 검출되면 노이즈일 가능성이 높음


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
    # 명함은 가로가 더 길어야 자연스러움 -> 세로로 뒤집혀 있으면 90도 회전
    if warped.shape[0] > warped.shape[1]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    return warped


# 사진마다 카드-배경 대비가 달라 한 가지 검출 설정으로는 놓치는 경우가 많다.
# 서로 다른 방식/민감도를 모두 시도해서 후보를 모으는 쪽이 "놓치는 것"보다 안전하다
# (잘못된 후보는 아래 종횡비 검증에서 걸러진다).
# CLAHE(적응형 히스토그램 균일화) 적용 여부별로 같은 전략을 두 번씩 돌린다.
# CLAHE를 전 사진에 일괄 적용하면 이미 잘 잡히던 사진의 검출이 오히려 흔들렸지만(실측 확인),
# 원본 대비 버전과 함께 "후보를 모으는" 방식으로 쓰면 순수하게 검출 범위만 넓어진다
# (틀린 후보는 어차피 아래 종횡비 검증에서 걸러짐).
EDGE_STRATEGIES = [
    dict(mode="canny_dilate", low=40, high=120, kernel=3, iters=2, clahe=False),  # 대비가 뚜렷한 사진용(기본)
    dict(mode="canny_close", low=15, high=60, kernel=9, iters=3, clahe=False),    # 대비가 약한 사진용(끊긴 테두리를 넓게 이어붙임)
    dict(mode="canny_dilate", low=40, high=120, kernel=3, iters=2, clahe=True),
    dict(mode="canny_close", low=15, high=60, kernel=9, iters=3, clahe=True),
    dict(mode="adaptive_thresh", block=35, c=10, kernel=7, iters=2, clahe=True),  # 조명이 고르지 않은 사진용
]


def _find_contours_for_strategy(blur, blur_clahe, strat):
    src = blur_clahe if strat["clahe"] else blur
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (strat["kernel"], strat["kernel"]))
    if strat["mode"] == "adaptive_thresh":
        # 국소 영역 기준으로 이진화 -> 조명이 한쪽으로 치우친 사진에서도 카드 경계가 살아남는다
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
    """대략적인 겹침 정도(직사각형 bounding box 기준 IoU)로 중복 후보를 걸러낸다."""
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
    """items 인덱스들을 should_merge(i,j) 기준으로 합집합-찾기(union-find)로 묶는다."""
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
    """두 사각형(x0,y0,x1,y1) 사이의 간격(체비쇼프 거리). 겹치면 0."""
    xgap = max(0, max(a[0], b[0]) - min(a[2], b[2]))
    ygap = max(0, max(a[1], b[1]) - min(a[3], b[3]))
    return max(xgap, ygap)


def cluster_text_boxes(boxes, fine_gap_factor=1.8, merge_size_ratio=0.7):
    """텍스트 박스 좌표들을 가까운 것끼리 묶는다. 2단계로 진행한다:
    1) 촘촘한 줄들을 글자 높이 기준으로 세부 묶음(sub-cluster)으로 먼저 뭉친다.
    2) 세부 묶음끼리는 "간격이 두 묶음 중 큰 쪽의 크기보다 작으면" 같은 명함으로 보고 합친다 —
       로고/이름 블록과 연락처 블록이 카드 안에서 서로 떨어진 위치에 있어도(디자인상 여백) 하나로
       묶이지만, 키보드 키처럼 카드 자체보다 훨씬 멀리 떨어진 잡음은 별도로 남는다.
    카드-배경 명암 대비에 의존하지 않아 대비가 약한 사진에서도 쓸 수 있다.
    boxes: [(x0,y0,x1,y1), ...]. 반환: 군집 인덱스 리스트(boxes와 같은 길이)."""
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
    """카드 윤곽선 검출이 실패했을 때의 대체 수단. 텍스트 박스들을 군집화해서 가장 큰 군집(명함 본문일
    가능성이 높음)의 영역만 여유를 두고 잘라낸다. 원근 보정은 하지 않으므로 카드 검출보다는 부정확할 수
    있지만, 명암 대비가 약해 윤곽선 검출 자체가 안 되는 사진에서도 배경 잡음(키보드 등)은 제거할 수 있다.
    boxes: [(x0,y0,x1,y1), ...] (이미지와 같은 좌표계). 신뢰할 만한 군집이 없으면 None."""
    if len(boxes) < min_boxes:
        return None

    labels = cluster_text_boxes(boxes)
    clusters = {}
    for label, box in zip(labels, boxes):
        clusters.setdefault(label, []).append(box)

    # 박스 "개수"가 아니라 전체 면적으로 고른다 — 키보드 키처럼 짧고 작은 글자가 여러 개
    # 흩어져 있으면 개수는 많아도 면적은 작아서, 긴 문장 몇 줄로 된 명함 본문에 밀린다.
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
    """image: cv2로 읽은 BGR ndarray. 반환: 명함으로 추정되는 영역을 편 이미지들의 리스트(없으면 빈 리스트)."""
    h, w = image.shape[:2]
    scale = 1000 / max(h, w)
    small = cv2.resize(image, (int(w * scale), int(h * scale)))
    small_area = small.shape[0] * small.shape[1]

    quads = _find_quads(small, small_area)
    quads.sort(key=lambda x: -x[0])

    kept = []
    for area, pts in quads:
        if any(_iou_boxes(pts, kept_pts) > 0.5 for _, kept_pts in kept):
            continue  # 서로 다른 설정이 같은 카드를 중복 검출한 경우 제외
        kept.append((area, pts))
        if len(kept) >= MAX_CARDS:
            break

    warped_cards = []
    for _, pts in kept:
        warped = four_point_transform(image, pts / scale)
        if warped is not None:
            warped_cards.append(warped)
    return warped_cards
