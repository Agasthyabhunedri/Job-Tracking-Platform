# Deployment Guide

## Replit (Current / Managed)

The production-hosted version runs directly on Replit:
- **Frontend**: Vite dev server (job-tracker workflow)
- **API**: Express 5 + Drizzle ORM (api-server workflow)
- **DB**: Replit-managed PostgreSQL

Click **Deploy** in the Replit interface to publish at a `.replit.app` domain.

---

## AWS (Self-Hosted Production)

### Prerequisites

1. AWS account with ECR, ECS, RDS, ElastiCache access
2. GitHub repository with secrets configured (see below)
3. Terraform CLI installed

### Step 1 — Bootstrap Infrastructure

```bash
cd infra/terraform

# Initialize providers
terraform init

# Preview changes
terraform plan -var="db_password=STRONG_PASSWORD" -var="ecr_registry=YOUR_ECR_REGISTRY"

# Apply (creates VPC, RDS, ElastiCache, SQS, IAM, ECS cluster)
terraform apply -var="db_password=STRONG_PASSWORD" -var="ecr_registry=YOUR_ECR_REGISTRY"
```

### Step 2 — Create ECR Repositories

```bash
for SERVICE in api-gateway auth-service job-service payment-service notification-service analytics-service ai-agent-service; do
  aws ecr create-repository --repository-name jobflow-$SERVICE --region us-east-1
done
```

### Step 3 — Configure GitHub Secrets

In **Settings > Secrets and variables > Actions**, add:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | IAM user key with ECS/ECR permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| `ECR_REGISTRY` | `<account>.dkr.ecr.us-east-1.amazonaws.com` |
| `DB_PASSWORD` | RDS PostgreSQL password |
| `JWT_SECRET` | Long random string (32+ chars) |

### Step 4 — Trigger CI/CD

Push to `main` branch to trigger:
1. **Backend Tests** (`backend-tests.yml`) — pytest for all services
2. **Frontend Tests** (`frontend-tests.yml`) — TypeScript + Vite build check
3. **Docker Build** (`docker-build.yml`) — builds and pushes all images to ECR

After images are pushed, trigger deployment:
```bash
# Via GitHub Actions UI
gh workflow run deploy-aws-template.yml -f image_tag=latest

# Or via AWS CLI
aws ecs update-service --cluster jobflow-cluster \
  --service jobflow-api-gateway --force-new-deployment
```

### Step 5 — Deploy Frontend to S3

```bash
# Build
pnpm --filter @workspace/job-tracker run build

# Upload to S3 (replace BUCKET_NAME)
aws s3 sync artifacts/job-tracker/dist/public/ s3://BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

aws s3 cp artifacts/job-tracker/dist/public/index.html s3://BUCKET_NAME/index.html \
  --cache-control "no-cache, no-store, must-revalidate"
```

---

## Environment Variables per Service

| Variable | Auth | Job | Payment | Notification | Analytics | AI |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `JWT_SECRET` | ✓ | | | | | |
| `REDIS_URL` | | ✓ | | ✓ | ✓ | |
| `LLM_ENABLED` | | | | | | ✓ |
| `OPENAI_API_KEY` | | | | | | optional |

---

## Health Checks

All services expose:
- `GET /healthz` — liveness probe (always returns 200 if process is up)
- `GET /readyz` — readiness probe (checks DB connectivity)

ECS Fargate health checks target `/healthz` with:
- `interval: 30s`, `timeout: 5s`, `retries: 3`

---

## Rollback

```bash
# Roll back a service to previous task definition
aws ecs update-service \
  --cluster jobflow-cluster \
  --service jobflow-auth-service \
  --task-definition jobflow-auth-service:PREVIOUS_REVISION
```
