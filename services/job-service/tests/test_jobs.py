"""Job Service Tests - companies, applications, status transitions."""
import pytest
import os

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/jobtracker_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app, Base, get_db

engine = create_engine(os.getenv("DATABASE_URL"))
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(db):
    def override():
        yield db
    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


USER_ID = 999


# ============================================================
# Health
# ============================================================

class TestHealth:
    def test_health(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200


# ============================================================
# Companies
# ============================================================

class TestCompanies:
    def test_create_company(self, client):
        r = client.post(f"/companies?user_id={USER_ID}", json={
            "name": "Acme Corp",
            "website": "https://acme.com",
            "industry": "Technology",
            "location": "San Francisco, CA"
        })
        assert r.status_code == 201
        assert r.json()["name"] == "Acme Corp"

    def test_list_companies(self, client):
        r = client.get(f"/companies?user_id={USER_ID}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_delete_company(self, client):
        create = client.post(f"/companies?user_id={USER_ID}", json={"name": "To Delete"})
        company_id = create.json()["id"]
        r = client.delete(f"/companies/{company_id}?user_id={USER_ID}")
        assert r.status_code == 204

    def test_delete_other_user_company(self, client):
        create = client.post(f"/companies?user_id={USER_ID}", json={"name": "Mine"})
        company_id = create.json()["id"]
        r = client.delete(f"/companies/{company_id}?user_id=888")
        assert r.status_code == 404


# ============================================================
# Applications
# ============================================================

class TestApplications:
    def test_create_application(self, client):
        r = client.post(f"/applications?user_id={USER_ID}", json={
            "job_title": "Senior Engineer",
            "status": "applied",
            "salary": "$150k-$180k",
            "location": "Remote"
        })
        assert r.status_code == 201
        data = r.json()
        assert data["job_title"] == "Senior Engineer"
        assert data["status"] == "applied"

    def test_list_applications(self, client):
        r = client.get(f"/applications?user_id={USER_ID}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_applications_filter_status(self, client):
        r = client.get(f"/applications?user_id={USER_ID}&status=applied")
        assert r.status_code == 200
        for app in r.json():
            assert app["status"] == "applied"

    def test_get_application(self, client):
        create = client.post(f"/applications?user_id={USER_ID}", json={"job_title": "PM"})
        app_id = create.json()["id"]
        r = client.get(f"/applications/{app_id}?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json()["job_title"] == "PM"

    def test_get_other_user_application(self, client):
        create = client.post(f"/applications?user_id={USER_ID}", json={"job_title": "Secret Job"})
        app_id = create.json()["id"]
        r = client.get(f"/applications/{app_id}?user_id=888")
        assert r.status_code == 404

    def test_delete_application(self, client):
        create = client.post(f"/applications?user_id={USER_ID}", json={"job_title": "Temp"})
        app_id = create.json()["id"]
        r = client.delete(f"/applications/{app_id}?user_id={USER_ID}")
        assert r.status_code == 204


# ============================================================
# Status Transitions
# ============================================================

class TestStatusTransitions:
    @pytest.mark.parametrize("status", ["applied", "screening", "interview", "offer", "rejected", "withdrawn"])
    def test_valid_status_transition(self, client, status):
        create = client.post(f"/applications?user_id={USER_ID}", json={"job_title": f"Job-{status}"})
        app_id = create.json()["id"]
        r = client.patch(f"/applications/{app_id}/status?user_id={USER_ID}", json={"status": status})
        assert r.status_code == 200
        assert r.json()["status"] == status

    def test_invalid_status(self, client):
        create = client.post(f"/applications?user_id={USER_ID}", json={"job_title": "Another Job"})
        app_id = create.json()["id"]
        r = client.patch(f"/applications/{app_id}/status?user_id={USER_ID}", json={"status": "invalid_status"})
        assert r.status_code == 400

    def test_status_with_interview_stage(self, client):
        create = client.post(f"/applications?user_id={USER_ID}", json={"job_title": "Interview Job"})
        app_id = create.json()["id"]
        r = client.patch(f"/applications/{app_id}/status?user_id={USER_ID}", json={
            "status": "interview",
            "interview_stage": "Technical Round 1"
        })
        assert r.status_code == 200
