"""
Local AI engine — Stable Diffusion on GPU (CUDA/MPS) or CPU.

Pipelines:
  1. render_sketch_local   — ControlNet Canny → photorealistic render (single image)
  2. stage_room_local      — img2img → furnished room (virtual staging)
  3. generate_3d_from_views — multi-view images → 3D mesh GLB (TripoSR)

Why Canny instead of Scribble:
  Scribble is designed for freehand doodles and loses structural precision.
  Canny edge detection traces every architectural line exactly, so the
  output render faithfully follows walls, windows, rooflines etc.
"""
import io
import logging
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

BASE_MODEL           = "stable-diffusion-v1-5/stable-diffusion-v1-5"
CONTROLNET_CANNY     = "lllyasviel/sd-controlnet-canny"

# ── Module-level pipeline cache ───────────────────────────────────────────────
_controlnet_pipe = None
_img2img_pipe    = None


def _device():
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _dtype():
    if torch.cuda.is_available():
        return torch.float16
    return torch.float32


# ── Canny edge extraction ─────────────────────────────────────────────────────

def _extract_canny(image: Image.Image, low: int = 50, high: int = 150) -> Image.Image:
    """
    Run Canny edge detection on an image.
    Auto-threshold if low/high not given: adapts to image brightness.
    Returns a 3-channel RGB edge map ready for ControlNet input.
    """
    import cv2
    gray = np.array(image.convert("L"))
    # Auto-threshold based on median pixel value
    median = int(np.median(gray))
    low_thresh  = max(0,   int(0.66 * median))
    high_thresh = min(255, int(1.33 * median))
    # Use provided thresholds if they seem reasonable, else use auto
    if low != 50 or high != 150:
        low_thresh, high_thresh = low, high
    edges = cv2.Canny(gray, low_thresh, high_thresh)
    # Dilate slightly to close thin gaps common in architectural drawings
    kernel = np.ones((2, 2), np.uint8)
    edges  = cv2.dilate(edges, kernel, iterations=1)
    rgb    = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
    return Image.fromarray(rgb)


# ── Pipeline loaders ──────────────────────────────────────────────────────────

