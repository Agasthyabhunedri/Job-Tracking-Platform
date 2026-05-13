"""Auth Service - Handles user registration, login, JWT generation, and profiles."""
import hashlib
import os
import time
import hmac
import base64
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, Integer, String, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func
from prometheus_client import Counter, Histogram, generate_latest
from starlette.responses import PlainTextResponse

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/jobtracker")
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
SERVICE_NAME = "auth-service"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

REQUEST_COUNT = Counter("auth_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("auth_request_duration_seconds", "Request latency", ["endpoint"])


class User(Base):
    __tablename__ = "auth_users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "Auth service started"}))
    yield
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "Auth service stopped"}))


app = FastAPI(title="Auth Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return hashlib.sha256(f"{password}salt-jobflow".encode()).hexdigest()


def make_token(user_id: int) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"userId": user_id, "iat": int(time.time())}).encode()).decode().rstrip("=")
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_token(token: str) -> Optional[int]:
    try:
        payload_b64, sig = token.rsplit(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        padding = 4 - len(payload_b64) % 4
        data = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * padding))
        return data.get("userId")
    except Exception:
        return None


# --- Schemas ---
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


# --- Routes ---
@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readiness(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database not ready")


@app.post("/auth/register", response_model=AuthResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=req.email, name=req.name, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = make_token(user.id)
    logger.info(json.dumps({"event": "user.created", "user_id": user.id}))
    return AuthResponse(token=token, user=UserResponse(id=user.id, email=user.email, name=user.name, created_at=str(user.created_at)))


@app.post("/auth/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or user.password_hash != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(user.id)
    return AuthResponse(token=token, user=UserResponse(id=user.id, email=user.email, name=user.name, created_at=str(user.created_at)))


@app.get("/auth/me", response_model=UserResponse)
def get_me(authorization: str = Header(...), db: Session = Depends(get_db)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    user_id = verify_token(authorization[7:])
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(id=user.id, email=user.email, name=user.name, created_at=str(user.created_at))


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    return generate_latest()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8001)), reload=False)
