"""Job Application Service - CRUD for companies and applications with status tracking."""
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime

import uvicorn
import redis
from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.sql import func

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/jobtracker")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
SERVICE_NAME = "job-service"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None


class Company(Base):
    __tablename__ = "jobs_companies"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    website = Column(String)
    industry = Column(String)
    location = Column(String)
    notes = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Application(Base):
    __tablename__ = "jobs_applications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    company_id = Column(Integer, ForeignKey("jobs_companies.id", ondelete="SET NULL"), nullable=True)
    job_title = Column(String, nullable=False)
    status = Column(String, default="applied")
    job_url = Column(String)
    salary = Column(String)
    location = Column(String)
    notes = Column(String)
    interview_stage = Column(String)
    applied_at = Column(DateTime(timezone=True))
    next_follow_up_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "Job service started"}))
    yield


app = FastAPI(title="Job Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


VALID_STATUSES = {"applied", "screening", "interview", "offer", "rejected", "withdrawn"}


class CompanyIn(BaseModel):
    name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class ApplicationIn(BaseModel):
    job_title: str
    company_id: Optional[int] = None
    status: str = "applied"
    job_url: Optional[str] = None
    salary: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[str] = None
    next_follow_up_at: Optional[str] = None


class StatusUpdateIn(BaseModel):
    status: str
    interview_stage: Optional[str] = None


# --- Health ---
@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readiness(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


# --- Companies ---
@app.get("/companies")
def list_companies(user_id: int = Query(...), db: Session = Depends(get_db)):
    cache_key = f"companies:{user_id}"
    if redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    companies = db.query(Company).filter(Company.user_id == user_id).all()
    result = [{"id": c.id, "name": c.name, "website": c.website, "industry": c.industry,
               "location": c.location, "notes": c.notes, "created_at": str(c.created_at)} for c in companies]
    if redis_client:
        redis_client.setex(cache_key, 60, json.dumps(result))
    return result


@app.post("/companies", status_code=201)
def create_company(req: CompanyIn, user_id: int = Query(...), db: Session = Depends(get_db)):
    company = Company(user_id=user_id, **req.model_dump(exclude_none=True))
    db.add(company)
    db.commit()
    db.refresh(company)
    if redis_client:
        redis_client.delete(f"companies:{user_id}")
    logger.info(json.dumps({"event": "company.created", "company_id": company.id, "user_id": user_id}))
    return {"id": company.id, "name": company.name, "website": company.website}


@app.delete("/companies/{company_id}", status_code=204)
def delete_company(company_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id, Company.user_id == user_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(company)
    db.commit()
    if redis_client:
        redis_client.delete(f"companies:{user_id}")


# --- Applications ---
@app.get("/applications")
def list_applications(
    user_id: int = Query(...),
    status: Optional[str] = None,
    company_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Application).filter(Application.user_id == user_id)
    if status:
        q = q.filter(Application.status == status)
    if company_id:
        q = q.filter(Application.company_id == company_id)
    apps = q.order_by(Application.updated_at.desc()).all()
    return [{"id": a.id, "job_title": a.job_title, "status": a.status, "company_id": a.company_id,
             "salary": a.salary, "location": a.location, "notes": a.notes,
             "applied_at": str(a.applied_at) if a.applied_at else None,
             "created_at": str(a.created_at), "updated_at": str(a.updated_at)} for a in apps]


@app.post("/applications", status_code=201)
def create_application(req: ApplicationIn, user_id: int = Query(...), db: Session = Depends(get_db)):
    if req.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    app_data = req.model_dump(exclude_none=True)
    if "applied_at" in app_data:
        app_data["applied_at"] = datetime.fromisoformat(app_data["applied_at"])
    if "next_follow_up_at" in app_data:
        app_data["next_follow_up_at"] = datetime.fromisoformat(app_data["next_follow_up_at"])
    application = Application(user_id=user_id, **app_data)
    db.add(application)
    db.commit()
    db.refresh(application)
    logger.info(json.dumps({"event": "job.created", "application_id": application.id, "user_id": user_id}))
    return {"id": application.id, "job_title": application.job_title, "status": application.status}


@app.get("/applications/{application_id}")
def get_application(application_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == application_id, Application.user_id == user_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": app.id, "job_title": app.job_title, "status": app.status, "company_id": app.company_id,
            "job_url": app.job_url, "salary": app.salary, "location": app.location,
            "notes": app.notes, "interview_stage": app.interview_stage,
            "applied_at": str(app.applied_at) if app.applied_at else None,
            "created_at": str(app.created_at), "updated_at": str(app.updated_at)}


@app.patch("/applications/{application_id}/status")
def update_status(application_id: int, req: StatusUpdateIn, user_id: int = Query(...), db: Session = Depends(get_db)):
    if req.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    app = db.query(Application).filter(Application.id == application_id, Application.user_id == user_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Not found")
    old_status = app.status
    app.status = req.status
    if req.interview_stage:
        app.interview_stage = req.interview_stage
    db.commit()
    logger.info(json.dumps({"event": "application.status_updated", "application_id": application_id,
                             "old_status": old_status, "new_status": req.status}))
    return {"id": app.id, "status": app.status}


@app.delete("/applications/{application_id}", status_code=204)
def delete_application(application_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == application_id, Application.user_id == user_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(app)
    db.commit()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8002)), reload=False)
