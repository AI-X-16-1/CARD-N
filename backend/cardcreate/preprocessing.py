from io import BytesIO

from PIL import Image, ImageChops, ImageFilter


def remove_faint_overlay(image_bytes: bytes, blur_radius: int, amplitude_threshold: int) -> bytes:
    """Suppress a faint, semi-transparent repeated overlay (e.g. a stock-photo
    preview watermark) before the card goes into img2img - the edit model
    otherwise reproduces it faithfully via reference-latent conditioning.

    Each pixel is compared against a locally blurred estimate of the
    background: low-amplitude deviations (the watermark) fall back to that
    blurred estimate, while strong-contrast deviations (real text/graphics)
    are kept as-is.
    """
    with Image.open(BytesIO(image_bytes)) as image:
        rgb = image.convert("RGB")
        blurred = rgb.filter(ImageFilter.GaussianBlur(blur_radius))

        channels = []
        for original_channel, blurred_channel in zip(rgb.split(), blurred.split()):
            diff = ImageChops.difference(original_channel, blurred_channel)
            mask = diff.point(lambda p: 255 if p > amplitude_threshold else 0)
            channels.append(Image.composite(original_channel, blurred_channel, mask))
        cleaned = Image.merge("RGB", channels)

        buffer = BytesIO()
        cleaned.save(buffer, format="PNG")
        return buffer.getvalue()
