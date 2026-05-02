.PHONY: up down logs build restart clean \
        db-migrate db-upgrade db-shell \
        shell-backend shell-db \
        ollama-pull lint test \
        minimal-up minimal-up-build minimal-down \
        minimal-logs minimal-restart minimal-build \
        minimal-shell-backend minimal-db-upgrade

# --- Docker Compose ---
up:
	docker compose up -d

up-build:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend worker

build:
	docker compose build

restart:
	docker compose restart

restart-backend:
	docker compose restart backend worker

clean:
	docker compose down -v --remove-orphans

# --- Database ---
db-migrate:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

db-upgrade:
	docker compose exec backend alembic upgrade head

db-downgrade:
	docker compose exec backend alembic downgrade -1

db-shell:
	docker compose exec postgres psql -U $${POSTGRES_USER:-maintain} -d $${POSTGRES_DB:-maintain_github}

# --- Shells ---
shell-backend:
	docker compose exec backend /bin/bash

shell-frontend:
	docker compose exec frontend /bin/sh

# --- Ollama ---
ollama-pull:
	@read -p "Model name (e.g. llama3:8b): " model; \
	docker compose exec ollama ollama pull $$model

ollama-list:
	docker compose exec ollama ollama list

# --- Development ---
dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# --- Setup ---
setup:
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example - please fill in values!"; fi
	@mkdir -p traefik/certs repos
	@chmod 600 traefik/certs 2>/dev/null || true

help:
	@echo "Available commands:"
	@echo "  make up              - Start all services"
	@echo "  make up-build        - Build and start all services"
	@echo "  make down            - Stop all services"
	@echo "  make logs            - Follow all logs"
	@echo "  make build           - Build images"
	@echo "  make restart         - Restart all services"
	@echo "  make clean           - Stop and remove all volumes"
	@echo "  make db-migrate      - Create new migration (msg=description)"
	@echo "  make db-upgrade      - Apply pending migrations"
	@echo "  make db-shell        - Open psql shell"
	@echo "  make shell-backend   - Open backend shell"
	@echo "  make ollama-pull     - Pull an Ollama model"
	@echo "  make ollama-list     - List installed Ollama models"
	@echo "  make setup           - Initial project setup"

# --- Minimal Stack (without PostgreSQL, Ollama, Traefik) ---
minimal-up:
	docker compose -f docker-compose.minimal.yml up -d

minimal-up-build:
	docker compose -f docker-compose.minimal.yml up -d --build

minimal-down:
	docker compose -f docker-compose.minimal.yml down

minimal-logs:
	docker compose -f docker-compose.minimal.yml logs -f

minimal-restart:
	docker compose -f docker-compose.minimal.yml restart

minimal-build:
	docker compose -f docker-compose.minimal.yml build

minimal-shell-backend:
	docker compose -f docker-compose.minimal.yml exec backend /bin/bash

minimal-db-upgrade:
	docker compose -f docker-compose.minimal.yml exec backend alembic upgrade head
