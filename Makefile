.PHONY: up down logs build restart clean \
        db-migrate db-upgrade db-shell \
        shell-backend shell-db \
        ollama-pull lint test \
        minimal-up minimal-up-build minimal-down \
        minimal-logs minimal-restart minimal-build \
        minimal-shell-backend minimal-db-upgrade \
        dev-up dev-up-build dev-down dev-logs dev-restart dev-build \
        dev-minimal-up dev-minimal-up-build dev-minimal-down \
        dev-debug dev-debug-build dev-debug-down \
        dev-logs-backend dev-logs-worker dev-logs-traefik dev-logs-all \
        db-query-log-on db-query-log-off \
        metrics debug-attach db-shell

# --- Production (GHCR Images) ---
up:
	docker compose pull
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose restart

pull:
	docker compose pull

clean:
	docker compose down -v --remove-orphans

# --- Minimal Production ---
minimal-up:
	docker compose -f docker-compose.minimal.yml pull
	docker compose -f docker-compose.minimal.yml up -d

minimal-down:
	docker compose -f docker-compose.minimal.yml down

minimal-logs:
	docker compose -f docker-compose.minimal.yml logs -f

minimal-restart:
	docker compose -f docker-compose.minimal.yml restart

# --- Database (Production) ---
db-migrate:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

db-upgrade:
	docker compose exec backend alembic upgrade head

db-downgrade:
	docker compose exec backend alembic downgrade -1

db-shell:
	docker compose exec postgres psql -U $${POSTGRES_USER:-maintain} -d $${POSTGRES_DB:-maintain_github}

# --- Shells (Production) ---
shell-backend:
	docker compose exec backend /bin/bash

shell-frontend:
	docker compose exec frontend /bin/sh

# --- Ollama (Production) ---
ollama-pull:
	@read -p "Model name (e.g. llama3:8b): " model; \
	docker compose exec ollama ollama pull $$model

ollama-list:
	docker compose exec ollama ollama list

# --- Development (Local Build) ---
dev-up:
	docker compose -f docker-compose.dev.yml up -d

dev-up-build:
	docker compose -f docker-compose.dev.yml up -d --build

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

dev-restart:
	docker compose -f docker-compose.dev.yml restart

dev-build:
	docker compose -f docker-compose.dev.yml build

dev-shell-backend:
	docker compose -f docker-compose.dev.yml exec backend /bin/bash

# --- Dev Minimal ---
dev-minimal-up:
	docker compose -f docker-compose.dev-minimal.yml up -d

dev-minimal-up-build:
	docker compose -f docker-compose.dev-minimal.yml up -d --build

dev-minimal-down:
	docker compose -f docker-compose.dev-minimal.yml down

# --- Setup ---
setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example - please fill in values!"; fi
	@mkdir -p traefik/certs repos
	@chmod 600 traefik/certs 2>/dev/null || true

help:
	@echo "Available commands:"
	@echo "  make up              - Start production services (GHCR)"
	@echo "  make pull            - Pull latest GHCR images"
	@echo "  make down            - Stop production services"
	@echo "  make logs            - Follow production logs"
	@echo "  make clean           - Stop and remove all volumes"
	@echo "  make db-migrate      - Create new migration (msg=description)"
	@echo "  make db-upgrade      - Apply pending migrations"
	@echo "  make shell-backend   - Open backend shell"
	@echo "  make ollama-pull     - Pull an Ollama model"
	@echo "  make setup           - Initial project setup"
	@echo ""
	@echo "  make dev-up          - Start dev services (Local Build)"
	@echo "  make dev-up-build    - Build and start dev services"
	@echo "  make dev-down        - Stop dev services"
	@echo "  make dev-logs        - Follow dev logs"
	@echo "  make dev-build       - Build dev images"
	@echo ""
	@echo "  make minimal-up      - Start minimal production stack"
	@echo "  make dev-minimal-up  - Start minimal dev stack"
	@echo ""
	@echo "  Debug Commands:"
	@echo "  make dev-debug          - Start dev services with debug mode & hot-reload"
	@echo "  make dev-debug-build    - Build & start dev services with debug mode"
	@echo "  make dev-debug-down     - Stop debug dev services"
	@echo "  make dev-logs-backend   - Follow backend logs"
	@echo "  make dev-logs-worker    - Follow worker logs"
	@echo "  make dev-logs-traefik   - Follow Traefik logs"
	@echo "  make dev-logs-all       - Follow all dev logs"
	@echo "  make db-query-log-on    - Enable PostgreSQL query logging"
	@echo "  make db-query-log-off   - Disable PostgreSQL query logging"
	@echo "  make metrics            - Show Prometheus metrics snapshot"
	@echo "  make debug-attach       - Show VS Code debug attach config"

# --- Debug & Development ---
dev-debug:
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "============================================"
	@echo "  Debug mode active!"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Debugger: port 5678 (attach with VS Code F5)"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Metrics:  http://localhost:8000/api/metrics"
	@echo "  Logs:     make dev-logs-backend"
	@echo "============================================"

dev-debug-build:
	docker compose -f docker-compose.dev.yml up -d --build
	@echo ""
	@echo "============================================"
	@echo "  Debug mode active! (fresh build)"
	@echo "  Debugger available on port 5678"
	@echo "============================================"

dev-debug-down:
	docker compose -f docker-compose.dev.yml down

dev-logs-backend:
	docker compose -f docker-compose.dev.yml logs -f backend

dev-logs-worker:
	docker compose -f docker-compose.dev.yml logs -f worker

dev-logs-traefik:
	docker compose -f docker-compose.dev.yml logs -f traefik

dev-logs-all:
	docker compose -f docker-compose.dev.yml logs -f

# --- Database Debugging ---
db-query-log-on:
	@echo "Enabling PostgreSQL query logging..."
	docker compose -f docker-compose.dev.yml exec -T postgres psql -U $${POSTGRES_USER:-maintain} -d $${POSTGRES_DB:-maintain_github} -c "ALTER SYSTEM SET log_statement = 'all'; SELECT pg_reload_conf();" 2>/dev/null || echo "Run: make dev-up first"

db-query-log-off:
	@echo "Disabling PostgreSQL query logging..."
	docker compose -f docker-compose.dev.yml exec -T postgres psql -U $${POSTGRES_USER:-maintain} -d $${POSTGRES_DB:-maintain_github} -c "ALTER SYSTEM SET log_statement = 'none'; SELECT pg_reload_conf();" 2>/dev/null || echo "Run: make dev-up first"

# --- Metrics ---
metrics:
	@echo "=== Prometheus Metrics ==="
	@curl -s http://localhost:8000/api/metrics 2>/dev/null | head -40 || echo "Backend not running. Start with: make dev-debug"

# --- Debug Attach Helper ---
debug-attach:
	@echo ""
	@echo "Add this to your VS Code .vscode/launch.json:"
	@echo ""
	@echo '{'
	@echo '  "name": "Python: Remote Attach",'
	@echo '  "type": "debugpy",'
	@echo '  "request": "attach",'
	@echo '  "connect": { "host": "localhost", "port": 5678 },'
	@echo '  "pathMappings": [{ "localRoot": "$${workspaceFolder}/backend", "remoteRoot": "/app" }],'
	@echo '  "justMyCode": false'
	@echo '}'
	@echo ""
	@echo "Or use the pre-configured launch.json in .vscode/"
	@echo "Then: F5 → 'Python: Remote Attach (Backend)'"
