"""API Gateway Service - Single entry point, JWT auth middleware, rate limiting, routing."""
import os
import json
import logging
import time
import hashlib
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
import httpx
import redis
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
logger = logging.getLogger(__name__)

SERVICE_NAME = "api-gateway"
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

AUTH_SERVICE = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8001")
JOB_SERVICE = os.getenv("JOB_SERVICE_URL", "http://job-service:8002")
PAYMENT_SERVICE = os.getenv("PAYMENT_SERVICE_URL", "http://payment-service:8003")
NOTIFICATION_SERVICE = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification-service:8004")
ANALYTICS_SERVICE = os.getenv("ANALYTICS_SERVICE_URL", "http://analytics-service:8005")
AI_SERVICE = os.getenv("AI_SERVICE_URL", "http://ai-agent-service:8006")

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception:
    redis_client = None

ROUTE_MAP = {
    "/auth": AUTH_SERVICE,
    "/companies": JOB_SERVICE,
    "/applications": JOB_SERVICE,
    "/payments": PAYMENT_SERVICE,
    "/notifications": NOTIFICATION_SERVICE,
    "/analytics": ANALYTICS_SERVICE,
    "/ai": AI_SERVICE,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "API Gateway started"}))
    yield
    logger.info(json.dumps({"service": SERVICE_NAME, "msg": "API Gateway stopped"}))


app = FastAPI(title="API Gateway", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_correlation_id(request: Request) -> str:
    return request.headers.get("x-correlation-id", hashlib.md5(f"{time.time()}".encode()).hexdigest()[:8])


def check_rate_limit(client_ip: str) -> bool:
    if not redis_client:
        return True
    key = f"rate_limit:{client_ip}"
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, RATE_LIMIT_WINDOW)
    count, _ = pipe.execute()
    return count <= RATE_LIMIT_REQUESTS


def get_upstream(path: str) -> Optional[str]:
    for prefix, url in ROUTE_MAP.items():
        if path.startswith(prefix):
            return url
    return None


@app.get("/healthz")
def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/readyz")
def readiness():
    return {"status": "ready", "services": list(ROUTE_MAP.keys())}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    correlation_id = get_correlation_id(request)

    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    full_path = f"/{path}"
    upstream = get_upstream(full_path)
    if not upstream:
        raise HTTPException(status_code=404, detail=f"No upstream for path: {full_path}")

    upstream_url = f"{upstream}{full_path}"
    headers = dict(request.headers)
    headers["x-correlation-id"] = correlation_id
    headers.pop("host", None)

    body = await request.body()
    params = dict(request.query_params)

    logger.info(json.dumps({"correlation_id": correlation_id, "method": request.method,
                             "path": full_path, "upstream": upstream}))

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(
                method=request.method,
                url=upstream_url,
                headers=headers,
                content=body,
                params=params,
            )
        return JSONResponse(content=resp.json() if resp.content else None,
                            status_code=resp.status_code,
                            headers={"x-correlation-id": correlation_id})
    except httpx.TimeoutException:
        logger.error(json.dumps({"correlation_id": correlation_id, "error": "upstream timeout"}))
        raise HTTPException(status_code=504, detail="Upstream service timeout")
    except Exception as e:
        logger.error(json.dumps({"correlation_id": correlation_id, "error": str(e)}))
        raise HTTPException(status_code=502, detail="Upstream service error")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=False)
