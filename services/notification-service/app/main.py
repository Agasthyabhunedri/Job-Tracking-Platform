"""Notification Service - Consumes events from queue, sends mock emails, stores logs."""
import os
import json
import logging
import time
import threading
from contextlib import asynccontextmanager
from typing import Optional
from collections import deque

import uvicorn
import redis
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/jobtracker")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
SERVICE_NAME = "notification-service"
QUEUE_KEY = "notification_queue"
DLQ_KEY = "notification_dlq"
MAX_RETRIES = 3

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None


class NotificationLog(Base):
    __tablename__ = "notifications_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    read = Column(Boolean, default=False)
    application_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def send_mock_email(user_id: int, subject: str, body: str):
    logger.info(json.dumps({"mock_email": True, "user_id": user_id, "subject": subject, "body": body[:100]}))


def process_notification(payload: dict, db: Session, retries: int = 0):
    try:
        notif = NotificationLog(
            user_id=payload["user_id"],
            type=payload.get("type", "info"),
            title=payload["title"],
            message=payload["message"],
            application_id=payload.get("application_id"),
        )
        db.add(notif)
        db.commit()
        send_mock_email(payload["user_id"], payload["title"], payload["message"])
        logger.info(json.dumps({"event": "notification.sent", "user_id": payload["user_id"], "type": payload.get("type")}))
    except Exception as e:
        if retries < MAX_RETRIES:
            logger.warning(json.dumps({"retry": retries + 1, "error": str(e)}))
            time.sleep(1)
            process_notification(payload, db, retries + 1)
        else:
            logger.error(json.dumps({"dlq": True, "payload": payload, "error": str(e)}))
            if redis_client:
                redis_client.rpush(DLQ_KEY, json.dumps(payload))


def queue_worker():
    while True:
        if redis_client:
            try:
                item = redis_client.blpop(QUEUE_KEY, timeout=5)
                if item:
                    _, raw = item
                    payload = json.loads(raw)
                    db = SessionLocal()
                    try:
                        process_notification(payload, db)
                    finally:
                        db.close()
            except Exception as e:
                logger.error(json.dumps({"worker_error": str(e)}))
        else:
            time.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    worker_thread = threading.Thread(target=queue_worker, daemon=True)
    worker_thread.start()
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "Notification service started"}))
    yield


app = FastAPI(title="Notification Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class NotificationIn(BaseModel):
    user_id: int
    type: str
    title: str
    message: str
    application_id: Optional[int] = None


@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readiness(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.post("/notifications/send", status_code=202)
def send_notification(req: NotificationIn):
    """Enqueue a notification for async processing."""
    payload = req.model_dump()
    if redis_client:
        redis_client.rpush(QUEUE_KEY, json.dumps(payload))
        return {"queued": True, "queue": QUEUE_KEY}
    db = SessionLocal()
    try:
        process_notification(payload, db)
        return {"queued": False, "processed": True}
    finally:
        db.close()


@app.get("/notifications")
def list_notifications(user_id: int = Query(...), db: Session = Depends(get_db)):
    rows = db.query(NotificationLog).filter(NotificationLog.user_id == user_id).order_by(NotificationLog.created_at.desc()).all()
    return [{"id": r.id, "type": r.type, "title": r.title, "message": r.message,
             "read": r.read, "application_id": r.application_id, "created_at": str(r.created_at)} for r in rows]


@app.patch("/notifications/{notification_id}/read")
def mark_read(notification_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    notif = db.query(NotificationLog).filter(NotificationLog.id == notification_id, NotificationLog.user_id == user_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Not found")
    notif.read = True
    db.commit()
    return {"id": notif.id, "read": True}


@app.get("/notifications/dlq")
def get_dlq():
    """View dead-letter queue entries."""
    if not redis_client:
        return []
    length = redis_client.llen(DLQ_KEY)
    items = [json.loads(redis_client.lindex(DLQ_KEY, i)) for i in range(min(length, 50))]
    return {"count": length, "items": items}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8004)), reload=False)
