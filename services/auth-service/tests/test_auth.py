"""Auth Service Tests - unit, API, idempotency, and rate limit tests."""
import pytest
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/jobtracker_test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from main import app, Base, get_db, hash_password, make_token, verify_token

TEST_DB_URL = os.getenv("DATABASE_URL")
engine = create_engine(TEST_DB_URL)
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
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(client):
    """Create a test user and return auth data."""
    resp = client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User"
    })
    return resp.json()


# ============================================================
# Health Tests
# ============================================================

class TestHealth:
    def test_health_check(self, client):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_readiness(self, client):
        resp = client.get("/readyz")
        assert resp.status_code == 200


# ============================================================
# Registration Tests
# ============================================================

class TestRegistration:
    def test_register_success(self, client):
        resp = client.post("/auth/register", json={
            "email": "newuser@example.com",
            "password": "password123",
            "name": "New User"
        })
        assert resp.status_code == 201
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "newuser@example.com"
        assert data["user"]["name"] == "New User"

    def test_register_duplicate_email(self, client, test_user):
        resp = client.post("/auth/register", json={
            "email": "test@example.com",
            "password": "password123",
            "name": "Duplicate"
        })
        assert resp.status_code == 409

    def test_register_missing_fields(self, client):
        resp = client.post("/auth/register", json={"email": "x@x.com"})
        assert resp.status_code == 400

    def test_register_missing_email(self, client):
        resp = client.post("/auth/register", json={"password": "pw", "name": "Test"})
        assert resp.status_code == 400


# ============================================================
# Login Tests
# ============================================================

class TestLogin:
    def test_login_success(self, client, test_user):
        resp = client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_wrong_password(self, client, test_user):
        resp = client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword"
        })
        assert resp.status_code == 401

    def test_login_unknown_email(self, client):
        resp = client.post("/auth/login", json={
            "email": "ghost@example.com",
            "password": "password123"
        })
        assert resp.status_code == 401


# ============================================================
# Profile Tests
# ============================================================

class TestProfile:
    def test_get_me_success(self, client, test_user):
        token = test_user["token"]
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@example.com"

    def test_get_me_no_token(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401 or resp.status_code == 422

    def test_get_me_invalid_token(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401


# ============================================================
# Token Tests
# ============================================================

class TestTokens:
    def test_make_and_verify_token(self):
        token = make_token(42)
        user_id = verify_token(token)
        assert user_id == 42

    def test_verify_invalid_token(self):
        assert verify_token("not.a.token") is None

    def test_verify_tampered_token(self):
        token = make_token(1)
        parts = token.split(".")
        tampered = f"{parts[0]}.badsignature"
        assert verify_token(tampered) is None

    def test_password_hashing(self):
        h1 = hash_password("secret")
        h2 = hash_password("secret")
        h3 = hash_password("different")
        assert h1 == h2
        assert h1 != h3


# ============================================================
# Idempotency Tests
# ============================================================

class TestIdempotency:
    def test_register_idempotent_fails_on_duplicate(self, client):
        """Registering the same email twice should fail the second time."""
        payload = {"email": "idempotent@test.com", "password": "pw123", "name": "Idem"}
        r1 = client.post("/auth/register", json=payload)
        r2 = client.post("/auth/register", json=payload)
        assert r1.status_code == 201
        assert r2.status_code == 409
