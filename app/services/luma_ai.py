import time
import httpx
from app.core.config import settings

BASE_URL = "https://api.lumalabs.ai/dream-machine/v1"


def _headers():
    return {
        "Authorization": f"Bearer {settings.luma_api_key}",
        "Content-Type": "application/json",
    }


def create_capture(video_url: str, title: str = "Property Scan") -> dict:
    """Submit a video URL to Luma AI for 3DGS processing."""
    resp = httpx.post(
        f"{BASE_URL}/generations",
        headers=_headers(),
        json={
            "prompt": title,
            "keyframes": {"frame0": {"type": "upload", "url": video_url}},
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def get_capture_status(capture_id: str) -> dict:
    """Poll the status of a Luma AI generation."""
    resp = httpx.get(
        f"{BASE_URL}/generations/{capture_id}",
        headers=_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def wait_for_capture(capture_id: str, poll_interval: int = 30, max_wait: int = 3600) -> dict:
    """Block until capture is complete or failed. Returns final status dict."""
    elapsed = 0
    while elapsed < max_wait:
        data = get_capture_status(capture_id)
        state = data.get("state", "")
        if state == "completed":
            return data
        if state == "failed":
            raise RuntimeError(f"Luma AI capture failed: {data.get('failure_reason', 'unknown')}")
        time.sleep(poll_interval)
        elapsed += poll_interval
    raise TimeoutError(f"Luma AI capture timed out after {max_wait}s")
