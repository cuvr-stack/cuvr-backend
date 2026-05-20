"""
Replicate-based AI inference — cloud GPU via API.
Used when local PyTorch/GPU is unavailable (e.g. Oracle free-tier VM).

Models:
  standard → jagilley/controlnet-canny  (SD 1.5 + ControlNet Canny, ~20s, cheapest)
  quality  → stability-ai/sdxl          (SDXL img2img, ~40s, much better photorealism)
  ultra    → stability-ai/sdxl          (SDXL + expert_ensemble_refiner, ~70s, best)
"""

import io
import base64
import logging
import cv2
import numpy as np
import httpx
from PIL import Image

logger = logging.getLogger(__name__)

# ── Replicate model IDs ───────────────────────────────────────────────────────

CONTROLNET_CANNY_MODEL = (
    "jagilley/controlnet-canny:"
    "aff48af9c68d162388d230a2ab003f68d2638d88ffd3a8ba2e25cf651e88b9be"
)

SDXL_MODEL = (
    "stability-ai/sdxl:"
    "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_data_uri(img: Image.Image, fmt: str = "PNG") -> str:
    """Convert PIL Image → base64 data URI string."""
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    b64 = base64.b64encode(buf.getvalue()).decode()
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def _resize_fit(img: Image.Image, max_dim: int = 768) -> Image.Image:
    w, h = img.size
    scale = min(max_dim / w, max_dim / h)
    nw = max(8, (round(w * scale) // 8) * 8)
    nh = max(8, (round(h * scale) // 8) * 8)
    return img.resize((nw, nh), Image.LANCZOS)


def _extract_canny(img: Image.Image) -> Image.Image:
    gray = np.array(img.convert("L"))
    median = int(np.median(gray))
    low  = max(0,   int(0.66 * median))
    high = min(255, int(1.33 * median))
    edges = cv2.Canny(gray, low, high)
    kernel = np.ones((2, 2), np.uint8)
    edges  = cv2.dilate(edges, kernel, iterations=1)
    return Image.fromarray(cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB))


def _download_image(url: str) -> Image.Image:
    resp = httpx.get(str(url), timeout=120, follow_redirects=True)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def _build_full_prompt(prompt: str) -> str:
    return (
        "photorealistic architectural exterior photography, 8k ultra sharp, "
        f"{prompt.strip()}, "
        "professional architectural photography, golden hour sunlight, "
        "realistic sky, depth of field, highly detailed building materials, "
        "sharp focus, no blur, cinematic"
    )


NEGATIVE = (
    "sketch, drawing, cartoon, 2d, flat, blurry, watermark, text, "
    "deformed, unrealistic, ugly, low quality, painterly, illustration, "
    "overexposed, washed out, dark, gloomy, broken structure"
)


# ── Public API ────────────────────────────────────────────────────────────────

def generate_scene_variation_replicate(
    image: Image.Image,
    prompt: str,
    model: str = "quality",
    image_strength: int = 65,   # 0-100
    style_strength: int = 75,   # 0-100
    ultra_realism: bool = True,
) -> Image.Image:
    """
    Generate a photorealistic scene variation via Replicate cloud API.

    model options:
      "standard" — ControlNet Canny + SD 1.5 (fastest, structure-preserving)
      "quality"  — SDXL img2img (best photorealism)
      "ultra"    — SDXL + ensemble refiner (2-pass, highest quality)

    image_strength (0–100): how much original structure is preserved
    style_strength (0–100): how faithfully the AI follows the prompt
    ultra_realism: adds extra sharpness/detail keywords to prompt
    """
    import replicate as _replicate
    from app.core.config import settings

    token = settings.replicate_api_token
    if not token:
        raise RuntimeError(
            "REPLICATE_API_TOKEN is not set. "
            "Add it to your .env: REPLICATE_API_TOKEN=r8_xxxx"
        )

    client = _replicate.Client(api_token=token)

    # Map 0-100 sliders to model parameters
    # prompt_strength: higher = more change, lower = preserves original more
    prompt_str  = 0.4 + (image_strength / 100) * 0.5   # 0.40 – 0.90
    # guidance_scale: higher = more prompt faithful
    guidance    = 5.0 + (style_strength  / 100) * 7.0  # 5.0  – 12.0
    # controlnet_conditioning: how tightly to follow edge structure
    cn_scale    = 0.6 + (image_strength  / 100) * 0.9  # 0.60 – 1.50

    full_prompt = _build_full_prompt(prompt)
    if ultra_realism:
        full_prompt = full_prompt.rstrip() + ", ultra photorealistic, hyperrealistic, 8k, award-winning architectural photography"

    img_resized = _resize_fit(image, max_dim=768)

    logger.info(
        f"Replicate: model={model!r} img_str={image_strength} "
        f"sty_str={style_strength} ultra={ultra_realism} "
        f"prompt={full_prompt[:60]}…"
    )

    if model == "standard":
        # ── ControlNet Canny — SD 1.5, structure-preserving ──────────────────
        canny = _extract_canny(img_resized)
        output = client.run(
            CONTROLNET_CANNY_MODEL,
            input={
                "prompt":                       full_prompt,
                "negative_prompt":              NEGATIVE,
                "image":                        _to_data_uri(canny),
                "num_inference_steps":          30,
                "guidance_scale":               guidance,
                "eta":                          0.0,
            },
        )

    elif model == "quality":
        # ── SDXL img2img — photorealistic ────────────────────────────────────
        output = client.run(
            SDXL_MODEL,
            input={
                "prompt":               full_prompt,
                "negative_prompt":      NEGATIVE,
                "image":                _to_data_uri(img_resized, fmt="JPEG"),
                "prompt_strength":      prompt_str,
                "num_inference_steps":  40,
                "guidance_scale":       guidance,
                "refine":               "no_refiner",
            },
        )

    else:  # ultra
        # ── SDXL + expert ensemble refiner — 2-pass ──────────────────────────
        output = client.run(
            SDXL_MODEL,
            input={
                "prompt":               full_prompt,
                "negative_prompt":      NEGATIVE,
                "image":                _to_data_uri(img_resized, fmt="JPEG"),
                "prompt_strength":      min(0.90, prompt_str + 0.10),
                "num_inference_steps":  50,
                "guidance_scale":       guidance,
                "refine":               "expert_ensemble_refiner",
                "high_noise_frac":      0.80,
            },
        )

    # ── Resolve output URL ────────────────────────────────────────────────────
    # Replicate SDK returns FileOutput objects or URL strings depending on version
    if isinstance(output, list):
        raw = output[0]
    else:
        raw = output

    # FileOutput (replicate ≥ 0.22) has .url attribute
    result_url = getattr(raw, "url", None) or str(raw)
    logger.info(f"Replicate result URL: {result_url}")

    return _download_image(result_url)
