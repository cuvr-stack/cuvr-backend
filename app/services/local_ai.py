"""
Local AI engine — FLUX + Stable Diffusion on GPU (CUDA/MPS) or CPU.

Primary pipelines (FLUX — 2024, Black Forest Labs):
  1. generate_scene_variation  — FLUX Dev img2img → photorealistic render
  2. render_sketch_local       — FLUX Dev img2img → render from sketch
  3. stage_room_local          — FLUX Dev img2img → furnished room

Legacy SD 1.5 pipelines (kept as low-VRAM fallback):
  _get_controlnet_pipe  — SD 1.5 + ControlNet Canny
  _get_img2img_pipe     — SD 1.5 img2img

VRAM requirements:
  FLUX Dev  (bfloat16)   → 24 GB  (RTX 3090 / A100 / H100)
  FLUX Dev  (float8)     → 12 GB  (RTX 3080 Ti / 4070 Ti)
  SD 1.5    (float16)    →  4 GB  (any modern GPU, fallback)

The code auto-selects: FLUX if VRAM >= 12 GB, else SD 1.5 fallback.
"""
import io
import logging
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ── Optional torch ────────────────────────────────────────────────────────────
try:
    import torch
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    logger.warning("torch not available — AI pipelines disabled, falling back to Replicate API")

# ── Model constants ───────────────────────────────────────────────────────────
FLUX_DEV_MODEL     = "black-forest-labs/FLUX.1-dev"
FLUX_SCHNELL_MODEL = "black-forest-labs/FLUX.1-schnell"
SD15_BASE_MODEL    = "stable-diffusion-v1-5/stable-diffusion-v1-5"
CONTROLNET_CANNY   = "lllyasviel/sd-controlnet-canny"

# ── Pipeline cache ────────────────────────────────────────────────────────────
_flux_img2img_pipe  = None
_flux_text2img_pipe = None
_controlnet_pipe    = None   # SD 1.5 fallback
_img2img_pipe       = None   # SD 1.5 fallback


# ── Device / dtype helpers ────────────────────────────────────────────────────

def _device() -> str:
    if not _TORCH_AVAILABLE:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _vram_gb() -> float:
    """Return available GPU VRAM in GB, or 0 if no CUDA GPU."""
    if not _TORCH_AVAILABLE or not torch.cuda.is_available():
        return 0.0
    return torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)


def _use_flux() -> bool:
    """True when GPU has enough VRAM to run FLUX Dev (≥ 12 GB)."""
    return _TORCH_AVAILABLE and _vram_gb() >= 12.0


def _flux_dtype():
    """bfloat16 on CUDA (FLUX requirement), float32 elsewhere."""
    if _TORCH_AVAILABLE and torch.cuda.is_available():
        return torch.bfloat16
    return torch.float32


def _sd_dtype():
    if _TORCH_AVAILABLE and torch.cuda.is_available():
        return torch.float16
    return torch.float32


# ── Canny edge extraction (used by SD 1.5 ControlNet path) ───────────────────

def _extract_canny(image: Image.Image) -> Image.Image:
    import cv2
    gray   = np.array(image.convert("L"))
    median = int(np.median(gray))
    low    = max(0,   int(0.66 * median))
    high   = min(255, int(1.33 * median))
    edges  = cv2.Canny(gray, low, high)
    kernel = np.ones((2, 2), np.uint8)
    edges  = cv2.dilate(edges, kernel, iterations=1)
    return Image.fromarray(cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB))


