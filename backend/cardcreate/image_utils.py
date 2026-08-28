import statistics
from io import BytesIO
from math import ceil

import cv2
import numpy as np
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


def _border_connected_mask(background_like: Image.Image) -> np.ndarray:
    """Bool HxW array, True wherever a border-connected run of "background-like"
    pixels reaches. Follows the actual (possibly L-shaped, off-center) backdrop
    region instead of assuming a simple even margin.

    A 1px synthetic border of background-like is added so one corner seed
    covers the whole real border; ``cv2.floodFill`` then does the fill in C
    with the same 4-connectivity as the old hand-rolled stack.
    """
    arr = np.asarray(background_like, dtype=np.uint8)  # 255 = background-like, 0 = content
    padded = cv2.copyMakeBorder(arr, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    ff_mask = np.zeros((padded.shape[0] + 2, padded.shape[1] + 2), np.uint8)
    cv2.floodFill(padded, ff_mask, (0, 0), 0, loDiff=0, upDiff=0, flags=4)
    # ff_mask marks filled pixels as 1, offset by (1, 1); strip that plus the pad.
    return ff_mask[2:-2, 2:-2].astype(bool)


def trim_background(image: Image.Image, pixel_tolerance: int = 30) -> Image.Image:
    """Crop away the backdrop the model renders around the ID card.

    Diff every pixel against an estimated background color, clean up small
    noise specks (a textured/watermarked backdrop), then flood-fill from the
    image border across the remaining background-like pixels. The card is
    whatever that flood fill can't reach - this follows the backdrop's real
    shape (which isn't always a simple even margin) instead of assuming the
    card sits centered with uniform margins on every side.
    """
    background = Image.new(image.mode, image.size, _estimate_background_color(image))

    diff = ImageChops.difference(image, background).convert("L")
    content_mask = diff.point(lambda p: 255 if p > pixel_tolerance else 0)
    cleaned_content_mask = _open_mask(content_mask)
    background_like = cleaned_content_mask.point(lambda p: 0 if p else 255)

    # The card is whatever the border flood fill can't reach.
    content_ys, content_xs = np.where(~_border_connected_mask(background_like))
    if content_ys.size == 0:
        return image

    return image.crop(
        (
            int(content_xs.min()),
            int(content_ys.min()),
            int(content_xs.max()) + 1,
            int(content_ys.max()) + 1,
        )
    )


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
