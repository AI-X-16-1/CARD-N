# backend/cardcreate/ (draft — pending team approval)

Generates a battle-card image for one `battle_cards` row, via ComfyUI img2img
using the Krea2 checkpoint. The card *art* is generated from the business
card photo saved for the card's contact (`persons.image_path`); the text
printed on top comes from the DB — not from the text on the business card:

- from the `persons` row the card's `person_id` points at: **name**,
  **company**
- from the `battle_cards` snapshot: **job class**, **grade**, **cost**,
  **final stats** (ATK/DEF/INT/HP), **skill** (name/cost/description),
  **passive**, **flavor text**

The finished image is written to disk and its path saved back to
`battle_cards.illustration_url`.

**Status**: draft only. `docs/features.md` does not assign a backend folder to
문민재 (BE column is `—`), so this module is outside the documented
ownership table. Per `CLAUDE.md`, wiring it into the app (registering
`router.py` in `app/main.py`, adding the `pillow` dependency, merging this
folder) requires a separate branch + PR with 2+ team approvals — the same
process as a `shared/` change.

## What it does

0. Load the `battle_cards` row + its `persons` row for `card_id`
   (`repository.fetch_card_data`). **Precondition**: that `persons` row's
   `image_path` must not be NULL — otherwise there is no source photo to
   generate from and `fetch_card_data` raises `SourceImageMissingError`
   before any work starts. When set, the photo is read from
   `persons.image_path` (via `app/core/image_store.py`).
1. Find the card inside the source photo and perspective-correct it to a
   flat, straight-on crop (`card_detection.py`, OpenCV GrabCut + a rotated
   bounding rect) - otherwise the edit model reproduces the whole
   photographic composition (a hand holding the card, a blurred background,
   ...) instead of just the card's design. Falls back to the original image
   untouched if no card-sized region is found.
2. Upload the (cropped) business card image to a running ComfyUI server.
3. Run an edit-model workflow on the Krea2 GGUF unet: `UnetLoaderGGUF` +
   `CLIPLoader` (Qwen3-VL-4B, `type="krea2"`) + `VAELoader` (Qwen-Image VAE) →
   `TextEncodeQwenImageEdit` feeds the source card in as a reference image
   (its `vae`/`image` inputs bake a `reference_latents` conditioning value —
   this is *not* classic `VAEEncode`+denoise img2img) → `KSampler` samples a
   fresh empty latent guided by that conditioning → `VAEDecode` → `SaveImage`.
4. Fetch the generated image and center-crop/scale it ("cover" resize) to
   exactly fill a 10:16 frame (default 1000x1600px), with no letterboxing.
5. Erase any dark, text-shaped marks the model drew anyway despite the
   textless-badge prompt (`text_removal.py` - OpenCV: merge character
   strokes into line-level blobs, keep only wide/line-shaped ones, inpaint
   them out). Prompting alone couldn't stop this at `cfg_scale=1.0` (see
   below), so this cleans up whatever gets through.
6. Overlay the card text (`GameCardData` from `repository.fetch_card_data`)
   directly with PIL (`overlay.py`) across the natural zones of a portrait
   card: cost top-left, grade (stars) top-right, name/company/job class in
   the upper band, the ATK/DEF/INT/HP row in the middle, the skill
   name + effect below it, and the passive + flavor text near the bottom.
   Positions are rough starting values (constants at the top of `overlay.py`),
   meant to be hand-tuned once the real card frame art exists. The edit model
   cannot reliably render text itself (invents/garbles it at `cfg_scale=1.0`),
   so the prompt asks for a textless design and steps 5-6 clean up and then
   draw the real text.
7. Write the finished image to `storage/card_images/illustrations/{card_id}.png`
   (`storage.save_illustration`) and save the **bare filename** (`{card_id}.png`,
   the same convention as `Person.image_path`, resolved by
   `storage.card_illustration_path`) to `battle_cards.illustration_url`, then
   commit.

Steps 1, 2 (crop/clean), 4-7 (fit/erase/overlay/store) are CPU-bound and run
on a worker thread (`starlette.concurrency.run_in_threadpool`), like the scan
feature's OCR - a single request must not block the event loop.

## Requirements

- A ComfyUI server running locally (not started by this module or by Docker
  Compose — run it separately, e.g. `python main.py --listen 127.0.0.1`).
- The `ComfyUI-GGUF_KREA-2` custom node
  (https://github.com/RealRebelAI/ComfyUI-GGUF_KREA-2) installed under
  `custom_nodes/`, which registers `UnetLoaderGGUF` and adds the `krea2`
  CLIP type.
- Model files in ComfyUI's `models/` tree:
  - `models/unet/<name>.gguf` — the Krea2 GGUF unet (e.g.
    `Krea-2-Turbo-Q3_K_M.gguf`)
  - `models/text_encoders/<name>.safetensors` — Qwen3-VL-4B text encoder
  - `models/vae/<name>.safetensors` — Qwen-Image VAE
- `pillow` and `opencv-python-headless` installed (added to
  `backend/pyproject.toml`; run `uv sync`).

## Configuration (`backend/.env`)

```env
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_UNET_GGUF_NAME=Krea-2-Turbo-Q3_K_M.gguf
COMFYUI_CLIP_NAME=qwen3vl_4b_fp8_scaled.safetensors
COMFYUI_VAE_NAME=qwen_image_vae.safetensors
```

See `config.py` for all other tunables (prompt text, denoise strength,
sampler settings, output size).

## Usage

```python
from cardcreate.service import IdCardService

# db is an AsyncSession (app.dependencies.get_db)
id_card_bytes = await IdCardService(db).generate(card_id=1)
```

Everything (the source photo, the overlay text, the destination) is resolved
from the `battle_cards` / `persons` rows for `card_id`; the finished image is
returned *and* persisted to `battle_cards.illustration_url`.

`router.py` exposes this as `POST /id-card/{card_id}` (no request body), but
is **not** registered in `app/main.py` yet — see Status above.

## Testing

`backend/tests/test_cardcreate_*.py` cover the pure, no-network pieces:
crop/resize (`image_utils`), card detection (incl. the 45-degree corner case),
watermark/hallucinated-text removal, the text overlay (`overlay`), the DB read
(`repository`, against in-memory SQLite), the result store (`storage`), and the
ComfyUI client's error fast-fail (`client`, with a mock transport). The full
`service.generate` pipeline isn't unit-tested since it needs a live ComfyUI
server.

`scripts`-style manual check: run the overlay over a fake generated
background to eyeball the layout without ComfyUI — build a `GameCardData` by
hand and call `draw_text_fields(fake_png_bytes, card_data)`.
