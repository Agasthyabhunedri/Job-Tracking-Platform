"""Payment Plans Service - Subscriptions, billing history, and plan management."""
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timedelta
from decimal import Decimal

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Numeric, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/jobtracker")
SERVICE_NAME = "payment-service"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

PLANS = [
    {"id": "free", "name": "Free", "price": 0.0, "interval": "month", "application_limit": 10, "popular": False,
     "features": ["Up to 10 applications", "Basic analytics", "Email notifications", "Company tracking"]},
    {"id": "pro", "name": "Pro", "price": 9.99, "interval": "month", "application_limit": None, "popular": True,
     "features": ["Unlimited applications", "Advanced analytics", "AI recommendations", "Priority support", "Export data", "Interview tracking"]},
    {"id": "premium", "name": "Premium", "price": 19.99, "interval": "month", "application_limit": None, "popular": False,
     "features": ["Everything in Pro", "AI-powered resume analysis", "Custom pipelines", "API access", "Team sharing", "Dedicated support"]},
]


class Subscription(Base):
    __tablename__ = "payments_subscriptions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, unique=True, nullable=False)
    plan_id = Column(String, default="free")
    plan_name = Column(String, default="Free")
    status = Column(String, default="active")
    current_period_end = Column(DateTime(timezone=True))
    cancel_at_period_end = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class BillingHistory(Base):
    __tablename__ = "payments_billing_history"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String, default="paid")
    description = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "Payment service started"}))
    yield


app = FastAPI(title="Payment Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class SubscriptionIn(BaseModel):
    plan_id: str


class WebhookEvent(BaseModel):
    event_type: str
    user_id: int
    plan_id: str
    amount: Optional[float] = None


@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readiness(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/payments/plans")
def list_plans():
    return PLANS


@app.get("/payments/subscription")
def get_subscription(user_id: int = Query(...), db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if not sub:
        sub = Subscription(user_id=user_id, plan_id="free", plan_name="Free",
                           status="active", current_period_end=datetime.utcnow() + timedelta(days=30))
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return {"id": sub.id, "plan_id": sub.plan_id, "plan_name": sub.plan_name, "status": sub.status,
            "current_period_end": str(sub.current_period_end), "cancel_at_period_end": sub.cancel_at_period_end}


@app.post("/payments/subscription")
def update_subscription(req: SubscriptionIn, user_id: int = Query(...), db: Session = Depends(get_db)):
    plan = next((p for p in PLANS if p["id"] == req.plan_id), None)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan")
    period_end = datetime.utcnow() + timedelta(days=30)
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if sub:
        sub.plan_id = plan["id"]
        sub.plan_name = plan["name"]
        sub.current_period_end = period_end
        sub.updated_at = datetime.utcnow()
    else:
        sub = Subscription(user_id=user_id, plan_id=plan["id"], plan_name=plan["name"],
                           status="active", current_period_end=period_end)
        db.add(sub)
    if plan["price"] > 0:
        billing = BillingHistory(user_id=user_id, amount=Decimal(str(plan["price"])),
                                 status="paid", description=f"{plan['name']} plan subscription")
        db.add(billing)
    db.commit()
    db.refresh(sub)
    logger.info(json.dumps({"event": "payment.plan_updated", "user_id": user_id, "plan_id": plan["id"]}))
    return {"id": sub.id, "plan_id": sub.plan_id, "plan_name": sub.plan_name, "status": sub.status,
            "current_period_end": str(sub.current_period_end), "cancel_at_period_end": sub.cancel_at_period_end}


@app.get("/payments/billing-history")
def get_billing_history(user_id: int = Query(...), db: Session = Depends(get_db)):
    rows = db.query(BillingHistory).filter(BillingHistory.user_id == user_id).order_by(BillingHistory.created_at.desc()).all()
    return [{"id": r.id, "amount": float(r.amount), "status": r.status,
             "description": r.description, "created_at": str(r.created_at)} for r in rows]


@app.post("/payments/webhook")
def stripe_webhook(event: WebhookEvent, db: Session = Depends(get_db)):
    """Mock Stripe-style webhook endpoint for payment events."""
    logger.info(json.dumps({"event": event.event_type, "user_id": event.user_id, "plan_id": event.plan_id}))
    if event.event_type == "invoice.paid" and event.amount:
        billing = BillingHistory(user_id=event.user_id, amount=Decimal(str(event.amount)),
                                 status="paid", description=f"Webhook: {event.plan_id} invoice")
        db.add(billing)
        db.commit()
    return {"received": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8003)), reload=False)
