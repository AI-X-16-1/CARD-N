from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from cardcreate.text_removal import remove_hallucinated_text

_FONT_PATH = Path(__file__).parents[1] / "cardcreate" / "fonts" / "NotoSansKR-Variable.ttf"


def _png(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _text_card(
    text: str, fg: tuple[int, int, int], bg: tuple[int, int, int], rotate: int = 0
) -> Image.Image:
    image = Image.new("RGB", (640, 300), color=bg)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(_FONT_PATH), size=48)
    draw.text((40, 120), text, font=font, fill=fg)
    return image.rotate(rotate, expand=True, fillcolor=bg) if rotate else image


def _count(image: Image.Image, predicate) -> int:
    w, h = image.size
    return sum(predicate(image.getpixel((x, y))) for x in range(0, w, 2) for y in range(0, h, 2))


def _is_dark(px: tuple[int, ...]) -> bool:
    return px[0] < 90


def _is_light(px: tuple[int, ...]) -> bool:
    return px[0] > 200


def test_remove_hallucinated_text_erases_dark_text_on_light() -> None:
    source = _text_card("주식회사 카드엔 010-1234-5678", fg=(15, 15, 15), bg=(228, 228, 228))
    before = _count(source, _is_dark)

    with Image.open(BytesIO(remove_hallucinated_text(_png(source)))) as cleaned:
        after = _count(cleaned, _is_dark)

    assert before > 200
    assert after < before * 0.1


def test_remove_hallucinated_text_erases_light_text_on_a_dark_band() -> None:
    source = _text_card("KAYME COMPANY / SEOUL", fg=(238, 238, 238), bg=(22, 22, 22))
    before = _count(source, _is_light)

    with Image.open(BytesIO(remove_hallucinated_text(_png(source)))) as cleaned:
        after = _count(cleaned, _is_light)

    assert before > 200
    assert after < before * 0.1


def test_remove_hallucinated_text_erases_vertical_text() -> None:
    source = _text_card(
        "서울특별시 강남구 테헤란로 201", fg=(20, 20, 20), bg=(230, 230, 230), rotate=90
    )
    before = _count(source, _is_dark)
    assert source.size[1] > source.size[0]  # rotated: a vertical strip

    with Image.open(BytesIO(remove_hallucinated_text(_png(source)))) as cleaned:
        after = _count(cleaned, _is_dark)

    assert before > 200
    assert after < before * 0.15


def test_remove_hallucinated_text_keeps_a_solid_icon() -> None:
    image = Image.new("RGB", (400, 300), color=(220, 220, 220))
    ImageDraw.Draw(image).rectangle((160, 110, 240, 190), fill=(10, 10, 10))  # square icon

    with Image.open(BytesIO(remove_hallucinated_text(_png(image)))) as cleaned:
        assert cleaned.getpixel((200, 150))[0] < 60  # untouched


def test_remove_hallucinated_text_keeps_an_avatar_silhouette() -> None:
    image = Image.new("RGB", (400, 500), color=(235, 235, 235))
    draw = ImageDraw.Draw(image)
    draw.ellipse((150, 60, 250, 160), fill=(95, 95, 95))  # head
    draw.ellipse((110, 175, 290, 430), fill=(95, 95, 95))  # shoulders

    with Image.open(BytesIO(remove_hallucinated_text(_png(image)))) as cleaned:
        assert cleaned.getpixel((200, 110))[0] < 140  # head still there
        assert cleaned.getpixel((200, 300))[0] < 140  # shoulders still there


def test_remove_hallucinated_text_returns_original_when_nothing_detected() -> None:
    source = _png(Image.new("RGB", (200, 200), color=(220, 220, 220)))

    assert remove_hallucinated_text(source) == source
