"""
floor_plan_ai.py
────────────────
Two AI stages for converting a floor plan image into a realistic 3D walkthrough.
Both stages run 100% on Replicate — no OpenAI key required.

Stage 1 – Claude Sonnet 4.6  (parse_floor_plan)
  anthropic/claude-sonnet-4.6 on Replicate.
  Reads the architectural drawing and returns structured JSON:
  rooms, walls, doors, windows, dimensions, room types.

Stage 2 – FLUX Schnell  (generate_room_texture)
  black-forest-labs/flux-schnell on Replicate.
  Generates a photorealistic interior photo per room type,
  applied as a texture in Unity.
"""

import io
import base64
import json
import logging
import os
import re
import httpx
from PIL import Image

logger = logging.getLogger(__name__)

# ── Material prompts per room type ────────────────────────────────────────────

ROOM_TEXTURE_PROMPTS: dict[str, str] = {
    "master_bedroom": (
        "photorealistic luxury master bedroom interior, king size bed with white linen, "
        "wooden parquet floor, warm ambient lighting, large windows with sheer curtains, "
        "modern minimalist furniture, 8k quality"
    ),
    "bedroom": (
        "photorealistic cozy bedroom interior, queen bed, light wooden floor, "
        "soft warm lighting, built-in wardrobe, clean modern design, 8k quality"
    ),
    "kitchen": (
        "photorealistic modern kitchen interior, granite countertops, stainless steel appliances, "
        "white cabinets, ceramic tile floor, pendant lighting, 8k quality"
    ),
    "living": (
        "photorealistic bright living room interior, comfortable sofa, coffee table, "
        "large windows with natural light, hardwood floor, contemporary design, 8k quality"
    ),
    "dining": (
        "photorealistic elegant dining room, large dining table with 6 chairs, "
        "pendant light over table, hardwood floor, open plan feel, 8k quality"
    ),
    "bathroom": (
        "photorealistic modern bathroom interior, walk-in shower, white tiles, "
        "floating vanity, ambient LED lighting, chrome fixtures, 8k quality"
    ),
    "toilet": (
        "photorealistic compact bathroom, wall-mounted toilet, small vanity, "
        "white ceramic tiles, clean and bright, 8k quality"
    ),
    "study": (
        "photorealistic home office study, built-in bookshelf, wooden desk, "
        "ergonomic chair, warm reading light, wooden floor, 8k quality"
    ),
    "hallway": (
        "photorealistic modern hallway corridor, polished marble floor, "
        "recessed ceiling lights, light walls, clean minimal design, 8k quality"
    ),
    "foyer": (
        "photorealistic elegant entrance foyer, statement light fixture, "
        "marble floor, console table with mirror, 8k quality"
    ),
    "family_living": (
        "photorealistic spacious family living room, large L-shaped sofa, "
        "tv unit, children play area, warm lighting, hardwood floor, 8k quality"
    ),
    "courtyard": (
        "photorealistic open-air courtyard, natural stone floor, "
        "tropical plants, water feature, open sky, afternoon sunlight, 8k quality"
    ),
    "storage": (
        "photorealistic clean storage room, built-in shelving, "
        "organised boxes and items, LED strip lighting, 8k quality"
    ),
    "powder_room": (
        "photorealistic powder room, decorative wallpaper, pedestal sink, "
        "ornate mirror, warm ambient lighting, 8k quality"
    ),
    "landscape": (
        "photorealistic prayer/meditation room, soft lighting, "
        "clean carpet floor, minimalist decor, peaceful atmosphere, 8k quality"
    ),
    "default": (
        "photorealistic modern interior room, neutral walls, hardwood floor, "
        "natural light, minimalist furniture, 8k quality"
    ),
}


def _room_type_key(label: str) -> str:
    """Map a room label to a texture prompt key."""
    label_lower = label.lower().replace(" ", "_")
    for key in ROOM_TEXTURE_PROMPTS:
        if key in label_lower:
            return key
    # Fuzzy fallbacks
    if "bed" in label_lower or "master" in label_lower:
        return "master_bedroom" if "master" in label_lower else "bedroom"
    if "kitchen" in label_lower or "cook" in label_lower:
        return "kitchen"
    if "living" in label_lower or "lounge" in label_lower:
        return "living"
    if "dining" in label_lower:
        return "dining"
    if "bath" in label_lower or "toilet" in label_lower or "wc" in label_lower:
        return "bathroom"
    if "hall" in label_lower or "corridor" in label_lower:
        return "hallway"
    if "foyer" in label_lower or "entry" in label_lower or "entrance" in label_lower:
        return "foyer"
    if "study" in label_lower or "office" in label_lower:
        return "study"
    if "court" in label_lower:
        return "courtyard"
    return "default"


# ── Stage 1: Claude Sonnet 4.6 – parse floor plan ────────────────────────────
# Runs on Replicate — no OpenAI key needed.
# Note: meta/llama-3.2-90b-vision-instruct was removed from Replicate.
# Using anthropic/claude-sonnet-4.6 which has superior floor plan understanding.

CLAUDE_VISION_MODEL = "anthropic/claude-sonnet-4.6"

