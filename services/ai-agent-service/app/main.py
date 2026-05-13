"""AI Agent Service - Modular recommendation engine. Swap in real LLM later."""
import os
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from datetime import datetime, timedelta

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/jobtracker")
LLM_ENABLED = os.getenv("LLM_ENABLED", "false").lower() == "true"
SERVICE_NAME = "ai-agent-service"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Application(Base):
    __tablename__ = "jobs_applications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    company_id = Column(Integer)
    job_title = Column(String)
    status = Column(String)
    notes = Column(String)
    salary = Column(String)
    job_url = Column(String)
    location = Column(String)
    applied_at = Column(DateTime(timezone=True))
    next_follow_up_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))


class Company(Base):
    __tablename__ = "jobs_companies"
    id = Column(Integer, primary_key=True)
    name = Column(String)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "AI agent service started", "llm_enabled": LLM_ENABLED}))
    yield


app = FastAPI(title="AI Agent Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RecommendationOut(BaseModel):
    id: str
    type: str
    priority: str
    title: str
    description: str
    application_id: Optional[int] = None
    application_title: Optional[str] = None
    company_name: Optional[str] = None


class AnalysisOut(BaseModel):
    application_id: int
    score: int
    suggestions: List[str]
    next_steps: List[str]
    estimated_response: Optional[str] = None


def _get_company_name(db: Session, company_id: Optional[int]) -> Optional[str]:
    if not company_id:
        return None
    company = db.query(Company).filter(Company.id == company_id).first()
    return company.name if company else None


def _mock_recommendations(apps: list, db: Session) -> List[dict]:
    """Rule-based recommendations. Replace with LLM call when LLM_ENABLED=true."""
    recommendations = []
    now = datetime.utcnow()

    for app in apps:
        days_since_applied = (now - app.applied_at.replace(tzinfo=None)).days if app.applied_at else 0
        company_name = _get_company_name(db, app.company_id)

        if app.status == "applied" and days_since_applied > 7:
            recommendations.append({
                "id": f"follow-{app.id}",
                "type": "follow_up",
                "priority": "high" if days_since_applied > 14 else "medium",
                "title": "Consider Following Up",
                "description": f"It's been {days_since_applied} days since you applied for {app.job_title}. A polite follow-up could help.",
                "application_id": app.id,
                "application_title": app.job_title,
                "company_name": company_name,
            })

        if app.status == "interview":
            recommendations.append({
                "id": f"prep-{app.id}",
                "type": "high_priority",
                "priority": "high",
                "title": "Interview Preparation Required",
                "description": f"Active interview process for {app.job_title}. Research company culture, prepare STAR stories, and practice common questions.",
                "application_id": app.id,
                "application_title": app.job_title,
                "company_name": company_name,
            })

        if app.status == "rejected":
            recommendations.append({
                "id": f"resume-{app.id}",
                "type": "improve_resume",
                "priority": "medium",
                "title": "Optimize Your Resume",
                "description": f"Tailor your resume for {app.job_title}. Focus on quantified achievements and ATS-friendly keywords.",
                "application_id": app.id,
                "application_title": app.job_title,
                "company_name": company_name,
            })

    if not recommendations:
        recommendations.append({
            "id": "network-general",
            "type": "networking",
            "priority": "medium",
            "title": "Expand Your Network",
            "description": "Referrals increase interview chances significantly. Reach out to employees at target companies on LinkedIn.",
            "application_id": None,
            "application_title": None,
            "company_name": None,
        })

    return recommendations[:10]


@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME, "llm_enabled": LLM_ENABLED}


@app.get("/readyz")
def readiness():
    return {"status": "ready"}


@app.get("/ai/recommendations", response_model=List[RecommendationOut])
def get_recommendations(user_id: int = Query(...), db: Session = Depends(get_db)):
    apps = db.query(Application).filter(Application.user_id == user_id).all()
    recommendations = _mock_recommendations(apps, db)

    if LLM_ENABLED:
        # TODO: Replace with real LLM call
        # from openai import OpenAI
        # client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        # ... call LLM with app data and return structured recommendations
        pass

    return recommendations


@app.get("/ai/analyze/{application_id}", response_model=AnalysisOut)
def analyze_application(application_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == application_id, Application.user_id == user_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    score = min(100, max(20,
        (20 if app.notes else 0) +
        (15 if app.salary else 0) +
        (15 if app.job_url else 0) +
        (10 if app.location else 0) +
        (20 if app.applied_at else 0) +
        (20 if app.company_id else 0)
    ))

    suggestions = []
    if not app.notes:
        suggestions.append("Add notes about the role to improve tracking and interview prep")
    if not app.salary:
        suggestions.append("Record the salary range to help evaluate offers later")
    if not app.job_url:
        suggestions.append("Save the job posting URL before it expires")
    if not app.company_id:
        suggestions.append("Link this application to a company for better analytics")
    if not app.next_follow_up_at:
        suggestions.append("Schedule a follow-up date to stay on top of your application")

    next_steps = []
    if app.status == "applied":
        next_steps.append("Follow up after 7-10 business days if no response")
    elif app.status == "screening":
        next_steps.append("Prepare for behavioral interview questions")
    elif app.status == "interview":
        next_steps += ["Research the company's recent news and culture", "Prepare STAR format stories"]
    elif app.status == "offer":
        next_steps.append("Evaluate the offer against market rates and your priorities")

    days_since = (datetime.utcnow() - app.applied_at.replace(tzinfo=None)).days if app.applied_at else 0
    estimated = f"Expected response within {max(0, 14 - days_since)} days" if days_since < 14 else "Response is overdue — consider following up"

    return AnalysisOut(application_id=application_id, score=score, suggestions=suggestions,
                       next_steps=next_steps, estimated_response=estimated)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8006)), reload=False)
