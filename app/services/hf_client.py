"""
HuggingFace Inference API — free, fast (~15-60 s), runs on HF servers.

Get a free token at: https://huggingface.co/settings/tokens
Add to .env: HUGGINGFACE_TOKEN=hf_xxxxxxxx

No rate limits for read-access models with a free account.
"""
import base64
import io
import time
import httpx
from PIL import Image
from app.core.config import settings

HF_API = "https://api-inference.huggingface.co/models"

# Fast text-to-image: FLUX.1-schnell (~15 s, excellent quality)
FLUX_MODEL      = "black-forest-labs/FLUX.1-schnell"
# Image-guided: instruct-pix2pix (~30 s, follows sketch structure)
PIX2PIX_MODEL   = "timbrooks/instruct-pix2pix"
# img2img fallback
SD_MODEL        = "stable-diffusion-v1-5/stable-diffusion-v1-5"


def _headers():
    return {"Authorization": f"Bearer {settings.huggingface_token}"}


def _img_to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def _img_to_b64(img: Image.Image, fmt: str = "PNG") -> str:
    return base64.b64encode(_img_to_bytes(img, fmt)).decode()


def _post_json(model: str, payload: dict, retries: int = 5) -> bytes:
    url = f"{HF_API}/{model}"
    for attempt in range(retries):
        resp = httpx.post(url, headers=_headers(), json=payload, timeout=120)
        if resp.status_code == 503:
            wait = min(int(resp.headers.get("X-Wait-For-Model", "20")), 30)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.content
    raise TimeoutError(f"HF model {model} did not load after {retries} retries")


def _post_binary(model: str, image_bytes: bytes, params: dict, retries: int = 5) -> bytes:
    url = f"{HF_API}/{model}"
    headers = {**_headers(), "Content-Type": "image/png"}
    for attempt in range(retries):
        resp = httpx.post(url, headers=headers, content=image_bytes, params=params, timeout=120)
        if resp.status_code == 503:
            wait = min(int(resp.headers.get("X-Wait-For-Model", "20")), 30)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.content
    raise TimeoutError(f"HF model {model} did not load after {retries} retries")


def _build_exterior_prompt(style: str) -> str:
    detail_map = {
        "modern minimalist":   "smooth white concrete walls, large glass windows, flat roof, manicured lawn, concrete pavers",
        "contemporary luxury": "premium stone cladding, floor-to-ceiling glass, infinity pool, lush tropical landscaping",
        "mediterranean villa": "warm travertine stone, terracotta roof tiles, arched windows, olive trees, warm sunlight",
        "arabic islamic":      "ornate geometric stone patterns, wind tower, palm trees, sandstone facade, mashrabiya screens",
        "scandinavian nordic": "light pine wood cladding, black steel frame windows, pine trees, gravel path, overcast sky",
        "industrial modern":   "exposed steel beams, corten steel panels, large factory windows, urban landscaping",
    }
    detail = detail_map.get(style, "modern exterior, beautiful landscaping")
    return (
        f"photorealistic architectural exterior render, {style} style luxury residence, "
        f"{detail}, golden hour lighting, professional architectural photography, "
        "8k ultra detailed, award-winning architecture, lush greenery, realistic sky, "
        "hyper realistic, cinematic"
    )


def _build_interior_prompt(style: str, room_type: str) -> str:
    return (
        f"photorealistic {style} {room_type}, beautifully furnished, "
        "high quality interior photography, natural window light, "
        "detailed textures, 8k, ultra realistic, professional staging, "
        "architectural digest style"
    )


def render_sketch_hf(
    image: Image.Image,
    style: str = "modern minimalist",
    room_type: str = "exterior building",
) -> Image.Image:
    """
    Sketch → photorealistic render via HuggingFace Inference API.

    Strategy:
    1. Try instruct-pix2pix (image-guided, follows sketch ~60 s)
    2. Fall back to FLUX.1-schnell text-to-image (~15 s, excellent quality)
    """
    is_exterior = "exterior" in room_type.lower() or "building" in room_type.lower()

    if is_exterior:
        prompt = _build_exterior_prompt(style)
        instruction = f"Transform this architectural sketch into a photorealistic {style} building exterior with realistic materials, landscaping and lighting"
    else:
        prompt = _build_interior_prompt(style, room_type)
        instruction = f"Transform this room sketch into a photorealistic {style} {room_type} with beautiful furniture, lighting and materials"

    img_512 = image.resize((512, 512), Image.LANCZOS)

    # 1. Try instruct-pix2pix (keeps sketch structure)
    try:
        payload = {
            "inputs": {
                "image": _img_to_b64(img_512),
                "prompt": instruction,
            },
            "parameters": {
                "num_inference_steps": 20,
                "image_guidance_scale": 1.5,
                "guidance_scale": 7.5,
            },
        }
        result_bytes = _post_json(PIX2PIX_MODEL, payload)
        return Image.open(io.BytesIO(result_bytes)).convert("RGB")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"pix2pix failed ({e}), trying FLUX")

    # 2. Fall back to FLUX.1-schnell text-to-image
    payload = {
        "inputs": prompt,
        "parameters": {"num_inference_steps": 4},
    }
    result_bytes = _post_json(FLUX_MODEL, payload)
    return Image.open(io.BytesIO(result_bytes)).convert("RGB")


def stage_room_hf(image: Image.Image, style: str = "modern") -> Image.Image:
    """
    Empty room → furnished room via HuggingFace Inference API.
    Uses instruct-pix2pix to follow the room layout, falls back to FLUX.
    """
    style_instructions = {
        "modern":       "furnish this room with modern minimalist furniture, clean lines, contemporary decor",
        "luxury":       "furnish this room with luxury opulent furniture, marble floors, gold accents, chandelier",
        "scandinavian": "furnish this room with scandinavian furniture, light oak wood, neutral tones, cozy textiles",
        "classic":      "furnish this room with classic elegant furniture, rich wood, ornate details, warm lighting",
        "minimalist":   "furnish this room with minimalist furniture, essential pieces only, white and neutral tones",
        "arabic":       "furnish this room with arabic oriental furniture, rich patterns, warm colors, ornate lanterns",
        "industrial":   "furnish this room with industrial furniture, metal and wood, Edison bulbs, exposed brick",
    }
    instruction = style_instructions.get(style, f"furnish this room with {style} style furniture and decor")
    img_512 = image.resize((512, 512), Image.LANCZOS)

    try:
        payload = {
            "inputs": {
                "image": _img_to_b64(img_512),
                "prompt": instruction,
            },
            "parameters": {
                "num_inference_steps": 20,
                "image_guidance_scale": 1.5,
                "guidance_scale": 7.5,
            },
        }
        result_bytes = _post_json(PIX2PIX_MODEL, payload)
        return Image.open(io.BytesIO(result_bytes)).convert("RGB")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"pix2pix staging failed ({e}), trying FLUX")

    style_prompts = {
        "modern": "modern minimalist furnished room, clean lines, contemporary furniture, natural light",
        "luxury": "luxury furnished room, opulent furniture, marble, gold accents, chandelier",
    }
    flux_prompt = style_prompts.get(style, f"{style} furnished room, professional interior photography, 8k")
    payload = {"inputs": flux_prompt, "parameters": {"num_inference_steps": 4}}
    result_bytes = _post_json(FLUX_MODEL, payload)
    return Image.open(io.BytesIO(result_bytes)).convert("RGB")