PARSE_SYSTEM_PROMPT = """You are an expert architectural floor plan analyser.
When given a floor plan image, extract ALL rooms and spaces and return ONLY valid JSON — no markdown, no commentary, no extra text.

JSON schema:
{
  "total_width_cm": <number>,
  "total_height_cm": <number>,
  "rooms": [
    {
      "id": "room_0",
      "name": "<exact label from drawing>",
      "type": "<one of: master_bedroom|bedroom|kitchen|living|dining|bathroom|toilet|hallway|foyer|study|storage|courtyard|family_living|powder_room|landscape|default>",
      "width_cm": <number>,
      "height_cm": <number>,
      "x_pct": <0-100, left edge % of total width>,
      "y_pct": <0-100, top edge % of total height>,
      "w_pct": <0-100, room width % of total width>,
      "h_pct": <0-100, room height % of total height>,
      "level_cm": <number, elevation in cm, default 0>
    }
  ],
  "doors": [
    {
      "room_from": "room_0",
      "room_to": "room_1",
      "x_pct": <number>,
      "y_pct": <number>
    }
  ]
}

Rules:
- Extract EVERY labelled space shown in the drawing.
- Use dimensions written on the drawing (e.g. "350 X 400" → width=350cm, height=400cm).
- Estimate position percentages from the drawing layout.
- level_cm comes from labels like "+45 lvl" → 45, "+30 lvl" → 30.
- For doors leading outside, set room_to as "exterior".
- Respond with JSON only."""

PARSE_PROMPT = "Analyse this floor plan image and return the JSON as specified in your instructions."


def parse_floor_plan(image_bytes: bytes, replicate_token: str) -> dict:
    """
    Call Claude Sonnet 4.6 on Replicate to parse a floor plan image.
    Uses only REPLICATE_API_TOKEN — no OpenAI key needed.
    Returns the parsed dict.
    """
    import replicate as _replicate

    os.environ["REPLICATE_API_TOKEN"] = replicate_token

    b64  = base64.b64encode(image_bytes).decode()
    data_uri = f"data:image/jpeg;base64,{b64}"

    logger.info("[FloorPlanAI] Calling Claude Sonnet 4.6 Vision on Replicate...")

    # Claude on Replicate returns a generator of string tokens
    output = _replicate.run(
        CLAUDE_VISION_MODEL,
        input={
            "image":         data_uri,
            "prompt":        PARSE_PROMPT,
            "system_prompt": PARSE_SYSTEM_PROMPT,
            "max_tokens":    4096,
        }
    )

    # Join streamed tokens into one string
    content = "".join(str(token) for token in output).strip()

    # Strip markdown code fences if the model adds them
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```\s*$",       "", content.strip())

    # Find the JSON object in case there's surrounding text
    match = re.search(r"\{.*\}", content, re.DOTALL)
    if match:
        content = match.group(0)

    parsed = json.loads(content)
    logger.info(f"[FloorPlanAI] Parsed {len(parsed.get('rooms', []))} rooms")
    return parsed


# ── Stage 2: FLUX – generate photorealistic room texture ──────────────────────

def generate_room_texture(
    room_type: str,
    replicate_token: str,
    width: int = 1024,
    height: int = 1024,
) -> bytes:
    """
    Generate a photorealistic interior texture image for a room type using
    FLUX Schnell (fast, high-quality text→image).
    Returns JPEG bytes.
    """
    import replicate as _replicate
    import os

    os.environ["REPLICATE_API_TOKEN"] = replicate_token

    prompt_key  = _room_type_key(room_type)
    prompt      = ROOM_TEXTURE_PROMPTS.get(prompt_key, ROOM_TEXTURE_PROMPTS["default"])

    # Round to multiples of 16 (FLUX requirement)
    w = (width  // 16) * 16
    h = (height // 16) * 16

    output = _replicate.run(
        "black-forest-labs/flux-schnell",
        input={
            "prompt":           prompt,
            "width":            w,
            "height":           h,
            "num_outputs":      1,
            "output_format":    "jpg",
            "output_quality":   90,
            "num_inference_steps": 4,
        }
    )

    url = str(getattr(output[0], "url", None) or output[0])
    with httpx.Client(timeout=120) as client:
        img_resp = client.get(url)
        img_resp.raise_for_status()
        return img_resp.content


def generate_room_textures_batch(
    rooms: list[dict],
    replicate_token: str,
    progress_cb=None,
) -> dict[str, bytes]:
    """
    Generate textures for all rooms. Returns {room_id: jpeg_bytes}.
    Deduplicates by room type so identical room types share one texture call.
    """
    # Deduplicate by type
    type_map: dict[str, bytes] = {}
    result:   dict[str, bytes] = {}

    for i, room in enumerate(rooms):
        rtype = room.get("type", "default")
        key   = _room_type_key(rtype)

        if key not in type_map:
            logger.info(f"[FloorPlanAI] Generating texture for type '{key}'...")
            type_map[key] = generate_room_texture(rtype, replicate_token)

        result[room["id"]] = type_map[key]

        if progress_cb:
            progress_cb(int(60 + 30 * (i + 1) / len(rooms)))

    return result
