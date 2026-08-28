import statistics
from io import BytesIO
from math import ceil

from PIL import Image, ImageChops, ImageFilter


def _estimate_background_color(image: Image.Image, border: int = 4) -> tuple[int, ...]:
    """Median color over a thin ring around the whole image border, not just
    the 4 corners - a card that bleeds to one edge (e.g. a graphic touching
    the bottom) only contaminates that one strip of the ring, and the median
    still resolves to the true background as long as most of the perimeter
    is actually background."""
    width, height = image.size
    border = max(1, min(border, width // 2, height // 2))
    regions = [
        (0, 0, width, border),
        (0, height - border, width, height),
        (0, 0, border, height),
        (width - border, 0, width, height),
    ]
    samples = [pixel for box in regions for pixel in image.crop(box).getdata()]
    return tuple(int(statistics.median(channel)) for channel in zip(*samples))


def _open_mask(mask: Image.Image, size: int = 5) -> Image.Image:
    """Morphological opening (erode then dilate): drops small isolated
    specks - e.g. single-pixel watermark noise - while a large solid region
    like the actual card survives essentially unchanged."""
    return mask.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))


def _border_connected_mask(background_like: bytes, width: int, height: int) -> bytearray:
    """Flood fill from every border pixel across connected "background-like"
    pixels. This follows the actual (possibly L-shaped, off-center) backdrop
    region instead of assuming it's a simple margin on every side."""
    visited = bytearray(width * height)
    stack = []

    for x in range(width):
        for idx in (x, (height - 1) * width + x):
            if background_like[idx] and not visited[idx]:
                visited[idx] = 1
                stack.append(idx)
    for y in range(height):
        for idx in (y * width, y * width + width - 1):
            if background_like[idx] and not visited[idx]:
                visited[idx] = 1
                stack.append(idx)

    while stack:
        idx = stack.pop()
        x, y = idx % width, idx // width
        neighbors = []
        if x > 0:
            neighbors.append(idx - 1)
        if x < width - 1:
            neighbors.append(idx + 1)
        if y > 0:
            neighbors.append(idx - width)
        if y < height - 1:
            neighbors.append(idx + width)
        for nidx in neighbors:
            if background_like[nidx] and not visited[nidx]:
                visited[nidx] = 1
                stack.append(nidx)

    return visited


def trim_background(image: Image.Image, pixel_tolerance: int = 30) -> Image.Image:
    """Crop away the backdrop the model renders around the ID card.

    Diff every pixel against an estimated background color, clean up small
    noise specks (a textured/watermarked backdrop), then flood-fill from the
    image border across the remaining background-like pixels. The card is
    whatever that flood fill can't reach - this follows the backdrop's real
    shape (which isn't always a simple even margin) instead of assuming the
    card sits centered with uniform margins on every side.
    """
    width, height = image.size
    background = Image.new(image.mode, image.size, _estimate_background_color(image))

    diff = ImageChops.difference(image, background).convert("L")
    content_mask = diff.point(lambda p: 255 if p > pixel_tolerance else 0)
    cleaned_content_mask = _open_mask(content_mask)
    background_like = cleaned_content_mask.point(lambda p: 0 if p else 255)

    visited = _border_connected_mask(background_like.tobytes(), width, height)

    min_x = max_x = min_y = max_y = None
    for y in range(height):
        row = visited[y * width : (y + 1) * width]
        first = row.find(0)
        if first == -1:
            continue
        last = row.rfind(0)
        min_y = y if min_y is None else min_y
        max_y = y
        min_x = first if min_x is None else min(min_x, first)
        max_x = last if max_x is None else max(max_x, last)

    if min_x is None:
        return image

    return image.crop((min_x, min_y, max_x + 1, max_y + 1))


def fill_crop_to_ratio(image_bytes: bytes, target_width: int, target_height: int) -> bytes:
    """Trim the surrounding background, then scale up to cover a
    target_width x target_height box and center-crop to that exact size so
    the card fills the frame with no letterboxing (e.g. 1000x1600 for a
    10:16 ID card)."""
    with Image.open(BytesIO(image_bytes)) as image:
        image = image.convert("RGB")
        image = trim_background(image)
        src_width, src_height = image.size

        scale = max(target_width / src_width, target_height / src_height)
        scaled_width = ceil(src_width * scale)
        scaled_height = ceil(src_height * scale)
        scaled = image.resize((scaled_width, scaled_height), Image.LANCZOS)

        left = (scaled_width - target_width) // 2
        top = (scaled_height - target_height) // 2
        cropped = scaled.crop((left, top, left + target_width, top + target_height))

        buffer = BytesIO()
        cropped.save(buffer, format="PNG")
        return buffer.getvalue()
