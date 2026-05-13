"""Analytics Service - Application stats, conversion rates, and trend data."""
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timedelta

import uvicorn
import redis
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, text, func as sqlfunc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/jobtracker")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
SERVICE_NAME = "analytics-service"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

CACHE_TTL = 300  # 5 minutes


class Application(Base):
    __tablename__ = "jobs_applications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    company_id = Column(Integer)
    job_title = Column(String)
    status = Column(String)
    applied_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))


class Company(Base):
    __tablename__ = "jobs_companies"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    name = Column(String)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    event_type = Column(String, nullable=False)
    payload = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=sqlfunc.now())


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "Analytics service started"}))
    yield


app = FastAPI(title="Analytics Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def cached(key: str):
    if redis_client:
        val = redis_client.get(key)
        if val:
            return json.loads(val)
    return None


def cache_set(key: str, value):
    if redis_client:
        redis_client.setex(key, CACHE_TTL, json.dumps(value))


@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readiness(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/analytics/summary")
def summary(user_id: int = Query(...), db: Session = Depends(get_db)):
    cache_key = f"analytics:summary:{user_id}"
    hit = cached(cache_key)
    if hit:
        return hit

    apps = db.query(Application).filter(Application.user_id == user_id).all()
    total = len(apps)
    active = sum(1 for a in apps if a.status not in ("rejected", "withdrawn", "offer"))
    interviews = sum(1 for a in apps if a.status in ("interview", "offer"))
    offers = sum(1 for a in apps if a.status == "offer")
    rejected = sum(1 for a in apps if a.status == "rejected")
    now = datetime.utcnow()
    this_week = sum(1 for a in apps if a.created_at and a.created_at.replace(tzinfo=None) >= now - timedelta(days=7))
    this_month = sum(1 for a in apps if a.created_at and a.created_at.replace(tzinfo=None) >= now - timedelta(days=30))

    result = {
        "total_applications": total,
        "active_applications": active,
        "interview_rate": round(interviews / total * 100, 1) if total > 0 else 0,
        "offer_rate": round(offers / total * 100, 1) if total > 0 else 0,
        "rejection_rate": round(rejected / total * 100, 1) if total > 0 else 0,
        "avg_response_days": 0,
        "this_week": this_week,
        "this_month": this_month,
    }
    cache_set(cache_key, result)
    return result


@app.get("/analytics/pipeline")
def pipeline(user_id: int = Query(...), db: Session = Depends(get_db)):
    apps = db.query(Application.status).filter(Application.user_id == user_id).all()
    stages = [
        {"status": "applied", "label": "Applied"},
        {"status": "screening", "label": "Screening"},
        {"status": "interview", "label": "Interview"},
        {"status": "offer", "label": "Offer"},
        {"status": "rejected", "label": "Rejected"},
        {"status": "withdrawn", "label": "Withdrawn"},
    ]
    status_counts = {}
    for (s,) in apps:
        status_counts[s] = status_counts.get(s, 0) + 1
    return [{"status": s["status"], "label": s["label"], "count": status_counts.get(s["status"], 0)} for s in stages]


@app.get("/analytics/weekly")
def weekly(user_id: int = Query(...), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    weeks = []
    for i in range(7, -1, -1):
        start = now - timedelta(weeks=i + 1)
        end = now - timedelta(weeks=i)
        count = db.query(Application).filter(
            Application.user_id == user_id,
            Application.created_at >= start,
            Application.created_at < end
        ).count()
        weeks.append({"week": start.strftime("%b %d"), "count": count})
    return weeks


@app.get("/analytics/top-companies")
def top_companies(user_id: int = Query(...), db: Session = Depends(get_db)):
    rows = (
        db.query(Company.name, sqlfunc.count(Application.id).label("count"))
        .join(Application, Application.company_id == Company.id)
        .filter(Application.user_id == user_id)
        .group_by(Company.name)
        .order_by(sqlfunc.count(Application.id).desc())
        .limit(10)
        .all()
    )
    return [{"company_name": name or "Unknown", "count": count} for name, count in rows]


@app.post("/analytics/track")
def track_event(user_id: int = Query(...), event_type: str = Query(...),
                payload: Optional[str] = None, db: Session = Depends(get_db)):
    event = AnalyticsEvent(user_id=user_id, event_type=event_type, payload=payload)
    db.add(event)
    db.commit()
    return {"tracked": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8005)), reload=False)
