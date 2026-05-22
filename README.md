# Maintain@Github 🚀

An AI-powered GitHub repository management platform. Select your GitHub repositories, edit code with the help of AI agents (powered by local Ollama or OpenRouter), and push changes back to GitHub — all from a beautiful web interface.

## ✨ Features

- **GitHub OAuth Login** — Secure authentication via GitHub OAuth 2.0
- **Repository Browser** — Browse and clone your GitHub repositories
- **File Viewer** — View files in your cloned repositories with syntax highlighting
- **AI Chat** — Chat with AI models about your code
- **Agent Mode** — Let AI agents autonomously read, edit, and improve your codebase
- **Technical Interview Prep** — Automatically generate code-grounded software engineering mock interview questions based on your specific repositories, complete with interactive Q&A practicing and qualitative AI principal engineer review rubrics
- **Multi-Model Support** — Local Ollama models AND OpenRouter (200+ cloud models)
- **Git Operations** — Commit and push changes directly to GitHub
- **HTTPS** — Automatic TLS via Traefik + Let's Encrypt
- **PostgreSQL** — Persistent storage for users, chats, and repo metadata
- **Rate Limiting** — Per-IP rate limiting for security
- **Security Headers** — HSTS, X-Frame-Options, CSP, and more

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   Traefik (HTTPS)                │
│         Port 80 (→HTTPS) & 443 (TLS)            │
└──────────┬──────────────────────┬───────────────┘
           │                      │
    ┌──────▼──────┐      ┌────────▼──────┐
    │   Frontend  │      │    Backend    │
    │ React/Vite  │      │   FastAPI     │
    │  Port 80    │      │  Port 8000    │
    └─────────────┘      └───────┬───────┘
                                 │
            ┌────────────────────┼───────────────────┐
            │                    │                   │
     ┌──────▼──────┐   ┌─────────▼────┐  ┌──────────▼────┐
     │  PostgreSQL │   │    Redis     │  │    Ollama     │
     │  Port 5432  │   │  Port 6379   │  │  Port 11434   │
     └─────────────┘   └─────────────┘  └───────────────┘
```

## 🚀 Quick Start (No git clone needed!)

Docker images are published automatically to GitHub Container Registry (GHCR) on every release.
You only need `docker` and `curl` — no source code required.

### Prerequisites
- Docker & Docker Compose v2
- A GitHub account with an OAuth App configured (see Step 1 below)
- A server with a public IP and domain (for production with HTTPS)

### Step 1: Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** `Maintain@Github`
   - **Homepage URL:** `https://yourdomain.com`
   - **Authorization callback URL:** `https://yourdomain.com/auth/github/callback`
4. Copy the **Client ID** and generate a **Client Secret**

### Step 2: Install

Run the install script — it downloads all required files (compose files, traefik config, env template):

```bash
curl -fsSL https://raw.githubusercontent.com/MovingLlama/Maintain-Github/main/install.sh | bash
```

Or download and inspect first:

```bash
curl -fsSL https://raw.githubusercontent.com/MovingLlama/Maintain-Github/main/install.sh -o install.sh
chmod +x install.sh
./install.sh
```

### Step 3: Configure

Edit the generated `.env` file:

```bash
nano .env
```

Set at minimum these values:

```env
DOMAIN=yourdomain.com
TRAEFIK_EMAIL=your@email.com

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=https://yourdomain.com/auth/github/callback

# Generate with: openssl rand -hex 32
APP_SECRET_KEY=your_random_secret
JWT_SECRET_KEY=your_random_jwt_secret

# Generate with: openssl rand -hex 16
POSTGRES_PASSWORD=your_db_password
```

### Step 4: Start

```bash
# Open required firewall ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Pull images from GHCR and start all services
docker compose up -d

# Follow logs
docker compose logs -f
```

Wait until you see: `Database initialized.` and `Application startup complete.`

### Step 5: Access

Navigate to `https://yourdomain.com` and log in with GitHub.

### Step 6: Pull an AI Model (Optional but Recommended)

```bash
docker compose exec ollama ollama pull llama3:8b
```

---

## 🔧 Minimal Setup (External DB / Cloudflare Tunnel)

If you already have PostgreSQL and Ollama running externally, or prefer Cloudflare Tunnel over Traefik:

```bash
docker compose -f docker-compose.minimal.yml up -d
```

This starts only: Redis, Backend, Worker, Frontend — no Traefik, Postgres, or Ollama containers.
See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) for tunnel setup instructions.

---

## 🔄 Updating

```bash
# Pull the latest images and restart
docker compose pull
docker compose up -d

# Apply any new database migrations
docker compose exec backend alembic upgrade head
```

---

## 🛠️ Commands

