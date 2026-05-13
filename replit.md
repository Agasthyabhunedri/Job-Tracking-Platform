# JobFlow — Cloud-Native Job Tracking Platform

A production-grade job application tracker with a React/TypeScript frontend, Node/Express API server, 7 Python/FastAPI microservices, and full AWS infrastructure definitions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path `/api`)
- `pnpm --filter @workspace/job-tracker run dev` — run the frontend dev server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `make up` — start all 7 Python microservices + PostgreSQL + Redis via Docker Compose
- `make health` — check health of all Docker services
- `make test` — run pytest suites for all Python services
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React 19, Vite 7, Wouter, TanStack Query v5, shadcn/ui, Recharts, Framer Motion
- **API**: Express 5 (Replit-hosted), FastAPI 0.115 (Docker microservices)
- **DB**: PostgreSQL + Drizzle ORM (Node) / SQLAlchemy 2 (Python)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`, Pydantic v2
- **Cache/Queue**: Redis (rate limiting, response cache, notification queue)
- **API codegen**: Orval (OpenAPI → React Query hooks + Zod schemas)
- **Build**: esbuild (CJS bundle)
- **Infra**: Terraform (AWS VPC, ECS Fargate, RDS, ElastiCache, SQS, S3)
- **CI/CD**: GitHub Actions (test, build, deploy workflows)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth (edit here first)
- `lib/db/src/schema/index.ts` — Drizzle ORM schema (source of truth for DB)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/job-tracker/src/` — React frontend (pages, components, hooks)
- `lib/api-client-react/src/` — Generated React Query hooks (do not hand-edit)
- `services/*/app/main.py` — FastAPI microservice entrypoints
- `services/*/tests/` — pytest test suites
- `infra/terraform/` — AWS infrastructure definitions
- `.github/workflows/` — CI/CD pipelines
- `docs/` — Architecture, local dev, and deployment guides

## Architecture decisions

- **Contract-first API**: OpenAPI spec is the single source of truth; hooks and Zod schemas are generated. Never hand-write fetch calls.
- **HMAC-SHA256 tokens** used in place of JWT for simplicity; structured identically so migration to Ed25519 JWT is a one-line swap.
- **Node API server** hosts the Replit-managed production API; Python microservices are Docker-only for local dev and AWS deployment.
- **Redis** serves triple duty: rate limiting in the gateway, response caching in job/analytics services, and async notification queue with DLQ support.
- **AI agent is LLM-ready**: set `LLM_ENABLED=true` and `OPENAI_API_KEY` to swap the rule-based engine for a real model with zero code changes.
- **Terraform state**: uses local backend by default; uncomment S3 backend in `infra/terraform/main.tf` before production use.

## Product

- **Dashboard**: Overview cards (total apps, active, interview rate, offer rate) + recent activity
- **Applications**: Full CRUD, status pipeline (applied → screening → interview → offer/rejected/withdrawn), notes, salary, follow-up scheduling
- **Companies**: Track companies with industry, location, website
- **Analytics**: Weekly velocity chart, pipeline funnel, conversion rates, top companies (Recharts)
- **AI Insights**: Prioritized action recommendations (follow-ups, interview prep, resume tips, networking)
- **Billing**: Plan selection (Free / Pro / Premium), billing history
- **Notifications**: Inbox with mark-as-read; async queue backed by Redis with DLQ

## User preferences

- Auth token stored in `localStorage["jt_token"]`
- Navigation sidebar with mobile hamburger menu responsive layout
- Deep blue primary color theme with shadcn/ui components

## Gotchas

- After schema changes, run `pnpm --filter @workspace/db run push` before starting the API server
- After OpenAPI spec changes, run `pnpm --filter @workspace/api-spec run codegen` and `pnpm run typecheck:libs`
- Python services require Docker to run; they are not Replit workflows
- `make up` on first run builds Docker images — takes ~3 minutes
- Express 5 route params have type `string | string[]`; always use `String(req.params.id)` before `parseInt`
- Do not run `pnpm dev` at workspace root; use per-package `--filter` commands

## Pointers

- See `docs/architecture.md` for system diagram and component details
- See `docs/local-development.md` for step-by-step local setup
- See `docs/deployment.md` for AWS + CI/CD deployment
- See `.env.example` for all environment variable definitions
- See the `pnpm-workspace` skill for workspace structure details
