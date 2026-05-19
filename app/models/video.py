import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class VideoStatus(str, enum.Enum):
    pending = "pending"
    extracting = "extracting"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Video(Base):
    __tablename__ = "videos"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id = Column(String, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    original_url = Column(String, nullable=False)
    splat_url = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    luma_capture_id = Column(String, nullable=True)
    status = Column(Enum(VideoStatus), default=VideoStatus.pending, nullable=False)
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    file_size_bytes = Column(Integer, default=0)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property = relationship("Property", back_populates="videos")
