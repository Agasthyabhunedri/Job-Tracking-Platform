"""Payment Service Tests - plans, subscriptions, billing history, webhooks."""
import pytest
import os

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/jobtracker_test")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app, Base, get_db, PLANS

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


USER_ID = 777


class TestHealth:
    def test_health(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200


class TestPlans:
    def test_list_plans(self, client):
        r = client.get("/payments/plans")
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 3
        plan_ids = {p["id"] for p in plans}
        assert plan_ids == {"free", "pro", "premium"}

    def test_plans_have_required_fields(self, client):
        r = client.get("/payments/plans")
        for plan in r.json():
            assert "id" in plan
            assert "name" in plan
            assert "price" in plan
            assert "features" in plan

    def test_free_plan_price_zero(self, client):
        r = client.get("/payments/plans")
        free = next(p for p in r.json() if p["id"] == "free")
        assert free["price"] == 0.0

    def test_pro_plan_is_popular(self, client):
        r = client.get("/payments/plans")
        pro = next(p for p in r.json() if p["id"] == "pro")
        assert pro["popular"] is True


class TestSubscription:
    def test_get_subscription_creates_free(self, client):
        r = client.get(f"/payments/subscription?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json()["plan_id"] == "free"

    def test_upgrade_to_pro(self, client):
        r = client.post(f"/payments/subscription?user_id={USER_ID}", json={"plan_id": "pro"})
        assert r.status_code == 200
        assert r.json()["plan_id"] == "pro"
        assert r.json()["plan_name"] == "Pro"

    def test_invalid_plan(self, client):
        r = client.post(f"/payments/subscription?user_id={USER_ID}", json={"plan_id": "diamond"})
        assert r.status_code == 400

    def test_downgrade_to_free(self, client):
        client.post(f"/payments/subscription?user_id={USER_ID}", json={"plan_id": "premium"})
        r = client.post(f"/payments/subscription?user_id={USER_ID}", json={"plan_id": "free"})
        assert r.status_code == 200
        assert r.json()["plan_id"] == "free"


class TestBillingHistory:
    def test_billing_history_empty(self, client):
        r = client.get(f"/payments/billing-history?user_id=12345")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_billing_history_after_upgrade(self, client):
        uid = 55555
        client.post(f"/payments/subscription?user_id={uid}", json={"plan_id": "pro"})
        r = client.get(f"/payments/billing-history?user_id={uid}")
        records = r.json()
        assert len(records) > 0
        assert records[0]["amount"] == 9.99
        assert records[0]["status"] == "paid"


class TestWebhook:
    def test_stripe_webhook(self, client):
        r = client.post("/payments/webhook", json={
            "event_type": "invoice.paid",
            "user_id": USER_ID,
            "plan_id": "pro",
            "amount": 9.99
        })
        assert r.status_code == 200
        assert r.json()["received"] is True
