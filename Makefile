.PHONY: up down test migrate logs seed lint build

## Start all services
up:
	docker compose up --build -d
	@echo "✓ All services started"
	@echo "  Frontend:          http://localhost:3000"
	@echo "  API Gateway:       http://localhost:8000"
	@echo "  Auth Service:      http://localhost:8001"
	@echo "  Job Service:       http://localhost:8002"
	@echo "  Payment Service:   http://localhost:8003"
	@echo "  Notification Svc:  http://localhost:8004"
	@echo "  Analytics Service: http://localhost:8005"
	@echo "  AI Agent Service:  http://localhost:8006"

## Stop all services
down:
	docker compose down

## Stop and remove volumes
clean:
	docker compose down -v

## Run all pytest test suites
test:
	@echo "Running auth service tests..."
	docker compose exec auth-service pytest tests/ -v --tb=short
	@echo "Running job service tests..."
	docker compose exec job-service pytest tests/ -v --tb=short
	@echo "Running payment service tests..."
	docker compose exec payment-service pytest tests/ -v --tb=short
	@echo "Running notification service tests..."
	docker compose exec notification-service pytest tests/ -v --tb=short

## Run tests without Docker (requires local postgres + redis)
test-local:
	cd services/auth-service && pip install -r requirements.txt -r requirements-dev.txt && pytest tests/ -v
	cd services/job-service && pip install -r requirements.txt -r requirements-dev.txt && pytest tests/ -v
	cd services/payment-service && pip install -r requirements.txt -r requirements-dev.txt && pytest tests/ -v

## Run DB migrations (apply schema)
migrate:
	docker compose exec auth-service python -c "from main import Base, engine; Base.metadata.create_all(engine)"
	docker compose exec job-service python -c "from main import Base, engine; Base.metadata.create_all(engine)"
	docker compose exec payment-service python -c "from main import Base, engine; Base.metadata.create_all(engine)"
	docker compose exec notification-service python -c "from main import Base, engine; Base.metadata.create_all(engine)"
	docker compose exec analytics-service python -c "from main import Base, engine; Base.metadata.create_all(engine)"

## Seed demo data
seed:
	@echo "Seeding demo data..."
	curl -s -X POST http://localhost:8001/auth/register \
		-H "Content-Type: application/json" \
		-d '{"email":"demo@jobflow.app","password":"demo1234","name":"Demo User"}' | jq .
	@echo "Demo user created: demo@jobflow.app / demo1234"

## Tail logs for all services
logs:
	docker compose logs -f --tail=50

## Tail logs for a specific service: make logs-auth
logs-%:
	docker compose logs -f $* --tail=100

## Lint all Python services
lint:
	@for service in auth-service job-service payment-service notification-service analytics-service ai-agent-service api-gateway; do \
		echo "Linting $$service..."; \
		cd services/$$service && pip install flake8 --quiet && flake8 app/ --max-line-length=120 --ignore=E501,W503; \
		cd ../..; \
	done

## Build all Docker images
build:
	docker compose build

## Health check all services
health:
	@echo "Checking service health..."
	@curl -sf http://localhost:8000/healthz && echo "✓ API Gateway" || echo "✗ API Gateway"
	@curl -sf http://localhost:8001/healthz && echo "✓ Auth Service" || echo "✗ Auth Service"
	@curl -sf http://localhost:8002/healthz && echo "✓ Job Service" || echo "✗ Job Service"
	@curl -sf http://localhost:8003/healthz && echo "✓ Payment Service" || echo "✗ Payment Service"
	@curl -sf http://localhost:8004/healthz && echo "✓ Notification Service" || echo "✗ Notification Service"
	@curl -sf http://localhost:8005/healthz && echo "✓ Analytics Service" || echo "✗ Analytics Service"
	@curl -sf http://localhost:8006/healthz && echo "✓ AI Agent Service" || echo "✗ AI Agent Service"

## Generate proto files from .proto definitions
proto:
	python -m grpc_tools.protoc -I./proto --python_out=. --grpc_python_out=. ./proto/jobflow.proto
