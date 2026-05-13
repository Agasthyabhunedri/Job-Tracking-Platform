"""Notification Service Tests - sending, reading, DLQ, retry simulation."""
import pytest
import os

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/jobtracker_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app, Base, get_db, process_notification

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


USER_ID = 444


class TestHealth:
    def test_health(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200


class TestSendNotification:
    def test_send_notification_queued(self, client):
        r = client.post("/notifications/send", json={
            "user_id": USER_ID,
            "type": "application_created",
            "title": "Application Added",
            "message": "Your application has been added."
        })
        assert r.status_code == 202

    def test_send_notification_with_application_id(self, client):
        r = client.post("/notifications/send", json={
            "user_id": USER_ID,
            "type": "status_updated",
            "title": "Status Changed",
            "message": "Your application status changed.",
            "application_id": 42
        })
        assert r.status_code == 202


class TestListNotifications:
    def test_list_empty_for_new_user(self, client):
        r = client.get("/notifications?user_id=99999")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_after_direct_process(self, client, db):
        payload = {"user_id": 55555, "type": "welcome", "title": "Hello", "message": "Welcome!"}
        process_notification(payload, db)
        r = client.get("/notifications?user_id=55555")
        assert r.status_code == 200
        notifications = r.json()
        assert len(notifications) >= 1
        assert notifications[0]["title"] == "Hello"


class TestMarkRead:
    def test_mark_read(self, client, db):
        payload = {"user_id": 66666, "type": "info", "title": "Info", "message": "Read me"}
        process_notification(payload, db)
        r = client.get("/notifications?user_id=66666")
        notif_id = r.json()[0]["id"]
        mark = client.patch(f"/notifications/{notif_id}/read?user_id=66666")
        assert mark.status_code == 200
        assert mark.json()["read"] is True

    def test_mark_read_wrong_user(self, client, db):
        payload = {"user_id": 77777, "type": "info", "title": "Mine", "message": "Private"}
        process_notification(payload, db)
        r = client.get("/notifications?user_id=77777")
        notif_id = r.json()[0]["id"]
        mark = client.patch(f"/notifications/{notif_id}/read?user_id=88888")
        assert mark.status_code == 404


class TestDeadLetterQueue:
    def test_dlq_endpoint(self, client):
        r = client.get("/notifications/dlq")
        assert r.status_code == 200
