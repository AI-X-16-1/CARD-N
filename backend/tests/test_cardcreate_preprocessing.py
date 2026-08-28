from io import BytesIO

from PIL import Image, ImageDraw

from cardcreate.preprocessing import remove_faint_overlay


def test_remove_faint_overlay_suppresses_watermark_but_keeps_strong_content() -> None:
    image = Image.new("RGB", (100, 100), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((10, 10, 49, 49), fill=(0, 0, 0))  # strong-contrast "card content"

    # a faint repeated overlay dot grid over the plain background only
    for x in range(60, 100, 5):
        for y in range(60, 100, 5):
            image.putpixel((x, y), (235, 235, 235))

    buffer = BytesIO()
    image.save(buffer, format="PNG")

    cleaned_bytes = remove_faint_overlay(buffer.getvalue(), blur_radius=6, amplitude_threshold=25)

    with Image.open(BytesIO(cleaned_bytes)) as cleaned:
        # strong content stays intact
        assert cleaned.getpixel((25, 25))[0] < 50
        # the faint watermark dot is pulled back toward the white background
        assert cleaned.getpixel((60, 60))[0] > 245
