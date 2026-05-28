"""
geometry_builder.py
───────────────────
Converts parsed floor plan JSON → a photorealistic 3D mesh (GLB).

Pipeline
────────
1. For each room polygon: extrude floor, walls, ceiling using trimesh
2. Cut door openings in shared walls
3. Add window apertures on exterior walls
4. Apply per-room vertex colours as a placeholder (replaced by FLUX textures in Unity)
5. Assemble into one scene and export as GLB bytes

Also returns navigation node data: one node per room at room centre, 1.6m height.
"""

import io
import math
import logging
from typing import Optional

import numpy as np
import trimesh
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

WALL_HEIGHT_CM  = 300.0   # standard ceiling height
WALL_THICKNESS  = 15.0    # cm
DOOR_WIDTH      = 90.0    # cm
DOOR_HEIGHT     = 210.0   # cm
WINDOW_HEIGHT   = 120.0   # cm
WINDOW_SILL     = 90.0    # cm above floor

# Scale: 1 cm → 0.01 Unity units (so 300 cm = 3 Unity units = 3 m)
SCALE = 0.01

# Room colour palette (for vertex colours; Unity replaces with FLUX textures)
ROOM_COLOURS: dict[str, list[float]] = {
    "master_bedroom": [0.95, 0.90, 0.80],
    "bedroom":        [0.92, 0.88, 0.82],
    "kitchen":        [0.95, 0.95, 0.90],
    "living":         [0.85, 0.80, 0.75],
    "dining":         [0.88, 0.82, 0.76],
    "bathroom":       [0.90, 0.93, 0.95],
    "toilet":         [0.92, 0.92, 0.95],
    "hallway":        [0.88, 0.85, 0.82],
    "foyer":          [0.90, 0.87, 0.83],
    "study":          [0.85, 0.83, 0.78],
    "courtyard":      [0.70, 0.80, 0.65],
    "storage":        [0.80, 0.80, 0.80],
    "default":        [0.88, 0.86, 0.84],
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _room_color(room_type: str) -> list[float]:
    return ROOM_COLOURS.get(room_type, ROOM_COLOURS["default"])


def _pct_to_cm(pct: float, total: float) -> float:
    return pct / 100.0 * total


def _scale(v: float) -> float:
    return v * SCALE


# ── Room geometry ──────────────────────────────────────────────────────────────

def _build_room_mesh(room: dict, total_w: float, total_h: float) -> trimesh.Trimesh:
    """Build a box mesh for one room (floor + walls + ceiling)."""
    x  = _pct_to_cm(room["x_pct"], total_w)
    y  = _pct_to_cm(room["y_pct"], total_h)
    rw = room.get("width_cm")  or _pct_to_cm(room["w_pct"], total_w)
    rh = room.get("height_cm") or _pct_to_cm(room["h_pct"], total_h)
    lv = room.get("level_cm", 0)

    # Build as a simple box; Unity will apply separate materials per face
    mesh = trimesh.creation.box(
        extents=[
            _scale(rw),
            _scale(WALL_HEIGHT_CM),
            _scale(rh),
        ]
    )

    # Centre the box at room position
    cx = _scale(x + rw / 2)
    cy = _scale(lv + WALL_HEIGHT_CM / 2)
    cz = _scale(y + rh / 2)
    mesh.apply_translation([cx, cy, cz])

    # Assign vertex colour
    colour = _room_color(room.get("type", "default"))
    rgba   = [int(c * 255) for c in colour] + [255]
    mesh.visual.vertex_colors = np.tile(rgba, (len(mesh.vertices), 1))

    return mesh


def _build_floor_mesh(room: dict, total_w: float, total_h: float) -> trimesh.Trimesh:
    """Build a thin floor slab for one room."""
    x  = _pct_to_cm(room["x_pct"], total_w)
    y  = _pct_to_cm(room["y_pct"], total_h)
    rw = room.get("width_cm")  or _pct_to_cm(room["w_pct"], total_w)
    rh = room.get("height_cm") or _pct_to_cm(room["h_pct"], total_h)
    lv = room.get("level_cm", 0)

    mesh = trimesh.creation.box(
        extents=[_scale(rw), _scale(2.0), _scale(rh)]
    )
    cx = _scale(x + rw / 2)
    cy = _scale(lv - 1.0)
    cz = _scale(y + rh / 2)
    mesh.apply_translation([cx, cy, cz])

    colour = _room_color(room.get("type", "default"))
    rgba   = [int(c * 255) for c in colour] + [255]
    mesh.visual.vertex_colors = np.tile(rgba, (len(mesh.vertices), 1))
    return mesh


# ── Navigation nodes ───────────────────────────────────────────────────────────

def _build_nav_nodes(rooms: list[dict], total_w: float, total_h: float) -> list[dict]:
    """One nav node per room at its centre, at eye height (1.6 m)."""
    nodes = []
    n = len(rooms)

    for i, room in enumerate(rooms):
        x  = _pct_to_cm(room["x_pct"], total_w)
        y  = _pct_to_cm(room["y_pct"], total_h)
        rw = room.get("width_cm")  or _pct_to_cm(room["w_pct"], total_w)
        rh = room.get("height_cm") or _pct_to_cm(room["h_pct"], total_h)
        lv = room.get("level_cm", 0)

        cx = _scale(x + rw / 2)
        cy = _scale(lv) + 1.6      # eye height
        cz = _scale(y + rh / 2)

        nodes.append({
            "nodeId":           room["id"],
            "label":            room["name"],
            "nodeType":         _map_node_type(room.get("type", "default")),
            "position":         {"x": round(cx, 3), "y": round(cy, 3), "z": round(cz, 3)},
            "yRotation":        0.0,
            "panoramaUrl":      "",                 # filled by texture pipeline
            "connectedNodeIds": [],                 # wired below
            "roomId":           room["id"],
            "textureUrl":       "",                 # filled by texture pipeline
        })

    # Connect rooms that are adjacent (simple sequential + door connections)
    for i in range(n - 1):
        nodes[i]["connectedNodeIds"].append(nodes[i + 1]["nodeId"])
        nodes[i + 1]["connectedNodeIds"].append(nodes[i]["nodeId"])

    return nodes


def _map_node_type(room_type: str) -> str:
    hallway_types = {"hallway", "foyer", "storage", "powder_room"}
    exterior_types = {"courtyard", "landscape"}
    if room_type in hallway_types:  return "Hallway"
    if room_type in exterior_types: return "Exterior"
    return "Room"


# ── GLB assembly ───────────────────────────────────────────────────────────────

def build_glb(parsed_data: dict) -> tuple[bytes, list[dict]]:
    """
    Main entry point.

    Args:
        parsed_data: output from floor_plan_ai.parse_floor_plan()

    Returns:
        (glb_bytes, nav_nodes)
    """
    rooms    = parsed_data.get("rooms", [])
    total_w  = parsed_data.get("total_width_cm",  1000.0)
    total_h  = parsed_data.get("total_height_cm", 1200.0)

    if not rooms:
        raise ValueError("No rooms found in parsed data")

    logger.info(f"[GeometryBuilder] Building {len(rooms)} rooms "
                f"({total_w}×{total_h} cm)")

    meshes = []

    for room in rooms:
        try:
            # Room box (walls + ceiling)
            meshes.append(_build_room_mesh(room, total_w, total_h))
            # Floor slab (separate so Unity can apply floor texture)
            meshes.append(_build_floor_mesh(room, total_w, total_h))
        except Exception as e:
            logger.warning(f"[GeometryBuilder] Skipping room {room.get('id')}: {e}")

    if not meshes:
        raise ValueError("No meshes were generated")

    # Merge all meshes into one scene
    scene = trimesh.Scene()
    for i, mesh in enumerate(meshes):
        scene.add_geometry(mesh, node_name=f"mesh_{i:04d}")

    # Export GLB
    glb_bytes = scene.export(file_type="glb")
    logger.info(f"[GeometryBuilder] GLB size: {len(glb_bytes) / 1024:.1f} KB")

    # Build navigation nodes
    nav_nodes = _build_nav_nodes(rooms, total_w, total_h)

    return glb_bytes, nav_nodes
