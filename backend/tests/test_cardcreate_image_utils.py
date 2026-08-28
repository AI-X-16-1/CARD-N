from io import BytesIO

from PIL import Image, ImageDraw

from cardcreate.image_utils import fill_crop_to_ratio, trim_background


def _png_bytes(width: int, height: int) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), color=(255, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_fill_crop_to_ratio_fills_target_box_exactly() -> None:
    source = _png_bytes(400, 300)  # a wide source image
    result = fill_crop_to_ratio(source, target_width=1000, target_height=1600)

    with Image.open(BytesIO(result)) as image:
        assert image.size == (1000, 1600)


def test_fill_crop_to_ratio_handles_tall_source() -> None:
    source = _png_bytes(300, 900)  # a tall source image
    result = fill_crop_to_ratio(source, target_width=1000, target_height=1600)

    with Image.open(BytesIO(result)) as image:
        assert image.size == (1000, 1600)


def test_trim_background_crops_to_the_non_background_content() -> None:
    image = Image.new("RGB", (200, 200), color=(220, 220, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle((50, 80, 149, 119), fill=(10, 10, 10))  # a 100x40 "card"

    trimmed = trim_background(image)

    assert trimmed.size == (100, 40)


def test_trim_background_ignores_sparse_watermark_noise() -> None:
    image = Image.new("RGB", (200, 200), color=(220, 220, 220))
    draw = ImageDraw.Draw(image)
    draw.rectangle((50, 80, 149, 119), fill=(10, 10, 10))  # a 100x40 "card"

    # a sparse dot grid outside the card, like a tiled watermark pattern
    for x in range(0, 200, 20):
        for y in range(0, 200, 20):
            if not (50 <= x <= 149 and 80 <= y <= 119):
                image.putpixel((x, y), (10, 10, 10))

    trimmed = trim_background(image)

    assert trimmed.size == (100, 40)


def test_trim_background_leaves_a_uniform_image_untouched() -> None:
    image = Image.new("RGB", (200, 200), color=(220, 220, 220))

    trimmed = trim_background(image)

    assert trimmed.size == (200, 200)
