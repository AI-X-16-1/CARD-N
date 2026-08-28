import math
from io import BytesIO

import pytest
from PIL import Image, ImageDraw

from cardcreate.card_detection import _order_points, crop_to_card


def _photo_with_tilted_card(angle: int = 20) -> bytes:
    image = Image.new("RGB", (400, 400), color=(180, 180, 180))  # background
    card = Image.new("RGB", (160, 100), color=(250, 250, 250))  # the "card"
    ImageDraw.Draw(card).rectangle((10, 10, 149, 89), outline=(0, 0, 0), width=3)
    rotated = card.rotate(angle, expand=True, fillcolor=(180, 180, 180))
    position = (
        (image.width - rotated.width) // 2,
        (image.height - rotated.height) // 2,
    )
    image.paste(rotated, position)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.parametrize("angle", [20, 45])
def test_crop_to_card_straightens_and_shrinks_a_tilted_card(angle: int) -> None:
    result = crop_to_card(_photo_with_tilted_card(angle))

    with Image.open(BytesIO(result)) as cropped:
        # close to the card's own 160x100 size, not the full photo
        assert cropped.width < 300
        assert cropped.height < 300
        assert math.isclose(cropped.width / cropped.height, 160 / 100, rel_tol=0.3)


def test_order_points_stays_a_proper_quad_at_45_degrees() -> None:
    # a square rotated 45 deg: the old x+y / x-y heuristic tied two corners
    # together and collapsed the quad.
    diamond = [(0.0, -10.0), (10.0, 0.0), (0.0, 10.0), (-10.0, 0.0)]

    ordered = _order_points(diamond)

    assert len({tuple(p) for p in ordered}) == 4  # no corner collapsed onto another
    assert ordered[0].tolist() == [0.0, -10.0]  # top-left-most starts the run


def test_crop_to_card_falls_back_to_original_for_a_blank_image() -> None:
    image = Image.new("RGB", (200, 200), color=(200, 200, 200))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    source = buffer.getvalue()

    assert crop_to_card(source) == source