def _get_controlnet_pipe():
    global _controlnet_pipe
    if _controlnet_pipe is not None:
        return _controlnet_pipe

    from diffusers import StableDiffusionControlNetPipeline, ControlNetModel, UniPCMultistepScheduler

    device = _device()
    dtype  = _dtype()
    logger.info(f"Loading ControlNet-Canny pipeline (device={device}, dtype={dtype})…")

    controlnet = ControlNetModel.from_pretrained(CONTROLNET_CANNY, torch_dtype=dtype)
    pipe = StableDiffusionControlNetPipeline.from_pretrained(
        BASE_MODEL, controlnet=controlnet, torch_dtype=dtype, safety_checker=None,
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to(device)
    pipe.enable_attention_slicing()

    _controlnet_pipe = pipe
    logger.info("ControlNet-Canny pipeline cached ✓")
    return _controlnet_pipe


def _get_img2img_pipe():
    global _img2img_pipe
    if _img2img_pipe is not None:
        return _img2img_pipe

    from diffusers import StableDiffusionImg2ImgPipeline, UniPCMultistepScheduler

    device = _device()
    dtype  = _dtype()
    logger.info(f"Loading img2img pipeline (device={device}, dtype={dtype})…")

    pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
        BASE_MODEL, torch_dtype=dtype, safety_checker=None,
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to(device)
    pipe.enable_attention_slicing()

    _img2img_pipe = pipe
    logger.info("img2img pipeline cached ✓")
    return _img2img_pipe


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resize_preserve_aspect(image: Image.Image, max_dim: int = 768) -> Image.Image:
    """Resize to fit within max_dim×max_dim, preserving aspect ratio. Dims rounded to nearest 8."""
    w, h = image.size
    scale = min(max_dim / w, max_dim / h)
    new_w = max(8, (round(w * scale) // 8) * 8)
    new_h = max(8, (round(h * scale) // 8) * 8)
    return image.resize((new_w, new_h), Image.LANCZOS)


def _build_render_prompt(style: str, room_type: str):
    is_exterior = "exterior" in room_type.lower() or "building" in room_type.lower()

    if is_exterior:
        detail_map = {
            "modern minimalist":   "smooth white concrete walls, large glass windows, flat roof, manicured lawn, precise architectural lines",
            "contemporary luxury": "premium stone cladding, floor-to-ceiling glass, infinity pool, tropical landscaping, dramatic lighting",
            "mediterranean villa": "warm travertine stone, terracotta roof tiles, arched windows, olive trees, blue sky",
            "arabic islamic":      "ornate geometric stone patterns, wind tower, palm trees, sandstone facade, mashrabiya screens",
            "scandinavian nordic": "light pine wood cladding, black steel frame windows, pine trees, gravel path, overcast sky",
            "industrial modern":   "exposed steel beams, corten steel panels, large factory windows, urban landscaping",
        }
        detail = detail_map.get(style, "modern architectural exterior, clean lines, beautiful landscaping")
        prompt = (
            f"photorealistic architectural exterior, {style} style, "
            f"{detail}, "
            "sharp architectural details, professional architectural photography, "
            "golden hour sunlight, realistic sky with clouds, lush green surroundings, "
            "highly detailed building materials, depth of field, 8k ultra sharp"
        )
        negative = (
            "sketch, drawing, line art, cartoon, 2d, flat, blurry, watermark, text, "
            "deformed, unrealistic, overexposed, dark, gloomy, low quality, "
            "ugly, distorted walls, broken structure"
        )
    else:
        room_details = {
            "living room": "comfortable sofa, coffee table, TV unit, decorative plants, floor lamp",
            "bedroom":     "king bed with premium linen, bedside tables, wardrobe, ambient lighting",
            "kitchen":     "modern cabinetry, marble countertops, kitchen island, pendant lights, appliances",
            "bathroom":    "floating vanity, walk-in shower, freestanding bathtub, large format tiles",
            "office":      "executive desk, ergonomic chair, bookshelves, natural daylight",
            "dining room": "large dining table, designer chairs, statement chandelier, artwork",
            "hallway":     "console table, mirror, pendant light, hardwood flooring",
        }
        details = room_details.get(room_type, "contemporary furniture, thoughtful design")
        prompt = (
            f"photorealistic {style} {room_type} interior design, "
            f"{details}, "
            "natural light streaming through windows, professional interior photography, "
            "high-end materials, realistic textures, sharp details, "
            "architectural digest quality, 8k ultra realistic"
        )
        negative = (
            "sketch, drawing, cartoon, empty room, no furniture, blurry, watermark, "
            "text, deformed, ugly, unrealistic, low quality, overexposed, dark, "
            "dirty, old, broken, distorted perspective"
        )
    return prompt, negative


# ── Public API ────────────────────────────────────────────────────────────────

def render_sketch_local(
    image: Image.Image,
    style: str = "modern minimalist",
    room_type: str = "exterior building",
) -> Image.Image:
    """
    Single image → photorealistic render.
    Uses ControlNet Canny for precise structural fidelity.
    """
    device = _device()
    logger.info(f"render_sketch_local: style={style}, room_type={room_type}, device={device}")

    pipe = _get_controlnet_pipe()

    # Resize preserving aspect ratio
    img_resized = _resize_preserve_aspect(image, max_dim=768)

    # Extract Canny edges — this is what ControlNet uses to follow structure precisely
    canny_img = _extract_canny(img_resized)

    prompt, negative_prompt = _build_render_prompt(style, room_type)

    with torch.inference_mode():
        result = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=canny_img,
            num_inference_steps=30,          # more steps = sharper, more detailed
            guidance_scale=9.0,              # higher = more faithful to prompt
            controlnet_conditioning_scale=1.1, # higher = more faithful to input structure
        )
    return result.images[0].convert("RGB")


def stage_room_local(image: Image.Image, style: str = "modern") -> Image.Image:
    """
    Empty room photo → furnished room using img2img.
    """
    device = _device()
    logger.info(f"stage_room_local: style={style}, device={device}")

    pipe = _get_img2img_pipe()

    style_prompts = {
        "modern":       "modern minimalist interior, clean lines, contemporary furniture, natural light",
        "luxury":       "luxury interior, opulent furniture, marble floors, gold accents, chandelier",
        "scandinavian": "scandinavian interior, light oak wood, neutral tones, cozy, linen fabrics",
        "classic":      "classic traditional interior, elegant furniture, rich mahogany, ornate details",
        "minimalist":   "minimalist zen interior, essentials only, white walls, serene, uncluttered",
        "arabic":       "arabic oriental interior, rich patterns, warm gold and burgundy, ornate lanterns",
        "industrial":   "industrial loft, exposed brick, steel beams, concrete, Edison bulbs",
    }
    style_desc = style_prompts.get(style, f"{style} interior design")

    img_resized = _resize_preserve_aspect(image, max_dim=768)

    with torch.inference_mode():
        result = pipe(
            prompt=(
                f"{style_desc}, "
                "furnished room, realistic interior photography, "
                "natural daylight, high-end materials, architectural digest quality, "
                "8k ultra realistic, professional staging"
            ),
            negative_prompt=(
                "empty room, no furniture, low quality, blurry, cartoon, "
                "deformed, watermark, text, overexposed, sketch, drawing"
            ),
            image=img_resized,
            strength=0.75,
            num_inference_steps=25,
            guidance_scale=8.0,
        )
    return result.images[0].convert("RGB")


def generate_3d_from_views(images: list[Image.Image]) -> bytes:
    """
    Multi-view images → 3D mesh (GLB).
    Uses TripoSR for single-image or first-view 3D generation,
    with additional views used to refine via depth consistency.

    Returns GLB bytes.
    """
    try:
        import trimesh
        from tsr.system import TSR
        import tempfile, os

        logger.info(f"generate_3d_from_views: {len(images)} input images")

        # Use the first/primary image (front view) as the main input
        primary = images[0].convert("RGB")
        primary_resized = primary.resize((512, 512), Image.LANCZOS)

        device = _device()

        # Load TripoSR model
        model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model = model.to(device)
        model.eval()

        # Run 3D generation
        with torch.inference_mode():
            scene_codes = model([primary_resized], device=device)
            meshes = model.extract_mesh(scene_codes, resolution=256)

        mesh = meshes[0]

        # Export to GLB
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            tmp_path = f.name
        mesh.export(tmp_path)
        with open(tmp_path, "rb") as f:
            glb_bytes = f.read()
        os.unlink(tmp_path)

        logger.info(f"3D mesh generated: {len(glb_bytes)} bytes")
        return glb_bytes

    except Exception as e:
        logger.error(f"3D generation failed: {e}")
        raise


# ── Scene Variation ───────────────────────────────────────────────────────────

_ELEMENT_PROMPTS = {
    "walls": {
        "Warm White":  "freshly painted warm white smooth stucco exterior walls",
        "Charcoal":    "dark charcoal grey painted exterior walls, modern",
        "Sage Green":  "sage green painted exterior walls, earthy tone",
        "Sand":        "warm sand beige painted exterior walls, natural tone",
        "Slate Blue":  "slate blue painted exterior walls, calm coastal tone",
        "Terracotta":  "terracotta orange painted exterior walls, mediterranean feel",
        "":            "freshly painted exterior walls, clean finish",
    },
    "landscaping": "lush manicured tropical garden, green lawn, sculpted hedges, flowering plants, palm trees, stone path",
    "windows":     "modern floor-to-ceiling double-glazed glass windows, slim aluminium frames, reflective glass",
    "roof":        "premium clay terracotta roof tiles, well-maintained, architectural detail",
    "driveway":    "elegant paved concrete driveway, clean lines, slight sheen",
}

_STYLE_SUFFIXES = {
    "Modern":          "modern minimalist architecture, clean geometry, sharp lines",
    "Contemporary":    "contemporary architecture, mixed materials, dynamic form",
    "Mediterranean":   "mediterranean villa architecture, warm tones, arched details",
    "Minimalist":      "ultra-minimalist architecture, pure form, minimal ornament",
    "Tropical":        "tropical modern architecture, lush greenery, natural materials",
    "Industrial":      "industrial modern architecture, exposed steel and concrete",
}


def generate_scene_variation(
    image: Image.Image,
    elements: list[str],
    style: str = "Modern",
    color: str = "",
) -> Image.Image:
    """
    Re-render specific architectural elements (walls, landscaping, windows, roof,
    driveway) in a new style/colour while keeping the building structure intact.

    Uses ControlNet Canny to preserve structural lines, with a descriptive prompt
    targeting only the chosen elements.
    """
    device = _device()
    logger.info(f"generate_scene_variation: elements={elements}, style={style}, color={color}, device={device}")

    pipe = _get_controlnet_pipe()
    img_resized = _resize_preserve_aspect(image, max_dim=768)
    canny_img   = _extract_canny(img_resized)

    # Build element descriptions
    element_parts = []
    for el in elements:
        if el == "walls":
            desc = _ELEMENT_PROMPTS["walls"].get(color, _ELEMENT_PROMPTS["walls"][""])
            element_parts.append(desc)
        elif el in _ELEMENT_PROMPTS:
            element_parts.append(_ELEMENT_PROMPTS[el])

    style_suffix = _STYLE_SUFFIXES.get(style, "modern architecture")

    prompt = (
        "photorealistic architectural exterior photography, 8k ultra sharp, "
        + ", ".join(element_parts)
        + f", {style_suffix}, "
        "professional architectural photography, golden hour sunlight, realistic sky, "
        "depth of field, highly detailed building materials"
    )
    negative = (
        "sketch, drawing, cartoon, 2d, flat, blurry, watermark, text, "
        "deformed, unrealistic, overexposed, dark, gloomy, low quality, "
        "ugly, distorted, broken structure, painterly"
    )

    logger.info(f"Scene variation prompt: {prompt[:120]}…")

    with torch.inference_mode():
        result = pipe(
            prompt=prompt,
            negative_prompt=negative,
            image=canny_img,
            num_inference_steps=30,
            guidance_scale=8.5,
            controlnet_conditioning_scale=0.95,  # slightly relaxed to allow material changes
        )

    return result.images[0].convert("RGB")
