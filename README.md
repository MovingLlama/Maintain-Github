# Maintain@Github 🚀

An AI-powered GitHub repository management platform. Select your GitHub repositories, edit code with the help of AI agents (powered by local Ollama or OpenRouter), and push changes back to GitHub — all from a beautiful web interface.

## ✨ Features

- **GitHub OAuth Login** — Secure authentication via GitHub OAuth 2.0
- **Repository Browser** — Browse and clone your GitHub repositories
- **File Viewer** — View files in your cloned repositories with syntax highlighting
- **AI Chat** — Chat with AI models about your code
- **Agent Mode** — Let AI agents autonomously read, edit, and improve your codebase
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

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose v2
- A GitHub account
- (Optional) A server with a public IP and domain for production use

### Option A: Interactive Setup (Recommended)

The easiest way to get started is the interactive setup script. It asks you step by step what you need and generates both `.env` and `docker-compose.generated.yml` for you:

```bash
chmod +x setup.sh
./setup.sh
```

The script will guide you through:
- **PostgreSQL**: New local Docker container or connect to an existing instance
- **Traefik**: Automatic HTTPS with Let's Encrypt (or skip for Cloudflare Tunnel / local dev)
- **Ollama**: Local Docker container (with optional GPU support) or external instance
- **OpenRouter**: Optional API key for cloud AI models (GPT-4, Claude, etc.)
- **GitHub OAuth**: Client ID & Secret (with callback URL hints)
- **Secrets**: Automatically generates secure keys

After the script finishes:

```bash
docker compose -f docker-compose.generated.yml up -d --build
```

### Option B: Manual Setup

#### 1. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** `Maintain@Github`
   - **Homepage URL:** `https://yourdomain.com`
   - **Authorization callback URL:** `https://yourdomain.com/auth/github/callback`
4. Copy the **Client ID** and generate a **Client Secret**

#### 2. Configure Environment

```bash
# Create .env from template
make setup
# OR:
cp .env.example .env
```

Edit `.env` and set at minimum these values:

```bash
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

#### 3. Start the Application

```bash
# Open required firewall ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Build and start all services
make up-build

# Follow logs
make logs
```

Wait until you see: `Database initialized.` and `Application startup complete.`

#### 4. Access the App

Navigate to `https://yourdomain.com` and log in with GitHub.

#### 5. Pull an AI Model (Optional but Recommended)

```bash
make ollama-pull
# Enter model name: llama3:8b
```

## 🛠️ Developer Commands

```bash
make up              # Start all services (detached)
make up-build        # Build and start
make down            # Stop all services
make logs            # Follow all logs
make logs-backend    # Follow backend + worker logs
make restart         # Restart all services
make clean           # ⚠️ Remove containers AND volumes

make db-migrate msg="description"  # Create migration
make db-upgrade      # Apply migrations
make db-shell        # Open psql shell

make shell-backend   # Shell into backend container
make ollama-pull     # Pull an Ollama model
make ollama-list     # List installed Ollama models
make setup           # Initial project setup
make help            # Show all commands
```

## 📁 Project Structure

```
Maintain@Github/
├── setup.sh                # Interactive setup wizard
├── docker-compose.yml      # Full stack (with Traefik, Postgres, Ollama)
├── docker-compose.minimal.yml  # Minimal stack (external DB/Ollama)
├── .env.example            # Environment template (full)
├── .env.minimal.example    # Environment template (minimal)
├── Makefile                # Developer shortcuts
├── ARCHITECTURE.md         # Detailed architecture docs
├── README.md               # This file
├── SETUP.md                # Detailed setup guide
│
├── backend/                # Python FastAPI backend
│   ├── main.py             # App entry point
│   ├── entrypoint.sh       # DB wait + migration startup
│   ├── alembic/            # Database migrations
│   └── app/
│       ├── api/routes/     # REST API endpoints
│       ├── core/           # Config, security, middleware
│       ├── db/             # Database engine & init
│       ├── models/         # SQLAlchemy ORM models
│       ├── schemas/        # Pydantic request/response schemas
│       └── services/
│           ├── ai/         # Ollama, OpenRouter, Agent runner
│           └── git/        # Git clone/push/read/write
│
├── frontend/               # React + TypeScript frontend
│   └── src/
│       ├── api/            # Axios API clients
│       ├── components/     # Reusable UI components
│       ├── hooks/          # Custom React hooks
│       ├── pages/          # Route page components
│       ├── stores/         # Zustand state management
│       └── types/          # TypeScript interfaces
│
└── traefik/                # Reverse proxy configuration
```

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
make ollama-list    # Check installed models
make ollama-pull    # Pull a new model
```

## 📄 License

MIT License