def _resize_preserve_aspect(image: Image.Image, max_dim: int = 1024) -> Image.Image:
    w, h   = image.size
    scale  = min(max_dim / w, max_dim / h)
    # FLUX needs multiples of 16; SD 1.5 needs multiples of 8
    mult   = 16 if _use_flux() else 8
    new_w  = max(mult, (round(w * scale) // mult) * mult)
    new_h  = max(mult, (round(h * scale) // mult) * mult)
    return image.resize((new_w, new_h), Image.LANCZOS)


# ── FLUX pipeline loaders ─────────────────────────────────────────────────────

def _get_flux_img2img_pipe():
    global _flux_img2img_pipe
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")
    if not _use_flux():
        raise RuntimeError(
            f"Insufficient VRAM for FLUX ({_vram_gb():.1f} GB available, 12 GB required). "
            "Falling back to SD 1.5."
        )
    if _flux_img2img_pipe is not None:
        return _flux_img2img_pipe

    from diffusers import FluxImg2ImgPipeline

    device = _device()
    dtype  = _flux_dtype()
    logger.info(f"Loading FLUX Dev img2img pipeline (device={device}, dtype={dtype}, VRAM={_vram_gb():.1f}GB)…")

    pipe = FluxImg2ImgPipeline.from_pretrained(
        FLUX_DEV_MODEL,
        torch_dtype=dtype,
    )
    pipe = pipe.to(device)
    pipe.enable_attention_slicing()

    # Enable memory-efficient VAE if VRAM is tight (12–16 GB)
    if _vram_gb() < 16:
        pipe.enable_sequential_cpu_offload()
        logger.info("CPU offload enabled for FLUX (tight VRAM)")

    _flux_img2img_pipe = pipe
    logger.info("FLUX Dev img2img pipeline cached ✓")
    return _flux_img2img_pipe


def _get_flux_text2img_pipe():
    global _flux_text2img_pipe
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")
    if not _use_flux():
        raise RuntimeError(f"Insufficient VRAM for FLUX ({_vram_gb():.1f} GB).")
    if _flux_text2img_pipe is not None:
        return _flux_text2img_pipe

    from diffusers import FluxPipeline

    device = _device()
    dtype  = _flux_dtype()
    logger.info(f"Loading FLUX Schnell text2img pipeline (device={device})…")

    pipe = FluxPipeline.from_pretrained(FLUX_SCHNELL_MODEL, torch_dtype=dtype)
    pipe = pipe.to(device)

    _flux_text2img_pipe = pipe
    logger.info("FLUX Schnell text2img pipeline cached ✓")
    return _flux_text2img_pipe


# ── SD 1.5 fallback pipeline loaders (low VRAM, ≥ 4 GB) ─────────────────────

def _get_controlnet_pipe():
    global _controlnet_pipe
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")
    if _controlnet_pipe is not None:
        return _controlnet_pipe

    from diffusers import StableDiffusionControlNetPipeline, ControlNetModel, UniPCMultistepScheduler

    device = _device()
    dtype  = _sd_dtype()
    logger.info(f"Loading SD 1.5 ControlNet-Canny pipeline (device={device}, VRAM={_vram_gb():.1f}GB)…")

    controlnet = ControlNetModel.from_pretrained(CONTROLNET_CANNY, torch_dtype=dtype)
    pipe = StableDiffusionControlNetPipeline.from_pretrained(
        SD15_BASE_MODEL, controlnet=controlnet, torch_dtype=dtype, safety_checker=None,
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to(device)
    pipe.enable_attention_slicing()

    _controlnet_pipe = pipe
    logger.info("SD 1.5 ControlNet-Canny pipeline cached ✓")
    return _controlnet_pipe


def _get_img2img_pipe():
    global _img2img_pipe
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")
    if _img2img_pipe is not None:
        return _img2img_pipe

    from diffusers import StableDiffusionImg2ImgPipeline, UniPCMultistepScheduler

    device = _device()
    dtype  = _sd_dtype()
    logger.info(f"Loading SD 1.5 img2img pipeline (device={device})…")

    pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
        SD15_BASE_MODEL, torch_dtype=dtype, safety_checker=None,
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to(device)
    pipe.enable_attention_slicing()

    _img2img_pipe = pipe
    logger.info("SD 1.5 img2img pipeline cached ✓")
    return _img2img_pipe


# ── Prompt builders ───────────────────────────────────────────────────────────

def _build_flux_prompt(prompt: str, ultra_realism: bool = True) -> str:
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
            "perfect exposure, crisp architectural details"
        )
    return base


def _build_sd_prompt(style: str, room_type: str):
    is_exterior = "exterior" in room_type.lower() or "building" in room_type.lower()
    if is_exterior:
        prompt = (
            f"photorealistic architectural exterior, {style} style, "
            "sharp architectural details, professional architectural photography, "
            "golden hour sunlight, realistic sky with clouds, highly detailed, 8k"
        )
    else:
        prompt = (
            f"photorealistic {style} {room_type} interior design, "
            "natural light, professional interior photography, "
            "high-end materials, realistic textures, 8k ultra realistic"
        )
    negative = (
        "sketch, drawing, cartoon, blurry, watermark, text, deformed, "
        "unrealistic, low quality, ugly, distorted"
    )
    return prompt, negative


# ── Public API ────────────────────────────────────────────────────────────────

def generate_scene_variation(
    image: Image.Image,
    elements: list = None,
    style: str = "Modern",
    color: str = "",
    prompt: str = "",
    image_strength: int = 65,
    style_strength: int = 75,
    ultra_realism: bool = True,
) -> Image.Image:
    """
    Re-render architectural exterior preserving building structure.

    Auto-selects pipeline:
      VRAM ≥ 12 GB → FLUX Dev img2img  (best quality, same as Replicate path)
      VRAM < 12 GB → SD 1.5 ControlNet (compatible with smaller GPUs)
      No GPU       → raises RuntimeError → Celery task falls back to Replicate
    """
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")

    img_resized = _resize_preserve_aspect(image, max_dim=1024)
    use_flux    = _use_flux()

    logger.info(
        f"generate_scene_variation: use_flux={use_flux}, "
        f"VRAM={_vram_gb():.1f}GB, device={_device()}"
    )

    if use_flux:
        # ── FLUX Dev img2img path ─────────────────────────────────────────────
        pipe = _get_flux_img2img_pipe()

        # Map sliders to FLUX parameters
        prompt_strength = 0.35 + (image_strength / 100) * 0.50   # 0.35 – 0.85
        guidance        = 1.5  + (style_strength  / 100) * 3.0   # 1.5  – 4.5

        full_prompt = _build_flux_prompt(prompt or style, ultra_realism)

        with torch.inference_mode():
            result = pipe(
                prompt=full_prompt,
                image=img_resized,
                strength=prompt_strength,
                num_inference_steps=28,
                guidance_scale=guidance,
            )
        return result.images[0].convert("RGB")

    else:
        # ── SD 1.5 ControlNet fallback (low VRAM) ────────────────────────────
        logger.info(f"Using SD 1.5 ControlNet fallback (VRAM={_vram_gb():.1f}GB < 12GB)")
        pipe = _get_controlnet_pipe()

        canny_img = _extract_canny(img_resized)
        full_prompt, negative = _build_sd_prompt(
            prompt or style, "exterior building"
        )
        guidance = 5.0 + (style_strength / 100) * 7.0

        with torch.inference_mode():
            result = pipe(
                prompt=full_prompt,
                negative_prompt=negative,
                image=canny_img,
                num_inference_steps=30,
                guidance_scale=guidance,
                controlnet_conditioning_scale=0.6 + (image_strength / 100) * 0.9,
            )
        return result.images[0].convert("RGB")


def render_sketch_local(
    image: Image.Image,
    style: str = "modern minimalist",
    room_type: str = "exterior building",
) -> Image.Image:
    """Sketch / floor plan → photorealistic render."""
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")

    img_resized = _resize_preserve_aspect(image)

    if _use_flux():
        pipe   = _get_flux_img2img_pipe()
        prompt = _build_flux_prompt(f"{style} {room_type}", ultra_realism=True)
        with torch.inference_mode():
            result = pipe(
                prompt=prompt,
                image=img_resized,
                strength=0.85,
                num_inference_steps=28,
                guidance_scale=3.5,
            )
    else:
        pipe   = _get_controlnet_pipe()
        canny  = _extract_canny(img_resized)
        prompt, negative = _build_sd_prompt(style, room_type)
        with torch.inference_mode():
            result = pipe(
                prompt=prompt,
                negative_prompt=negative,
                image=canny,
                num_inference_steps=30,
                guidance_scale=9.0,
                controlnet_conditioning_scale=1.1,
            )

    return result.images[0].convert("RGB")


def stage_room_local(image: Image.Image, style: str = "modern") -> Image.Image:
    """Empty room photo → furnished room."""
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")

    img_resized = _resize_preserve_aspect(image)

    style_map = {
        "modern":       "modern minimalist interior, clean lines, contemporary furniture, natural light",
        "luxury":       "luxury interior, opulent furniture, marble, gold accents, chandelier",
        "scandinavian": "scandinavian interior, light oak, neutral tones, cozy, linen fabrics",
        "classic":      "classic traditional interior, elegant furniture, rich mahogany, ornate details",
        "minimalist":   "minimalist zen interior, white walls, serene, uncluttered",
        "arabic":       "arabic oriental interior, rich patterns, gold and burgundy, ornate lanterns",
        "industrial":   "industrial loft, exposed brick, steel beams, concrete, Edison bulbs",
    }
    style_desc = style_map.get(style, f"{style} interior design")

    if _use_flux():
        pipe   = _get_flux_img2img_pipe()
        prompt = (
            f"{style_desc}, furnished room, realistic interior photography, "
            "natural daylight, high-end materials, architectural digest quality, "
            "8k ultra realistic, professional staging"
        )
        with torch.inference_mode():
            result = pipe(
                prompt=prompt,
                image=img_resized,
                strength=0.75,
                num_inference_steps=28,
                guidance_scale=3.5,
            )
    else:
        pipe   = _get_img2img_pipe()
        prompt = (
            f"{style_desc}, furnished room, realistic interior photography, "
            "natural daylight, high-end materials, 8k ultra realistic"
        )
        with torch.inference_mode():
            result = pipe(
                prompt=prompt,
                negative_prompt="empty room, no furniture, low quality, blurry, cartoon",
                image=img_resized,
                strength=0.75,
                num_inference_steps=25,
                guidance_scale=8.0,
            )

    return result.images[0].convert("RGB")


def generate_3d_from_views(images: list) -> bytes:
    """Multi-view images → 3D mesh GLB (TripoSR)."""
    if not _TORCH_AVAILABLE:
        raise RuntimeError("PyTorch is not available on this server.")
    try:
        import trimesh
        from tsr.system import TSR
        import tempfile, os

        logger.info(f"generate_3d_from_views: {len(images)} input images")

        primary         = images[0].convert("RGB")
        primary_resized = primary.resize((512, 512), Image.LANCZOS)
        device          = _device()

        model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model = model.to(device)
        model.eval()

        with torch.inference_mode():
            scene_codes = model([primary_resized], device=device)
            meshes      = model.extract_mesh(scene_codes, resolution=256)

        mesh = meshes[0]
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
