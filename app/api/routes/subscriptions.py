import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.models.user import User, SubscriptionPlan, SubscriptionStatus
from app.models.subscription import Subscription, SubStatus
from app.api.deps import get_current_user

stripe.api_key = settings.stripe_secret_key

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

PRICE_TO_PLAN = {
    settings.stripe_starter_price_id: "starter",
    settings.stripe_pro_price_id: "professional",
    settings.stripe_enterprise_price_id: "enterprise",
}


class CheckoutRequest(BaseModel):
    price_id: str


@router.get("/current")
def get_current_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if not sub:
        return {"plan": "free", "status": "inactive"}
    return {
        "id": sub.id,
        "plan": sub.plan,
        "status": sub.status,
        "current_period_end": sub.current_period_end,
        "cancel_at_period_end": sub.cancel_at_period_end,
    }


@router.post("/checkout")
def create_checkout_session(
    req: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.price_id not in PRICE_TO_PLAN:
        raise HTTPException(status_code=400, detail="Invalid price ID")

    if not current_user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=current_user.email,
            name=current_user.full_name,
            metadata={"user_id": current_user.id},
        )
        current_user.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=current_user.stripe_customer_id,
        payment_method_types=["card"],
        line_items=[{"price": req.price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.frontend_url}/dashboard/subscription?success=1",
        cancel_url=f"{settings.frontend_url}/dashboard/subscription?cancelled=1",
        metadata={"user_id": current_user.id},
        subscription_data={
            "trial_period_days": 14,
            "metadata": {"user_id": current_user.id},
        },
    )
    return {"checkout_url": session.url}


@router.post("/portal")
def create_billing_portal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")
    session = stripe.billing_portal.Session.create(
        customer=current_user.stripe_customer_id,
        return_url=f"{settings.frontend_url}/dashboard/subscription",
    )
    return {"portal_url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.stripe_webhook_secret
        )
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    db = next(get_db())
    try:
        _handle_stripe_event(event, db)
    finally:
        db.close()

    return {"received": True}


def _handle_stripe_event(event: dict, db: Session):
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        _sync_subscription(data, db)
    elif event_type == "customer.subscription.deleted":
        _cancel_subscription(data, db)
    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            user.subscription_status = SubscriptionStatus.past_due
            sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
            if sub:
                sub.status = SubStatus.past_due
            db.commit()


def _sync_subscription(stripe_sub: dict, db: Session):
    customer_id = stripe_sub["customer"]
    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    plan_name = PRICE_TO_PLAN.get(price_id, "free")
    stripe_status = stripe_sub["status"]
    status_map = {
        "active": SubStatus.active, "trialing": SubStatus.trialing,
        "past_due": SubStatus.past_due, "canceled": SubStatus.cancelled,
        "incomplete": SubStatus.inactive, "incomplete_expired": SubStatus.inactive,
    }
    db_status = status_map.get(stripe_status, SubStatus.inactive)

    from datetime import datetime
    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not sub:
        sub = Subscription(user_id=user.id)
        db.add(sub)

    sub.stripe_subscription_id = stripe_sub["id"]
    sub.stripe_price_id = price_id
    sub.plan = plan_name
    sub.status = db_status
    sub.current_period_start = datetime.fromtimestamp(stripe_sub["current_period_start"])
    sub.current_period_end = datetime.fromtimestamp(stripe_sub["current_period_end"])
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)

    user.subscription_plan = SubscriptionPlan(plan_name)
    user.subscription_status = SubscriptionStatus(db_status.value)
    db.commit()


def _cancel_subscription(stripe_sub: dict, db: Session):
    customer_id = stripe_sub["customer"]
    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return
    user.subscription_plan = SubscriptionPlan.free
    user.subscription_status = SubscriptionStatus.cancelled
    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if sub:
        sub.status = SubStatus.cancelled
        sub.plan = "free"
    db.commit()
