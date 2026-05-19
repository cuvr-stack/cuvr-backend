import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class ProcessingStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(String, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    room_label: Mapped[str | None] = mapped_column(String, nullable=True)
    original_url: Mapped[str] = mapped_column(String, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    depth_map_url: Mapped[str | None] = mapped_column(String, nullable=True)
    mesh_url: Mapped[str | None] = mapped_column(String, nullable=True)
    asset_bundle_url: Mapped[str | None] = mapped_column(String, nullable=True)
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        SAEnum(ProcessingStatus), default=ProcessingStatus.pending
    )
    processing_progress: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property: Mapped["Property"] = relationship("Property", back_populates="photos")
