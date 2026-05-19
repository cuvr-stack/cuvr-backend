import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class SubscriptionPlan(str, enum.Enum):
    free = "free"
    starter = "starter"
    professional = "professional"
    enterprise = "enterprise"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    cancelled = "cancelled"
    past_due = "past_due"
    trialing = "trialing"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    subscription_plan: Mapped[SubscriptionPlan] = mapped_column(
        SAEnum(SubscriptionPlan), default=SubscriptionPlan.free
    )
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(SubscriptionStatus), default=SubscriptionStatus.inactive
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    properties: Mapped[list["Property"]] = relationship("Property", back_populates="user", cascade="all, delete-orphan")
    subscription: Mapped["Subscription | None"] = relationship("Subscription", back_populates="user", uselist=False)
