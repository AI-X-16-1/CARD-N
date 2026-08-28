import math
from io import BytesIO

from PIL import Image, ImageDraw

from cardcreate.card_detection import crop_to_card


def _photo_with_tilted_card() -> bytes:
    image = Image.new("RGB", (300, 300), color=(180, 180, 180))  # background
    card = Image.new("RGB", (160, 100), color=(250, 250, 250))  # the "card"
    ImageDraw.Draw(card).rectangle((10, 10, 149, 89), outline=(0, 0, 0), width=3)
    rotated = card.rotate(20, expand=True, fillcolor=(180, 180, 180))
    position = (
        (image.width - rotated.width) // 2,
        (image.height - rotated.height) // 2,
    )
    image.paste(rotated, position)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_crop_to_card_straightens_and_shrinks_a_tilted_card() -> None:
    result = crop_to_card(_photo_with_tilted_card())

    with Image.open(BytesIO(result)) as cropped:
        # close to the card's own 160x100 size, not the 300x300 full photo
        assert cropped.width < 250
        assert cropped.height < 250
        assert math.isclose(cropped.width / cropped.height, 160 / 100, rel_tol=0.25)


def test_crop_to_card_falls_back_to_original_for_a_blank_image() -> None:
    image = Image.new("RGB", (200, 200), color=(200, 200, 200))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    source = buffer.getvalue()

    assert crop_to_card(source) == source
