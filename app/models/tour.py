import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Boolean, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Tour(Base):
    __tablename__ = "tours"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    property_id: Mapped[str] = mapped_column(String, ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    share_token: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property: Mapped["Property"] = relationship("Property", back_populates="tours")
    scenes: Mapped[list["TourScene"]] = relationship(
        "TourScene", back_populates="tour", cascade="all, delete-orphan", order_by="TourScene.order"
    )


class TourScene(Base):
    __tablename__ = "tour_scenes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tour_id: Mapped[str] = mapped_column(String, ForeignKey("tours.id", ondelete="CASCADE"), nullable=False)
    photo_id: Mapped[str] = mapped_column(String, ForeignKey("photos.id", ondelete="CASCADE"), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    hotspots: Mapped[dict] = mapped_column(JSON, default=list)

    tour: Mapped["Tour"] = relationship("Tour", back_populates="scenes")
    photo: Mapped["Photo"] = relationship("Photo")
