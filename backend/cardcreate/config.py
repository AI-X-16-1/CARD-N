from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_POSITIVE_PROMPT = (
    "Redesign this business card as a sleek modern corporate employee ID badge: "
    "add a small generic flat gray silhouette/avatar icon (head-and-shoulders, "
    "no bigger than the name text next to it) as the only portrait placeholder "
    "- not a real face or photo of a person, and no other silhouette, bust, "
    "profile, or illustration of a person anywhere else on the card. Under no "
    "circumstances render any text, letters, numbers, or characters anywhere "
    "in the image - not the name, not the job title, not the company, not any "
    "label - even though the source card has visible text. Treat every text "
    "region on the source card as a solid blank rectangle in the new design: "
    "the real text is overlaid separately afterward, so the badge itself must "
    "be 100% textless, pure graphic design only (bands, icons, borders, "
    "photo/QR placeholders). A lanyard hole punch at the top. Remove any "
    "watermark text, stock-photo watermark overlays, or repeated tiled "
    "logo/text patterns from the source image - the final design must be "
    "completely clean, with no watermark anywhere. The card fills the entire "
    "frame edge-to-edge with flat, hard-edged borders and no surrounding "
    "background, drop shadow, or vignette of any kind."
)
DEFAULT_NEGATIVE_PROMPT = (
    # Any rendered text - the real text is drawn on afterward. Named
    # specifically because at cfg~1.0 the model keeps copying the source
    # card's own text unless the exact kind of text is called out.
    "text, words, letters, numbers, digits, characters, glyphs, typography, "
    "handwriting, placeholder text, lorem ipsum, caption, label text, "
    "phone number, telephone number, email address, website url, web address, "
    "street address, postal code, contact information, business card text, "
    "name text, personal name, job title text, company name text, "
    "department name, slogan, tagline, signature, "
    # The source card's own branding and decoration reproduced into the
    # result - the other thing the model does at cfg~1.0.
    "reproduced business card, copied card design, original card layout, "
    "source card graphics, faithful copy of the input, company logo, brand "
    "logo, wordmark, emblem, monogram, crest, geometric logo, triangle logo, "
    "arrow graphic, chevron, angular shapes, diagonal color block, corner "
    "color block, decorative color panels, colored geometric shapes, ribbon "
    "graphic, swoosh, gradient banner, busy graphic pattern, clip art, "
    # People / faces.
    "large silhouette, oversized silhouette, decorative silhouette, human "
    "bust, human profile, person illustration, figure illustration, "
    "realistic face, human face, face in background, ghosted face, faded "
    "face, translucent face, blurred face, face overlay, background "
    "portrait, person in background, body in background, torso, shoulders, "
    "upper body, blurred person, out-of-focus person, real photo of a "
    "person, photorealistic person, portrait photograph, person, human, "
    "hand, fingers, holding, human hand, "
    # Photographic / mockup artefacts.
    "photograph background, blurred background, tilted card, holographic "
    "pattern, hologram, iridescent security pattern, watermark, stock photo "
    "watermark, repeated watermark text, tiled watermark pattern, "
    "semi-transparent text overlay, logo overlay, drop shadow, cast shadow, "
    "vignette, floating card, card mockup, surrounding background, blurry, "
    "extra limbs, low quality, cropped, deformed"
)


class ComfyUISettings(BaseSettings):
    base_url: str = "http://127.0.0.1:8188"

    # Krea2 is loaded as a GGUF-quantized UNET (see ComfyUI-GGUF_KREA-2), with a
    # separate Qwen3-VL-4B text encoder and the Qwen-Image VAE.
    unet_gguf_name: str = "Krea-2-Turbo-Q3_K_M.gguf"
    clip_name: str = "qwen3vl_4b_fp8_scaled.safetensors"
    clip_type: str = "krea2"
    vae_name: str = "qwen_image_vae.safetensors"

    positive_prompt: str = DEFAULT_POSITIVE_PROMPT
    negative_prompt: str = DEFAULT_NEGATIVE_PROMPT

    # Preprocessing: strip faint stock-photo watermarks from the source card
    # before img2img (see preprocessing.remove_faint_overlay).
    watermark_blur_radius: int = 6
    watermark_amplitude_threshold: int = 25

    # Generation happens on an empty latent guided by the source card through
    # TextEncodeQwenImageEdit's reference_latents, not classic VAEEncode img2img.
    generation_width: int = 800
    generation_height: int = 1280

    # "Turbo" distilled checkpoint: tested at steps=16/cfg=2.5 to give the
    # negative prompt more room to act, but that made output quality worse
    # (stronger watermark ghosting, dropped portrait placeholder) instead of
    # better - this model was distilled for cfg~1.0 and doesn't respond well
    # to a stronger negative-prompt pull. Back to the turbo-native defaults.
    steps: int = 8
    cfg_scale: float = 1.0
    sampler_name: str = "euler"
    scheduler: str = "simple"
    denoise_strength: float = 1.0
    # 0 means "pick a new random seed per request"
    seed: int = 0

    # Final crop target, kept at a 10:16 ratio (1000/1600 = 10/16)
    output_width: int = 1000
    output_height: int = 1600

    request_timeout_seconds: float = 300.0
    poll_interval_seconds: float = 1.0

    model_config = SettingsConfigDict(env_prefix="COMFYUI_", env_file=".env", extra="ignore")


settings = ComfyUISettings()
