"""
Replicate-based AI inference — FLUX models (2024, Black Forest Labs).

Why FLUX instead of SD 1.5 / SDXL:
  FLUX is the successor to Stable Diffusion from the same team.
  It produces dramatically better photorealism, follows prompts more
  accurately, and handles architectural imagery with much less artifacting.
  AutoRender's NanoBanana is a fine-tuned SD 1.5/SDXL — FLUX beats it
  out-of-the-box without any fine-tuning.

Models used:
  standard → flux-schnell  (4-step distilled, ~8s,  best speed, text→image)
  quality  → flux-dev      (full model, img2img,    ~30s, structure-preserving)
  ultra    → flux-dev      (img2img, more steps,    ~55s, maximum photorealism)

Roadmap (fine-tuning — our own "NanoBanana" equivalent):
  1. Collect 2-5k architectural render pairs (sketch → photorealistic photo)
  2. Fine-tune FLUX Dev with LoRA (~8h on an A100, ~$80 compute)
  3. Host fine-tuned weights on Replicate or HuggingFace
  4. Swap model IDs below → instant "CUVR Model v1" branding
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
# No version hashes needed — Replicate resolves "latest" automatically.

FLUX_SCHNELL = "black-forest-labs/flux-schnell"   # 4-step, text→image, ~8s
FLUX_DEV     = "black-forest-labs/flux-dev"        # full model, img2img,  ~30s
FLUX_PRO     = "black-forest-labs/flux-1.1-pro"    # pro tier, text→image, ~15s


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_data_uri(img: Image.Image, fmt: str = "JPEG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=95)
    b64 = base64.b64encode(buf.getvalue()).decode()
    mime = "image/jpeg" if fmt.upper() == "JPEG" else "image/png"
    return f"data:{mime};base64,{b64}"


def _resize_fit(img: Image.Image, max_dim: int = 1024) -> Image.Image:
    """Resize to fit within max_dim, rounding to multiples of 16 (FLUX requirement)."""
    w, h = img.size
    scale = min(max_dim / w, max_dim / h)
    nw = max(16, (round(w * scale) // 16) * 16)
    nh = max(16, (round(h * scale) // 16) * 16)
    return img.resize((nw, nh), Image.LANCZOS)


def _download_image(url: str) -> Image.Image:
    resp = httpx.get(str(url), timeout=180, follow_redirects=True)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def _resolve_output_url(output) -> str:
    """Handle different Replicate SDK output formats across versions."""
    if isinstance(output, list):
        raw = output[0]
    else:
        raw = output
    # FileOutput object (replicate >= 0.22) has .url attribute
    return str(getattr(raw, "url", None) or raw)


def _build_prompt(prompt: str, ultra_realism: bool) -> str:
    base = (
        "photorealistic architectural exterior photography, "
        f"{prompt.strip()}, "
        "professional architectural photography, golden hour sunlight, "
        "realistic sky with clouds, depth of field, "
        "highly detailed building materials and textures"
    )
    if ultra_realism:
        base += (
            ", hyperrealistic, 8k ultra sharp, award-winning photography, "
            "shot on Hasselblad, perfect exposure, crisp details"
        )
    return base


# ── Public API ────────────────────────────────────────────────────────────────

def generate_scene_variation_replicate(
    image: Image.Image,
    prompt: str,
    model: str = "quality",
    image_strength: int = 65,
    style_strength: int = 75,
    ultra_realism: bool = True,
) -> Image.Image:
    """
    Generate a photorealistic architectural scene variation using FLUX.

    model:
      "standard" → FLUX Schnell  — fast 4-step render, text-guided (~8s)
      "quality"  → FLUX Dev      — img2img, structure-preserving (~30s)
      "ultra"    → FLUX Dev      — img2img, more steps, max detail (~55s)

    image_strength (0-100): how much of the original building is preserved
      Low  (30) = loose interpretation, more creative freedom
      High (80) = tight structure, just changes materials/colours/landscape

    style_strength (0-100): how closely the AI follows the text prompt
      Low  (30) = subtle changes
      High (90) = dramatic transformation
    """
    import replicate as _replicate
    from app.core.config import settings

    token = settings.replicate_api_token
    if not token:
        raise RuntimeError(
            "REPLICATE_API_TOKEN is not configured. "
            "Go to replicate.com → API Tokens → Create, "
            "then add REPLICATE_API_TOKEN=r8_xxxx to your .env"
        )

    client = _replicate.Client(api_token=token)

    # Map 0-100 sliders to FLUX parameters
    # prompt_strength: how much the image changes (0=original, 1=new image)
    prompt_strength = 0.35 + (image_strength / 100) * 0.50   # 0.35 – 0.85
    # FLUX guidance (1.5–4.5); higher = more prompt-faithful
    guidance        = 1.5  + (style_strength  / 100) * 3.0   # 1.5  – 4.5

    full_prompt = _build_prompt(prompt, ultra_realism)

    logger.info(
        f"FLUX inference: model={model!r} "
        f"img_str={image_strength}({prompt_strength:.2f}) "
        f"sty_str={style_strength}({guidance:.1f}) "
        f"ultra={ultra_realism} prompt='{full_prompt[:60]}…'"
    )

    img_resized = _resize_fit(image, max_dim=1024)

    if model == "standard":
        # ── FLUX Schnell — 4-step distilled, text→image, fastest ─────────────
        # No img2img in Schnell — but with a very detailed prompt and the
        # original image dimensions as aspect hint, results are excellent.
        w, h = img_resized.size
        ratio = w / h
        aspect = "16:9" if ratio > 1.6 else ("4:3" if ratio > 1.2 else "1:1")

        output = client.run(
            FLUX_SCHNELL,
            input={
                "prompt":              full_prompt,
                "num_inference_steps": 4,
                "aspect_ratio":        aspect,
                "output_format":       "jpeg",
                "output_quality":      95,
            },
        )

    elif model == "quality":
        # ── FLUX Dev img2img — preserves building structure ───────────────────
        output = client.run(
            FLUX_DEV,
            input={
                "prompt":              full_prompt,
                "image":               _to_data_uri(img_resized),
                "prompt_strength":     prompt_strength,
                "num_inference_steps": 28,
                "guidance":            guidance,
                "output_format":       "jpeg",
                "output_quality":      95,
            },
        )

    else:  # ultra
        # ── FLUX Dev img2img — more steps, highest detail ─────────────────────
        output = client.run(
            FLUX_DEV,
            input={
                "prompt":              full_prompt,
                "image":               _to_data_uri(img_resized),
                "prompt_strength":     min(0.85, prompt_strength + 0.08),
                "num_inference_steps": 50,
                "guidance":            min(4.5, guidance + 0.5),
                "output_format":       "jpeg",
                "output_quality":      98,
            },
        )

    result_url = _resolve_output_url(output)
    logger.info(f"FLUX result: {result_url}")
    return _download_image(result_url)
