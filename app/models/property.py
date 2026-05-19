import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class PropertyType(str, enum.Enum):
    apartment = "apartment"
    house = "house"
    villa = "villa"
    commercial = "commercial"
    land = "land"


class PropertyStatus(str, enum.Enum):
    active = "active"
    archived = "archived"


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    property_type: Mapped[PropertyType] = mapped_column(SAEnum(PropertyType), default=PropertyType.apartment)
    status: Mapped[PropertyStatus] = mapped_column(SAEnum(PropertyStatus), default=PropertyStatus.active)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="properties")
    photos: Mapped[list["Photo"]] = relationship("Photo", back_populates="property", cascade="all, delete-orphan")
    tours: Mapped[list["Tour"]] = relationship("Tour", back_populates="property", cascade="all, delete-orphan")
    videos: Mapped[list["Video"]] = relationship("Video", back_populates="property", cascade="all, delete-orphan")
