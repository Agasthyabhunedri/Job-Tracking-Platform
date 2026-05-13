# JobFlow Platform — Architecture

## System Overview

```
                         ┌────────────────────────────────────┐
                         │          User Browser              │
                         │     React + Vite + TypeScript      │
                         └──────────────┬─────────────────────┘
                                        │ HTTPS
                              ┌─────────▼────────┐
                              │   API Gateway     │  :8000
                              │   (FastAPI)       │
                              │ - JWT auth check  │
                              │ - Rate limiting   │
                              │ - Correlation IDs │
                              └────────┬──────────┘
                                       │ HTTP / internal
           ┌───────────────────────────┼──────────────────────────┐
           │               │           │           │              │
     ┌─────▼──┐      ┌─────▼──┐  ┌────▼───┐ ┌────▼────┐  ┌──────▼─┐
     │  Auth  │      │  Job   │  │Payment │ │Notific. │  │Analyt. │
     │Service │      │Service │  │Service │ │Service  │  │Service │
     │  :8001 │      │  :8002 │  │  :8003 │ │  :8004  │  │  :8005 │
     └────┬───┘      └────┬───┘  └────┬───┘ └────┬────┘  └────┬───┘
          │               │           │           │             │
          └───────────────┴─────┬─────┴───────────┘            │
                                │                               │
                   ┌────────────▼────────────────────┐         │
                   │         PostgreSQL :5432         │◄────────┘
                   │  auth_users, jobs_applications,  │
                   │  jobs_companies, payments_*,      │
                   │  notifications_logs              │
                   └────────────────────────────────┘

                   ┌─────────────────────────────────┐
                   │         Redis :6379              │
                   │  - Rate limit counters           │
                   │  - Response cache (TTL 60-300s)  │
                   │  - Notification queue            │
                   └─────────────────────────────────┘

     ┌──────────────────────────────────────┐
     │  AI Agent Service :8006             │
     │  - Rule-based recommendations       │
     │  - Application scoring              │
     │  - Swap in OpenAI / Anthropic later │
     └──────────────────────────────────────┘
```

## Component Details

### Frontend (`artifacts/job-tracker`)
- **React 19** + **Vite 7** + **TypeScript 5**
- **TanStack Query v5** for server state with generated hooks (`@workspace/api-client-react`)
- **Wouter** for lightweight client-side routing
- **Framer Motion** for page transitions and animations
- **Recharts** for analytics charts
- **shadcn/ui** components (Radix UI primitives + Tailwind CSS)
- Custom JWT injection in `custom-fetch.ts` — reads `jt_token` from localStorage

### API Layer (`artifacts/api-server`)
- **Express 5** + **Drizzle ORM** + **Zod** validation
- Hosts the production Replit-deployed API
- HMAC-SHA256 token auth middleware
- Routes: auth, companies, applications, analytics, payments, notifications, AI

### Python Microservices (`services/`)
- **FastAPI 0.115** + **SQLAlchemy 2** + **pydantic v2**
- Each service is independently deployable via Docker
- Services: api-gateway, auth, job, payment, notification, analytics, ai-agent
- API Gateway proxies all requests, adds correlation IDs, enforces rate limits

## Data Flow

### Authentication
1. User POSTs credentials → `/api/auth/login`
2. Server returns HMAC-SHA256 token
3. Frontend stores token in `localStorage["jt_token"]`
4. All subsequent requests include `Authorization: Bearer <token>`

### Notification Pipeline
1. Status change triggers → `POST /notifications/send`
2. Notification enqueued in Redis (`notification_queue`)
3. Background worker pops item, writes to `notifications_logs`, sends mock email
4. Failed items after 3 retries → Dead Letter Queue (`notification_dlq`)

### Analytics
1. Applications and status changes written to PostgreSQL
2. Analytics service queries `jobs_applications` and `jobs_companies`
3. Results cached in Redis for 5 minutes per user

### AI Recommendations
- Rule-based engine analyzes application status, age, and completeness
- Returns prioritized recommendations with type: `follow_up`, `interview_prep`, `improve_resume`, `networking`
- LLM integration prepared — set `LLM_ENABLED=true` and `OPENAI_API_KEY` to enable

## Database Schema

```sql
auth_users            -- user accounts with hashed passwords
jobs_companies        -- companies tracked per user
jobs_applications     -- job applications with status + stage
payments_subscriptions  -- active plan per user
payments_billing_history -- invoice records
notifications_logs    -- notification delivery log
analytics_events      -- custom event tracking
```

## Security

- HMAC-SHA256 token signing (production: use Ed25519 JWT)
- Rate limiting per IP via Redis (100 req/60s default, configurable)
- `x-correlation-id` propagated across services for tracing
- Secrets managed via environment variables; never committed to git
- DB deletion protection enabled in Terraform

## Scalability Notes

- All services are stateless → horizontal scaling via ECS Fargate
- Redis caching reduces DB load on hot reads
- SQS can replace Redis queue for notification fan-out at scale
- Analytics service supports per-user cache invalidation
- Terraform provisions separate security groups per service tier
