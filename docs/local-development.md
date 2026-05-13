# Local Development Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 24+
- [Node.js](https://nodejs.org/) 22+ with [pnpm](https://pnpm.io/) 9+
- [Python](https://python.org/) 3.12+ (for running services outside Docker)
- [Terraform](https://terraform.io/) 1.6+ (for AWS infra only)

## Quick Start (Docker — Recommended)

```bash
# Copy environment file and adjust values
cp .env.example .env

# Start all services (builds Docker images on first run)
make up

# Check everything is healthy
make health

# Seed a demo user
make seed
# → demo@jobflow.app / demo1234
```

The full stack is now running:

| Service           | URL                          |
|-------------------|------------------------------|
| Frontend          | http://localhost:3000        |
| API Gateway       | http://localhost:8000        |
| Auth Service      | http://localhost:8001        |
| Job Service       | http://localhost:8002        |
| Payment Service   | http://localhost:8003        |
| Notification Svc  | http://localhost:8004        |
| Analytics Service | http://localhost:8005        |
| AI Agent Service  | http://localhost:8006        |
| PostgreSQL        | localhost:5432               |
| Redis             | localhost:6379               |

## Running on Replit (without Docker)

The Replit environment runs the Node/Express API server and Vite frontend directly:

```bash
# API server (port 8080, path /api)
pnpm --filter @workspace/api-server run dev

# Frontend dev server
pnpm --filter @workspace/job-tracker run dev

# DB schema push (run once after cloning or schema changes)
pnpm --filter @workspace/db run push

# Full typecheck
pnpm run typecheck
```

## Running Python Services Locally (without Docker)

```bash
# Install dependencies for each service
cd services/auth-service && pip install -r requirements.txt -r requirements-dev.txt

# Export env vars
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jobtracker
export JWT_SECRET=dev-secret

# Start service
python app/main.py
```

## Running Tests

```bash
# With Docker (against running containers)
make test

# Without Docker (requires local postgres + redis)
make test-local

# Individual service
cd services/auth-service && pytest tests/ -v

# With coverage
cd services/auth-service && pytest tests/ -v --cov=app --cov-report=term-missing
```

## API Development Workflow

1. Edit `lib/api-spec/openapi.yaml` to add/modify endpoints
2. Run codegen: `pnpm --filter @workspace/api-spec run codegen`
3. Implement the new route in `artifacts/api-server/src/routes/`
4. Use the generated hook in the frontend (e.g. `useGetApplications()`)

## Common Issues

**Port already in use**: `make down && make up`

**DB schema out of sync**: `pnpm --filter @workspace/db run push`

**Type errors after codegen**: `pnpm run typecheck:libs` to rebuild lib packages

**Redis not available**: Services fall back to no-cache mode; notifications are processed synchronously

**Module not found in Python service**: Run `pip install -r requirements.txt` inside the service directory

## Useful Commands

```bash
# Tail logs for all services
make logs

# Tail logs for a specific service
make logs-auth-service
make logs-job-service

# Stop everything and remove volumes (destructive)
make clean

# Rebuild Docker images
make build

# Quick API test
curl http://localhost:8001/healthz | jq .
curl http://localhost:8000/readyz | jq .
```
