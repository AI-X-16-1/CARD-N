from io import BytesIO

from PIL import Image, ImageDraw

from cardcreate.overlay import _fit_font, _wrap_text, draw_text_fields
from cardcreate.schemas import CardSkill, CardStats, GameCardData


def _blank_card_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (1000, 1600), color=(120, 120, 120)).save(buffer, format="PNG")
    return buffer.getvalue()


def _row_changed(image: Image.Image, y: int) -> bool:
    return any(image.getpixel((x, y)) != (120, 120, 120) for x in range(20, 980))


def _any_row_changed(image: Image.Image, y0: int, y1: int) -> bool:
    return any(_row_changed(image, y) for y in range(y0, y1))


def _sample_card() -> GameCardData:
    return GameCardData(
        name="홍길동",
        company="주식회사 카드엔",
        job_class="마케팅",
        grade=4,
        cost=4,
        final_stats=CardStats(atk=9, defense=4, intelligence=8, hp=13),
        skill=CardSkill(name="캠페인", cost=2, description="아군 전체 ATK +2 (영구)"),
        passive="트렌드세터",
        flavor_text="트렌드는 내가 만든다",
    )


def test_draw_text_fields_keeps_the_card_size() -> None:
    result = draw_text_fields(_blank_card_bytes(), _sample_card())

    with Image.open(BytesIO(result)) as image:
        assert image.size == (1000, 1600)


def test_draw_text_fields_writes_into_the_identity_and_stat_zones() -> None:
    result = draw_text_fields(_blank_card_bytes(), _sample_card())

    with Image.open(BytesIO(result)) as image:
        assert _any_row_changed(image, 150, 420)  # name / company / job class
        assert _any_row_changed(image, 960, 1120)  # ATK/DEF/INT/HP row
        assert _any_row_changed(image, 1120, 1320)  # skill block
        assert _any_row_changed(image, 1420, 1580)  # passive + flavor text


def test_draw_text_fields_with_no_fields_leaves_the_card_unchanged() -> None:
    source = _blank_card_bytes()

    result = draw_text_fields(source, GameCardData())

    with Image.open(BytesIO(result)) as image, Image.open(BytesIO(source)) as original:
        assert list(image.getdata()) == list(original.convert("RGB").getdata())


def test_fit_font_shrinks_a_line_too_wide_for_its_zone() -> None:
    draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    long_text = "Senior Backend Engineer / Platform Team"

    font = _fit_font(draw, long_text, base_size=60, max_width=800)

    assert font.size < 60
    assert draw.textlength(long_text, font=font) <= 800


def test_wrap_text_breaks_a_long_effect_into_lines_that_fit() -> None:
    draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    font = _fit_font(draw, "x", base_size=42, max_width=9999)
    text = "상대 필드의 무작위 카드 한 장에게 INT + 3 만큼의 피해를 입힌다"

    lines = _wrap_text(draw, text, font, max_width=300)

    assert len(lines) > 1
    assert all(draw.textlength(line, font=font) <= 300 for line in lines)
