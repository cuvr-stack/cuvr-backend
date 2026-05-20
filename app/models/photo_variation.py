import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class VariationStatus(str, enum.Enum):
    pending    = "pending"
    processing = "processing"
    ready      = "ready"
    failed     = "failed"


class PhotoVariation(Base):
    __tablename__ = "photo_variations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    photo_id: Mapped[str] = mapped_column(String, ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)

    # What the user asked for
    elements: Mapped[str] = mapped_column(String, nullable=False, default="[]")  # JSON list
    style:    Mapped[str] = mapped_column(String, nullable=False, default="Modern")
    color:    Mapped[str] = mapped_column(String, nullable=False, default="")
    prompt:   Mapped[str] = mapped_column(String, nullable=False, default="")    # free-text prompt
    ai_model:       Mapped[str] = mapped_column(String, nullable=False, default="quality")   # standard/quality/ultra
    image_strength: Mapped[int] = mapped_column(nullable=False, default=65)   # 0-100
    style_strength: Mapped[int] = mapped_column(nullable=False, default=75)   # 0-100
    ultra_realism:  Mapped[bool] = mapped_column(nullable=False, default=True)

    # Result
    variation_url: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[VariationStatus]   = mapped_column(
        SAEnum(VariationStatus), default=VariationStatus.pending
    )
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    photo: Mapped["Photo"] = relationship("Photo", back_populates="variations")
