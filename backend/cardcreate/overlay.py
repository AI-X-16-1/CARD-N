from functools import cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from cardcreate.schemas import GameCardData

# Pillow's built-in default font has no Hangul glyphs (renders tofu boxes for
# Korean text), so a bundled font is used instead - see fonts/README.md.
_FONT_PATH = Path(__file__).parent / "fonts" / "NotoSansKR-Variable.ttf"

# The generated card is output_width x output_height (1000x1600 by default).
# Every coordinate below is in that space. These are deliberately rough
# starting positions - tune them by hand once the real card frame art exists.
_CARD_WIDTH = 1000

_TEXT_COLOR = (20, 20, 20)
# Every glyph is drawn with a light outline instead of sitting on a background
# panel. The model's card art is unpredictable - light grey on one seed, dark
# navy on the next - so near-black text needs its own contrast. A per-glyph
# stroke keeps it readable on any background without a panel rectangle that
# has to be positioned per zone.
_TEXT_STROKE_COLOR = (255, 255, 255)
_TEXT_STROKE_RATIO = 0.06  # stroke width as a fraction of the font size
_TEXT_STROKE_MIN = 2

_FONT_WEIGHT = 700  # bold (the font's variable weight axis runs 100-900)
_FONT_SHRINK_STEP = 2
_MIN_FONT_RATIO = 0.5  # a line never shrinks below this fraction of its base size
_LINE_SPACING = 1.3

# --- per-zone layout -------------------------------------------------------
# COST badge (top-left) and GRADE stars (top-right).
_COST_POS = (56, 40)
_COST_SIZE = 76
_GRADE_RIGHT = 944
_GRADE_TOP = 44
_GRADE_SIZE = 64
_MAX_GRADE_STARS = 6
_GRADE_COLOR = (255, 199, 0)  # the ★ run is drawn in gold, not the near-black text color

# Name / company / job-class stack. Starts to the right of the avatar-icon
# placeholder the generation prompt puts in the top-left corner.
_IDENTITY_X = 300
_NAME_POS = (300, 220)
_NAME_SIZE = 116
_COMPANY_SIZE = 52
_JOB_CLASS_SIZE = 52

# ATK / DEF / INT / HP row (from battle_cards.final_stats).
_STAT_ROW_Y = 930
_STAT_LABEL_SIZE = 40
_STAT_VALUE_SIZE = 78
_STAT_CENTERS = (175, 405, 635, 865)

# Skill name + effect block (from battle_cards.skill).
_SKILL_NAME_POS = (64, 1155)
_SKILL_NAME_SIZE = 60
_SKILL_EFFECT_POS = (64, 1240)
_SKILL_EFFECT_SIZE = 42
_SKILL_TEXT_WIDTH = 872
_SKILL_COST_SUFFIX = "  ·  코스트 {cost}"

# Passive line near the bottom.
_PASSIVE_POS = (64, 1390)
_PASSIVE_SIZE = 60
_PASSIVE_PREFIX = "패시브 · "

# Flavor text, very bottom.
_FLAVOR_POS = (64, 1470)
_FLAVOR_SIZE = 42
_FLAVOR_TEXT_WIDTH = 872


@cache
def _load_font(size: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(_FONT_PATH), size=size)
    font.set_variation_by_axes([_FONT_WEIGHT])
    return font


def _stroke_width(font: ImageFont.FreeTypeFont) -> int:
    return max(_TEXT_STROKE_MIN, round(font.size * _TEXT_STROKE_RATIO))


def _draw_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    *,
    fill: tuple[int, int, int] = _TEXT_COLOR,
    stroke_fill: tuple[int, int, int] = _TEXT_STROKE_COLOR,
) -> None:
    """Draw one bold run with an outline for contrast. Defaults to near-black
    text with a light outline; pass `fill` / `stroke_fill` to override (e.g.
    the gold grade stars)."""
    draw.text(
        xy,
        text,
        font=font,
        fill=fill,
        stroke_width=_stroke_width(font),
        stroke_fill=stroke_fill,
    )


def _fit_font(
    draw: ImageDraw.ImageDraw, text: str, base_size: int, max_width: int
) -> ImageFont.FreeTypeFont:
    """Shrink the font until `text` fits `max_width`, down to a floor - so a
    long line (e.g. a bilingual position) doesn't run off the card edge."""
    size = base_size
    min_size = max(int(base_size * _MIN_FONT_RATIO), 16)
    while size > min_size:
        font = _load_font(size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= _FONT_SHRINK_STEP
    return _load_font(min_size)


def _wrap_text(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int
) -> list[str]:
    """Greedy word wrap, with a character-level fallback for a single token
    wider than the box (long Korean phrases without spaces)."""
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)

    wrapped: list[str] = []
    for line in lines:
        if draw.textlength(line, font=font) <= max_width:
            wrapped.append(line)
            continue
        chunk = ""
        for char in line:
            if draw.textlength(chunk + char, font=font) <= max_width or not chunk:
                chunk += char
            else:
                wrapped.append(chunk)
                chunk = char
        if chunk:
            wrapped.append(chunk)
    return wrapped