```bash
docker compose pull        # Pull latest images from GHCR
docker compose up -d       # Start all services
docker compose down        # Stop all services
docker compose logs -f     # Follow all logs
docker compose restart     # Restart all services

docker compose exec backend alembic upgrade head   # Apply DB migrations
docker compose exec postgres psql -U maintain -d maintain_github  # DB shell
docker compose exec backend /bin/bash              # Backend shell
docker compose exec ollama ollama pull llama3:8b   # Pull Ollama model
```

#### Using the Makefile shortcuts

```bash
make up              # Pull and start production services
make pull            # Pull latest GHCR images
make down            # Stop production services
make logs            # Follow logs
make clean           # ⚠️ Remove containers AND volumes
make db-upgrade      # Apply pending DB migrations
make db-shell        # Open psql shell
make shell-backend   # Shell into backend container
make ollama-pull     # Interactive Ollama model pull
make help            # Show all available commands
```

---

## 🧑‍💻 Developer Setup (Local Build)

If you want to modify the source code and build images locally:

```bash
git clone https://github.com/MovingLlama/Maintain-Github.git
cd maintain-github
cp .env.example .env
nano .env

# Build and start with local source
make dev-up-build

# Or the minimal dev stack
make dev-minimal-up-build
```

---

## 📁 Project Structure

```
Maintain@Github/
├── install.sh                  # One-liner installer (downloads config, no clone needed)
├── docker-compose.yml          # Production: full stack using GHCR images
├── docker-compose.minimal.yml  # Production: minimal stack using GHCR images
├── docker-compose.dev.yml      # Development: full stack with local build
├── docker-compose.dev-minimal.yml  # Development: minimal stack with local build
├── .env.example                # Environment template (full)
├── .env.minimal.example        # Environment template (minimal)
├── Makefile                    # Developer shortcuts
├── ARCHITECTURE.md             # Detailed architecture docs
├── README.md                   # This file
├── SETUP.md                    # Detailed setup guide
│
├── .github/workflows/
│   └── docker-publish.yml      # CI: build & push to ghcr.io on push to main / version tags
│
├── backend/                    # Python FastAPI backend
│   ├── main.py                 # App entry point
│   ├── entrypoint.sh           # DB wait + migration startup
│   ├── alembic/                # Database migrations
│   └── app/
│       ├── api/routes/         # REST API endpoints
│       ├── core/               # Config, security, middleware
│       ├── db/                 # Database engine & init
│       ├── models/             # SQLAlchemy ORM models
│       ├── schemas/            # Pydantic request/response schemas
│       └── services/
│           ├── ai/             # Ollama, OpenRouter, Agent runner
│           └── git/            # Git clone/push/read/write
│
├── frontend/                   # React + TypeScript frontend
│   └── src/
│       ├── api/                # Axios API clients
│       ├── components/         # Reusable UI components
│       ├── hooks/              # Custom React hooks
│       ├── pages/              # Route page components
│       ├── stores/             # Zustand state management
│       └── types/              # TypeScript interfaces
│
└── traefik/                    # Reverse proxy configuration
```

---

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| HTTPS | Traefik + Let's Encrypt (auto-renewal) |
| Authentication | GitHub OAuth 2.0 + JWT (httpOnly cookies) |
| Token Storage | GitHub tokens encrypted with AES-256 (Fernet) |
| Rate Limiting | Per-IP rate limiter (configurable req/min) |
| Security Headers | HSTS, X-Frame-Options, X-Content-Type-Options |
| Path Traversal | All file paths sanitized and validated |
| CSRF Protection | OAuth state parameter validation |
| Container Security | Non-root user in backend container |
| DB Credentials | Only via environment variables |

## 🤖 Supported AI Models

### Local (Ollama — no API key needed)
| Model | Use Case |
|-------|----------|
| `llama3:8b` | General purpose, fast |
| `codellama:7b` | Code generation |
| `deepseek-coder:6.7b` | Code analysis & generation |
| `qwen2.5-coder:7b` | Multilingual code |
| `mistral:7b` | Good balance |

### Cloud (OpenRouter — requires `OPENROUTER_API_KEY`)
| Model | Use Case |
|-------|----------|
| `anthropic/claude-3-haiku` | Fast & affordable |
| `anthropic/claude-3.5-sonnet` | Best quality |
| `openai/gpt-4o-mini` | Balanced |
| `google/gemini-flash-1.5` | Very fast |

## 🐛 Common Issues

**Database connection fails:**
```bash
docker compose logs postgres
# Check POSTGRES_PASSWORD in .env
```

**Let's Encrypt fails:**
```bash
# Ensure ports 80 and 443 are open
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
# Check: TRAEFIK_EMAIL is set correctly in .env
docker compose logs traefik
```

**GitHub OAuth redirect mismatch:**
```bash
# Ensure GITHUB_REDIRECT_URI in .env matches exactly what's configured in GitHub
# Format: https://YOURDOMAIN/auth/github/callback
```

**Ollama model not available:**
```bash
docker compose exec ollama ollama list     # Check installed models
docker compose exec ollama ollama pull llama3:8b  # Pull a new model
```

## 📄 License

MIT License
