import base64
import httpx
import time
from app.core.config import settings

BASE_URL = "https://api.replicate.com/v1"

VIRTUAL_STAGING_MODEL = "adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38"
SKETCH_RENDER_MODEL = "jagilley/controlnet-scribble:435061a1b5a4c1e26740464bf786efdfa9cb3a3ac488595a2de23e143fdb0117"


def _headers():
    return {
        "Authorization": f"Token {settings.replicate_api_token}",
        "Content-Type": "application/json",
    }


def _run_prediction_latest(model: str, inputs: dict) -> str:
    """Run a model at its latest deployed version (no version hash needed)."""
    resp = httpx.post(
        f"{BASE_URL}/models/{model}/predictions",
        headers=_headers(),
        json={"input": inputs},
        timeout=60,
    )
    resp.raise_for_status()
    prediction = resp.json()
    prediction_id = prediction["id"]

    for _ in range(120):
        time.sleep(5)
        poll = httpx.get(
            f"{BASE_URL}/predictions/{prediction_id}",
            headers=_headers(),
            timeout=30,
        )
        poll.raise_for_status()
        data = poll.json()
        status = data.get("status")
        if status == "succeeded":
            output = data.get("output")
            if isinstance(output, list):
                return output[-1]
            return output
        if status == "failed":
            raise RuntimeError(f"Replicate prediction failed: {data.get('error', 'unknown')}")

    raise TimeoutError("Replicate prediction timed out")


def generate_depth_pro(image_bytes: bytes, content_type: str = "image/jpeg") -> bytes:
    """Apple Depth Pro: high-quality monocular depth estimation.
    Accepts raw image bytes, returns depth map PNG bytes."""
    b64 = base64.b64encode(image_bytes).decode()
    data_uri = f"data:{content_type};base64,{b64}"
    output_url = _run_prediction_latest(
        "garg-aayush/ml-depth-pro",
        {"image": data_uri},
    )
    resp = httpx.get(output_url, timeout=120)
    resp.raise_for_status()
    return resp.content


def _run_prediction(model_version: str, inputs: dict) -> str:
    """Submit a prediction and poll until complete. Returns output URL."""
    resp = httpx.post(
        f"{BASE_URL}/predictions",
        headers=_headers(),
        json={"version": model_version, "input": inputs},
        timeout=30,
    )
    resp.raise_for_status()
    prediction = resp.json()
    prediction_id = prediction["id"]

    # Poll for completion
    for _ in range(120):
        time.sleep(5)
        poll = httpx.get(
            f"{BASE_URL}/predictions/{prediction_id}",
            headers=_headers(),
            timeout=30,
        )
        poll.raise_for_status()
        data = poll.json()
        status = data.get("status")
        if status == "succeeded":
            output = data.get("output")
            if isinstance(output, list):
                return output[-1]
            return output
        if status == "failed":
            raise RuntimeError(f"Replicate prediction failed: {data.get('error', 'unknown')}")

    raise TimeoutError("Replicate prediction timed out")


def stage_room(image_url: str, style: str = "modern") -> str:
    """Virtual staging: furnish an empty room. Returns URL of staged image."""
    return _run_prediction(
        VIRTUAL_STAGING_MODEL,
        {
            "image": image_url,
            "prompt": f"A beautifully furnished {style} interior design room, high quality, photorealistic, 8k",
            "negative_prompt": "low quality, blurry, deformed, ugly, text, watermark",
            "guidance_scale": 15,
            "num_inference_steps": 50,
        },
    )


def render_sketch(sketch_url: str, style: str = "modern minimalist", room_type: str = "exterior building") -> str:
    """Convert architectural sketch to photorealistic render. Returns URL of rendered image."""
    from app.services.local_ai import _build_render_prompt
    prompt, negative_prompt = _build_render_prompt(style, room_type)
    return _run_prediction(
        SKETCH_RENDER_MODEL,
        {
            "image": sketch_url,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "num_samples": 1,
            "image_resolution": 512,
            "ddim_steps": 25,
            "scale": 9.5,
        },
    )
