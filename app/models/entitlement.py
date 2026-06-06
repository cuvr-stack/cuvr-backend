import uuid
import random
import string
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def _generate_code() -> str:
    """Generate a human-readable entitlement code: CUVR-YYMMDD-XXXX"""
    date_part = datetime.utcnow().strftime("%y%m%d")
    rand_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"CUVR-{date_part}-{rand_part}"


class Entitlement(Base):
    __tablename__ = "entitlements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String, unique=True, index=True, default=_generate_code)
    property_id: Mapped[str] = mapped_column(String, ForeignKey("properties.id", ondelete="CASCADE"), unique=True)

    # Feature flags
    feat_render_3d: Mapped[bool] = mapped_column(Boolean, default=False)
    feat_walkthrough: Mapped[bool] = mapped_column(Boolean, default=False)
    feat_virtual_staging: Mapped[bool] = mapped_column(Boolean, default=False)
    feat_floor_plan: Mapped[bool] = mapped_column(Boolean, default=False)
    feat_sketch_render: Mapped[bool] = mapped_column(Boolean, default=False)

    # Metadata
    package_name: Mapped[str | None] = mapped_column(String, nullable=True)   # "Base", "Standard", "Full"
    status: Mapped[str] = mapped_column(String, default="active")              # active | suspended | expired
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    property: Mapped["Property"] = relationship("Property", back_populates="entitlement")