def _draw_cost(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    if card.cost is None:
        return
    _draw_text(draw, _COST_POS, str(card.cost), _load_font(_COST_SIZE))


def _draw_grade(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    if card.grade is None:
        return
    stars = max(0, min(card.grade, _MAX_GRADE_STARS))
    text = "★" * stars if stars else "-"
    font = _load_font(_GRADE_SIZE)
    x = _GRADE_RIGHT - draw.textlength(text, font=font)
    _draw_text(draw, (x, _GRADE_TOP), text, font, fill=_GRADE_COLOR, stroke_fill=_TEXT_COLOR)


def _draw_identity(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    max_width = _CARD_WIDTH - _IDENTITY_X - 56
    y = _NAME_POS[1]
    for value, size in (
        (card.name, _NAME_SIZE),
        (card.company, _COMPANY_SIZE),
        (card.job_class, _JOB_CLASS_SIZE),
    ):
        if not value:
            continue
        font = _fit_font(draw, value, size, max_width)
        _draw_text(draw, (_IDENTITY_X, y), value, font)
        y += int(font.size * _LINE_SPACING)


def _draw_stats(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    stats = (
        ("ATK", card.final_stats.atk),
        ("DEF", card.final_stats.defense),
        ("INT", card.final_stats.intelligence),
        ("HP", card.final_stats.hp),
    )
    label_font = _load_font(_STAT_LABEL_SIZE)
    value_font = _load_font(_STAT_VALUE_SIZE)
    value_y = _STAT_ROW_Y + int(_STAT_LABEL_SIZE * _LINE_SPACING)

    for center, (label, value) in zip(_STAT_CENTERS, stats):
        if value is None:
            continue
        value_text = str(value)
        _draw_text(
            draw,
            (center - draw.textlength(label, font=label_font) / 2, _STAT_ROW_Y),
            label,
            label_font,
        )
        _draw_text(
            draw,
            (center - draw.textlength(value_text, font=value_font) / 2, value_y),
            value_text,
            value_font,
        )


def _draw_skill(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    skill = card.skill
    if skill.name:
        title = skill.name
        if skill.cost is not None:
            title += _SKILL_COST_SUFFIX.format(cost=skill.cost)
        name_font = _fit_font(draw, title, _SKILL_NAME_SIZE, _SKILL_TEXT_WIDTH)
        _draw_text(draw, _SKILL_NAME_POS, title, name_font)

    if skill.description:
        effect_font = _load_font(_SKILL_EFFECT_SIZE)
        x, y = _SKILL_EFFECT_POS
        for line in _wrap_text(draw, skill.description, effect_font, _SKILL_TEXT_WIDTH):
            _draw_text(draw, (x, y), line, effect_font)
            y += int(effect_font.size * _LINE_SPACING)


def _draw_passive(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    if not card.passive:
        return
    text = f"{_PASSIVE_PREFIX}{card.passive}"
    font = _fit_font(draw, text, _PASSIVE_SIZE, _CARD_WIDTH - _PASSIVE_POS[0] - 56)
    _draw_text(draw, _PASSIVE_POS, text, font)


def _draw_flavor(draw: ImageDraw.ImageDraw, card: GameCardData) -> None:
    if not card.flavor_text:
        return
    font = _load_font(_FLAVOR_SIZE)
    x, y = _FLAVOR_POS
    for line in _wrap_text(draw, card.flavor_text, font, _FLAVOR_TEXT_WIDTH):
        _draw_text(draw, (x, y), line, font)
        y += int(font.size * _LINE_SPACING)


def draw_text_fields(image_bytes: bytes, card: GameCardData) -> bytes:
    """Overlay the battle-card text (name/company/job class, ATK/DEF/INT/HP,
    skill, grade, cost, passive, flavor text) directly with PIL instead of
    asking the diffusion model to render it: guarantees exact, legible text.

    The layout splits the fields across the natural zones of a portrait card
    - cost top-left, grade top-right, identity in the upper band, the stat
    row in the middle, the skill block below it, and the passive + flavor
    text near the bottom. Positions are rough on purpose (see the constants
    at the top of this module); each glyph gets a light outline so the bold
    dark text stays readable over whatever the model drew behind it.

    Returns the original bytes unchanged if `card` has no renderable fields.
    """
    with Image.open(BytesIO(image_bytes)) as base:
        base = base.convert("RGBA")
        overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        _draw_cost(draw, card)
        _draw_grade(draw, card)
        _draw_identity(draw, card)
        _draw_stats(draw, card)
        _draw_skill(draw, card)
        _draw_passive(draw, card)
        _draw_flavor(draw, card)

        if not overlay.getbbox():
            return image_bytes

        composited = Image.alpha_composite(base, overlay).convert("RGB")

        buffer = BytesIO()
        composited.save(buffer, format="PNG")
        return buffer.getvalue()
