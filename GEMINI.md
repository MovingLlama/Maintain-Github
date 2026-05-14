# Maintain@Github

## Project Overview

Maintain@Github is an AI-powered GitHub repository management platform. It allows users to select their GitHub repositories, edit code with the help of AI agents (powered by local Ollama or OpenRouter), and push changes back to GitHub through a web interface.

The project features a full-stack architecture:
- **Frontend**: A React application built with Vite and TypeScript. It utilizes Zustand for state management, React Query for API data fetching, React Router for routing, and Tailwind CSS for styling.
- **Backend**: A Python FastAPI application providing REST API endpoints and WebSocket connectivity.
- **Databases**: PostgreSQL for persistent storage (users, chats, repository metadata) and Redis for task queues and caching (used by Celery).
- **AI Integration**: Support for local AI models via Ollama and cloud models via OpenRouter APIs.
- **Infrastructure**: Traefik serves as a reverse proxy, handling automatic HTTPS via Let's Encrypt and basic rate limiting.
- **Containerization**: The entire stack is orchestrated using Docker Compose.

## Building and Running

### Using Docker Compose (Production/Standard)
Deploy using the Docker images from GHCR (requires `.env` configured properly):
```bash
docker compose pull
docker compose up -d
docker compose logs -f
```

To apply database migrations:
```bash
docker compose exec backend alembic upgrade head
```

### Local Development
To build the images locally and start the development environment, copy `.env.example` to `.env`, set up your variables, and use the included `Makefile`:

```bash
# Build and start with local source code
make dev-up-build

# Or use the minimal dev stack (if using external DB/tunnel)
make dev-minimal-up-build
```

**Common Makefile commands:**
- `make up` / `make down`: Manage production services
- `make db-upgrade`: Apply pending DB migrations
- `make shell-backend`: Open a bash shell in the backend container
- `make db-shell`: Open psql shell

### Sub-projects
- **Frontend (`/frontend`)**: Standard Vite/React scripts (`npm run dev`, `npm run build`, `npm run lint`).
- **Backend (`/backend`)**: FastAPI server managed typically via Uvicorn within Docker, with Alembic for migrations.

## Development Conventions

- **Frontend**: Emphasizes modern React paradigms (Hooks), strong typing with TypeScript, and utility-first styling with Tailwind CSS. Includes ESLint for enforcing code quality.
- **Backend**: Emphasizes explicit type hinting, Pydantic for validation/settings management, and SQLAlchemy 2.0 ORM conventions. Follows a structured directory pattern (`api`, `core`, `db`, `models`, `schemas`, `services`).
- **Git/System**: Operations on local repositories are handled safely via `GitPython` and `aiofiles`.
