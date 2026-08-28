import random

from cardcreate.config import ComfyUISettings

MAX_SEED = 2**32 - 1


def build_id_card_workflow(uploaded_image_name: str, settings: ComfyUISettings) -> dict:
    """Build a ComfyUI API-format graph for the Krea2 GGUF unet + Qwen3-VL clip +
    Qwen-Image vae stack: an edit-model workflow where the source business card is
    passed as a reference image (via TextEncodeQwenImageEdit), not classic img2img
    VAEEncode/denoise."""
    seed = settings.seed or random.randint(0, MAX_SEED)

    return {
        "unet_loader": {
            "class_type": "UnetLoaderGGUF",
            "inputs": {"unet_name": settings.unet_gguf_name},
        },
        "clip_loader": {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": settings.clip_name, "type": settings.clip_type},
        },
        "vae_loader": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": settings.vae_name},
        },
        "source_image": {
            "class_type": "LoadImage",
            "inputs": {"image": uploaded_image_name},
        },
        "positive": {
            "class_type": "TextEncodeQwenImageEdit",
            "inputs": {
                "clip": ["clip_loader", 0],
                "prompt": settings.positive_prompt,
                "vae": ["vae_loader", 0],
                "image": ["source_image", 0],
            },
        },
        "negative": {
            "class_type": "TextEncodeQwenImageEdit",
            "inputs": {"clip": ["clip_loader", 0], "prompt": settings.negative_prompt},
        },
        "empty_latent": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {
                "width": settings.generation_width,
                "height": settings.generation_height,
                "batch_size": 1,
            },
        },
        "sampler": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["unet_loader", 0],
                "positive": ["positive", 0],
                "negative": ["negative", 0],
                "latent_image": ["empty_latent", 0],
                "seed": seed,
                "steps": settings.steps,
                "cfg": settings.cfg_scale,
                "sampler_name": settings.sampler_name,
                "scheduler": settings.scheduler,
                "denoise": settings.denoise_strength,
            },
        },
        "decoded_image": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["sampler", 0], "vae": ["vae_loader", 0]},
        },
        "output": {
            "class_type": "SaveImage",
            "inputs": {"images": ["decoded_image", 0], "filename_prefix": "cardn_id_card"},
        },
    }
