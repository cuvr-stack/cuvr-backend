import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, JSON, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class FloorPlanStatus:
    PENDING     = "pending"
    PARSING     = "parsing"       # GPT-4V reading rooms/walls
    BUILDING    = "building"      # trimesh 3D geometry generation
    TEXTURING   = "texturing"     # FLUX AI applying photorealistic textures
    READY       = "ready"
    FAILED      = "failed"


class FloorPlan(Base):
    __tablename__ = "floor_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True,
                                    default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(
        String, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Source image
    original_url: Mapped[str] = mapped_column(String, nullable=False)
    filename: Mapped[str | None] = mapped_column(String, nullable=True)

    # Pipeline status
    status: Mapped[str] = mapped_column(String, default=FloorPlanStatus.PENDING)
    progress: Mapped[int] = mapped_column(Integer, default=0)   # 0-100
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    # Parsed data (from GPT-4 Vision)
    parsed_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # {
    #   "rooms": [...],  "walls": [...],  "doors": [...],  "windows": [...],
    #   "total_width_cm": float, "total_height_cm": float
    # }

    # Generated assets
    glb_url: Mapped[str | None] = mapped_column(String, nullable=True)      # 3D mesh
    nav_nodes: Mapped[list | None] = mapped_column(JSON, nullable=True)     # walkthrough nodes
    room_textures: Mapped[dict | None] = mapped_column(JSON, nullable=True) # {room_id: texture_url}

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property: Mapped["Property"] = relationship("Property")
