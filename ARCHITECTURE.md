# ARCHITECTURE.md — Maintain@Github

> **Status:** Draft v1.0 | Letzte Änderung: 2026-05-02
>
> Dieses Dokument beschreibt die vollständige Systemarchitektur der **Maintain@Github** Web-Applikation.
> Es dient als verbindliche Referenz für alle Implementierungsarbeiten.

---

## Inhaltsverzeichnis

1. [Ziel und Überblick](#1-ziel-und-überblick)
2. [Technologie-Stack-Entscheidungen](#2-technologie-stack-entscheidungen)
3. [Service-Übersicht](#3-service-übersicht)
4. [Datenbankschema](#4-datenbankschema)
5. [API-Endpunkte](#5-api-endpunkte)
6. [Verzeichnisstruktur](#6-verzeichnisstruktur)
7. [Sicherheitskonzept](#7-sicherheitskonzept)
8. [Environment Variables](#8-environment-variables)
9. [Datenfluss-Diagramme](#9-datenfluss-diagramme)

---

## 1. Ziel und Überblick

**Maintain@Github** ist eine selbst-gehostete Web-Applikation, die Entwicklern ermöglicht:

- GitHub-Repositories über eine moderne Web-Oberfläche auszuwählen, lokal zu klonen und zu bearbeiten
- KI-Assistenten (lokal via Ollama oder cloud-basiert via OpenRouter) agentisch für Code-Verbesserungen, Issue-Bearbeitung und Refactoring einzusetzen
- Geänderte Dateien direkt aus der Web-Oberfläche zurück auf GitHub zu pushen
- Chat-Historien und Projekt-Metadaten persistent in PostgreSQL zu speichern

Die gesamte Anwendung läuft in Docker-Containern und ist über HTTPS extern erreichbar.

---

## 2. Technologie-Stack-Entscheidungen

### 2.1 Frontend — React + Vite + TypeScript + Tailwind CSS

| Entscheidung | Begründung |
|---|---|
| **React 18** | Größtes Ökosystem, Server-Side Events / Streaming-Support via `EventSource`, breite Community |
| **Vite** | Extrem schnelle Dev-Builds, native ESM, einfaches Proxy-Setup für lokale Entwicklung |
| **TypeScript** | Typsicherheit, bessere IDE-Unterstützung, reduziert Laufzeitfehler |
| **Tailwind CSS** | Utility-First, keine CSS-Konflikte, sehr schnelle UI-Entwicklung |
| **TanStack Query** | Deklaratives Data-Fetching, automatisches Caching und Refetching |
| **Zustand** | Lightweight State Management (kein Redux-Overhead) |
| **Monaco Editor** | VSCode-basierter Code-Editor im Browser (gleiche Engine wie VSCode) |
| **Socket.IO Client** | Echtzeit-Chat-Streaming, Agent-Status-Updates |

### 2.2 Backend — Python + FastAPI

| Entscheidung | Begründung |
|---|---|
| **Python 3.12** | Beste native Unterstützung für KI/ML-Bibliotheken (Ollama SDK, LangChain, httpx) |
| **FastAPI** | Native async/await, automatische OpenAPI-Dokumentation, WebSocket-Support, Pydantic-Validierung |
| **SQLAlchemy 2.0** | Async ORM, deklarative Modelle, Alembic-Integration |
| **Alembic** | Datenbankmigrationen mit automatischem Schema-Check beim Start |
| **Celery + Redis** | Hintergrund-Tasks für langläufige Git-Operationen und KI-Agenten-Schritte |
| **GitPython** | Programmatischer Zugriff auf Git-Repositories (clone, commit, push) |
| **httpx** | Async HTTP-Client für OpenRouter API und Ollama REST API |
| **python-jose** | JWT-Token-Verarbeitung für Session-Management |

### 2.3 Datenbank — PostgreSQL 16

| Entscheidung | Begründung |
|---|---|
| **PostgreSQL 16** | ACID-Compliance, JSON/JSONB-Support für flexible Agent-Konfigurationen, volle SQL-Unterstützung |
| **pgvector** (optional) | Vektordatenbank-Extension für semantische Suche in Chat-Historien |
| **Alembic Auto-Migrate** | Schema-Check und Migration beim Container-Start ohne manuelle Eingriffe |

### 2.4 KI-Integration

| Entscheidung | Begründung |
|---|---|
| **Ollama** | Lokaler LLM-Server, datenschutzkonform, kein API-Key erforderlich, GPU-Support |
| **OpenRouter API** | Einheitlicher Zugang zu 200+ Cloud-Modellen (GPT-4o, Claude, Gemini) |
| **LangChain / eigenes Tool-Calling** | Agentisches System mit definierten Tools (Datei lesen/schreiben, Git-Operationen, GitHub API) |
| **Streaming** | Server-Sent Events (SSE) für Echtzeit-Ausgabe der KI-Antworten |

### 2.5 Reverse Proxy — Traefik v3

| Entscheidung | Begründung |
|---|---|
| **Traefik** | Native Docker-Integration via Labels, automatisches HTTPS mit Let's Encrypt, kein manuelles Nginx-Config-Management |
| **Let's Encrypt** | Automatische SSL-Zertifikate (ACME-Protokoll) |
| **Traefik Middlewares** | Rate Limiting, CORS, Auth-Middleware direkt in Traefik konfigurierbar |

### 2.6 Message Queue — Redis

| Entscheidung | Begründung |
|---|---|
| **Redis 7** | Celery Broker für Hintergrund-Tasks, Session-Cache, Rate-Limiting-State |

---

## 3. Service-Übersicht

### 3.1 Docker-Service-Tabelle

| Service | Image | Port (intern) | Port (extern) | Abhängigkeiten |
|---|---|---|---|---|
| `traefik` | `traefik:v3` | 80, 443, 8080 | 80, 443 | — |
| `frontend` | Custom (Node build) | 3000 | via Traefik | `backend` |
| `backend` | Custom (Python) | 8000 | via Traefik | `postgres`, `redis`, `ollama` |
| `postgres` | `postgres:16-alpine` | 5432 | — (intern) | — |
| `redis` | `redis:7-alpine` | 6379 | — (intern) | — |
| `ollama` | `ollama/ollama` | 11434 | — (intern) | — |
| `worker` | Custom (Python) | — | — | `redis`, `postgres` |

### 3.2 Netzwerk-Topologie

```
Internet
    │
    ▼
[Traefik :80/:443]  ──── HTTPS/TLS ────
    │
    ├──── /  ──────────────────────► [Frontend :3000]
    │
    └──── /api  ───────────────────► [Backend :8000]
              │                           │
              │                    ┌──────┼──────┐
              │                    ▼      ▼      ▼
              │              [Postgres] [Redis] [Ollama]
              │                                  │
              │                           [Ollama Models]
              │
              └── WebSocket /ws ────────► [Backend :8000]
```

### 3.3 Docker-Compose-Übersicht

```yaml
# Vereinfachte Strukturübersicht (kein ausführbares Compose-File)
services:
  traefik:
    image: traefik:v3
    ports: [80, 443, 8080]
    volumes: [docker.sock, traefik.yml, acme.json]
    networks: [proxy, internal]

  frontend:
    build: ./frontend
    labels: [traefik routing rules]
    networks: [proxy]

  backend:
    build: ./backend
    labels: [traefik routing rules]
    environment: [DB_URL, REDIS_URL, GITHUB_*, JWT_SECRET, ...]
    volumes: [repos_data]
    networks: [proxy, internal]
    depends_on: [postgres, redis]

  worker:
    build: ./backend
    command: celery -A app.worker worker
    environment: [gleich wie backend]
    volumes: [repos_data]
    networks: [internal]
    depends_on: [redis, postgres]

  postgres:
    image: postgres:16-alpine
    volumes: [postgres_data]
    networks: [internal]

  redis:
    image: redis:7-alpine
    networks: [internal]

  ollama:
    image: ollama/ollama
    volumes: [ollama_data]
    networks: [internal]
    deploy:
      resources:
        reservations:
          devices: [gpu]  # optional GPU-Support

networks:
  proxy:    # Traefik <-> Frontend/Backend
  internal: # Interne Services

volumes:
  postgres_data:
  redis_data:
  ollama_data:
  repos_data:   # geklonte Git-Repositories
```

---

## 4. Datenbankschema

### 4.1 Übersicht aller Tabellen

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   users     │──┐  │  sessions    │     │   repositories   │
├─────────────┤  │  ├──────────────┤     ├──────────────────┤
│ id (PK)     │  └─►│ user_id (FK) │  ┌─►│ user_id (FK)     │
│ github_id   │     │ token_hash   │  │  │ github_repo_id   │
│ login       │     │ expires_at   │  │  │ name             │
│ ...         │     └──────────────┘  │  │ ...              │
└──────┬──────┘                       │  └─────────┬────────┘
       │                              │            │
       └──────────────────────────────┘            │
                                                   │
┌──────────────┐     ┌──────────────┐              │
│    chats     │     │   messages   │              │
├──────────────┤     ├──────────────┤              │
│ id (PK)      │──┐  │ chat_id (FK) │              │
│ user_id (FK) │  └─►│ role         │              │
│ repo_id (FK) │◄────│ content      │              │
│ agent_id(FK) │     │ tool_calls   │              │
│ title        │     │ metadata     │              │
│ ...          │     └──────────────┘              │
└──────────────┘                                   │
                                                   │
┌──────────────┐     ┌──────────────┐              │
│    agents    │     │   settings   │              │
├──────────────┤     ├──────────────┤              │
│ id (PK)      │     │ user_id (FK) │              │
│ user_id (FK) │     │ key          │              │
│ name         │     │ value        │              │
│ provider     │     │ is_encrypted │              │
│ model        │     └──────────────┘              │
│ system_prompt│                                   │
│ tools_config │     ┌──────────────────────────┐  │
│ ...          │     │     repo_files_cache     │  │
└──────────────┘     ├──────────────────────────┤  │
                     │ id (PK)                  │  │
                     │ repo_id (FK)             │◄─┘
                     │ file_path                │
                     │ content_hash             │
                     │ last_indexed_at          │
                     └──────────────────────────┘
```

### 4.2 Detailliertes Schema (SQL DDL)

```sql
-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id       BIGINT UNIQUE NOT NULL,
    login           VARCHAR(255) NOT NULL,           -- GitHub Username
    email           VARCHAR(255),
    avatar_url      TEXT,
    name            VARCHAR(255),
    github_token    TEXT,                            -- verschlüsseltes OAuth-Token
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_users_github_id ON users(github_id);

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) UNIQUE NOT NULL,    -- SHA-256 des JWT
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    last_used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================
-- REPOSITORIES
-- ============================================================
CREATE TABLE repositories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    github_repo_id  BIGINT NOT NULL,
    owner           VARCHAR(255) NOT NULL,           -- GitHub org/user
    name            VARCHAR(255) NOT NULL,
    full_name       VARCHAR(511) NOT NULL,           -- owner/name
    description     TEXT,
    html_url        TEXT NOT NULL,
    clone_url       TEXT NOT NULL,
    default_branch  VARCHAR(255) DEFAULT 'main',
    is_private      BOOLEAN NOT NULL DEFAULT FALSE,
    is_cloned       BOOLEAN NOT NULL DEFAULT FALSE,
    local_path      TEXT,                            -- absoluter Pfad im Container
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, github_repo_id)
);

CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_repositories_full_name ON repositories(full_name);

-- ============================================================
-- AGENTS
-- ============================================================
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    provider        VARCHAR(50) NOT NULL,            -- 'ollama' | 'openrouter'
    model           VARCHAR(255) NOT NULL,           -- z.B. 'llama3.2' | 'anthropic/claude-3-5-sonnet'
    system_prompt   TEXT,
    temperature     FLOAT DEFAULT 0.7,
    max_tokens      INTEGER DEFAULT 4096,
    tools_config    JSONB DEFAULT '[]',              -- Array von aktivierten Tools
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_user_id ON agents(user_id);

-- ============================================================
-- CHATS
-- ============================================================
CREATE TABLE chats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_id         UUID REFERENCES repositories(id) ON DELETE SET NULL,
    agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
    title           VARCHAR(500),
    branch          VARCHAR(255),                    -- aktiver Git-Branch beim Chat
    status          VARCHAR(50) DEFAULT 'active',   -- 'active' | 'archived'
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_chats_repo_id ON chats(repo_id);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id         UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL,            -- 'user' | 'assistant' | 'tool' | 'system'
    content         TEXT,
    tool_calls      JSONB,                           -- OpenAI-kompatibles Format
    tool_call_id    VARCHAR(255),                    -- für Tool-Antworten
    finish_reason   VARCHAR(50),                     -- 'stop' | 'tool_calls' | 'length'
    model           VARCHAR(255),                    -- verwendetes Modell
    tokens_used     INTEGER,
    duration_ms     INTEGER,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================================
-- SETTINGS
-- ============================================================
CREATE TABLE settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = global
    key             VARCHAR(255) NOT NULL,
    value           TEXT,
    is_encrypted    BOOLEAN NOT NULL DEFAULT FALSE,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, key)
);

CREATE INDEX idx_settings_user_id ON settings(user_id);
CREATE INDEX idx_settings_key ON settings(key);

-- ============================================================
-- REPO_FILES_CACHE
-- ============================================================
CREATE TABLE repo_files_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id         UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    content_hash    VARCHAR(64),                     -- SHA-256
    file_size       BIGINT,
    language        VARCHAR(50),
    last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(repo_id, file_path)
);

CREATE INDEX idx_repo_files_repo_id ON repo_files_cache(repo_id);

-- ============================================================
-- JOBS (Hintergrund-Tasks)
-- ============================================================
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    celery_task_id  VARCHAR(255),
    type            VARCHAR(100) NOT NULL,           -- 'clone_repo' | 'push_changes' | 'agent_run'
    status          VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'success' | 'failed'
    payload         JSONB DEFAULT '{}',
    result          JSONB,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
```

---

## 5. API-Endpunkte

### 5.1 REST API — Basisinformationen

- **Base URL:** `https://<domain>/api/v1`
- **Auth:** `Authorization: Bearer <jwt_token>` (außer Auth-Endpunkte)
- **Content-Type:** `application/json`
- **Docs:** `https://<domain>/api/docs` (FastAPI OpenAPI-UI)

### 5.2 Auth-Endpunkte

| Methode | Pfad | Beschreibung | Auth |
|---|---|---|---|
| `GET` | `/auth/github/login` | GitHub OAuth Redirect starten | Nein |
| `GET` | `/auth/github/callback` | OAuth Callback, JWT zurückgeben | Nein |
| `POST` | `/auth/logout` | Session invalidieren | Ja |
| `GET` | `/auth/me` | Aktuellen User abrufen | Ja |
| `POST` | `/auth/refresh` | JWT-Token erneuern | Ja |

### 5.3 Repository-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/repos` | Alle gespeicherten Repositories des Users |
| `GET` | `/repos/github` | Repositories von GitHub API laden |
| `POST` | `/repos` | Repository hinzufügen und klonen |
| `GET` | `/repos/{repo_id}` | Repository-Details |
| `DELETE` | `/repos/{repo_id}` | Repository entfernen (lokal) |
| `POST` | `/repos/{repo_id}/sync` | Mit GitHub synchronisieren (pull) |
| `GET` | `/repos/{repo_id}/branches` | Git-Branches auflisten |
| `POST` | `/repos/{repo_id}/branches` | Neuen Branch erstellen |
| `GET` | `/repos/{repo_id}/files` | Dateibaum des Repositories |
| `GET` | `/repos/{repo_id}/files/{path}` | Dateiinhalt lesen |
| `PUT` | `/repos/{repo_id}/files/{path}` | Datei schreiben/ändern |
| `DELETE` | `/repos/{repo_id}/files/{path}` | Datei löschen |
| `GET` | `/repos/{repo_id}/diff` | Uncommitted Changes anzeigen |
| `POST` | `/repos/{repo_id}/commit` | Änderungen committen |
| `POST` | `/repos/{repo_id}/push` | Commit auf GitHub pushen |
| `GET` | `/repos/{repo_id}/log` | Git-Commit-History |

### 5.4 Chat & Agenten-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/chats` | Alle Chats des Users |
| `POST` | `/chats` | Neuen Chat erstellen |
| `GET` | `/chats/{chat_id}` | Chat-Details |
| `DELETE` | `/chats/{chat_id}` | Chat löschen |
| `PATCH` | `/chats/{chat_id}` | Chat-Metadaten aktualisieren |
| `GET` | `/chats/{chat_id}/messages` | Alle Nachrichten eines Chats |
| `POST` | `/chats/{chat_id}/messages` | Nachricht senden (startet Agenten) |
| `GET` | `/agents` | Alle Agent-Konfigurationen des Users |
| `POST` | `/agents` | Neuen Agent erstellen |
| `GET` | `/agents/{agent_id}` | Agent-Details |
| `PUT` | `/agents/{agent_id}` | Agent aktualisieren |
| `DELETE` | `/agents/{agent_id}` | Agent löschen |
| `GET` | `/ai/models/ollama` | Verfügbare Ollama-Modelle |
| `GET` | `/ai/models/openrouter` | Verfügbare OpenRouter-Modelle |

### 5.5 Settings-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/settings` | Alle User-Settings |
| `PUT` | `/settings/{key}` | Setting setzen/aktualisieren |
| `DELETE` | `/settings/{key}` | Setting löschen |

### 5.6 Job-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/jobs` | Alle Jobs des Users |
| `GET` | `/jobs/{job_id}` | Job-Status abrufen |

### 5.7 WebSocket-Endpunkte

| Pfad | Beschreibung | Events |
|---|---|---|
| `/ws/chat/{chat_id}` | Echtzeit-Chat-Streaming | `message_chunk`, `tool_call`, `tool_result`, `done`, `error` |
| `/ws/jobs/{job_id}` | Job-Status-Updates | `progress`, `log`, `done`, `error` |

#### WebSocket Message Format

```jsonc
// Vom Server gesendet
{
  "type": "message_chunk",       // event type
  "data": {
    "content": "...",            // Text-Fragment
    "role": "assistant"
  },
  "timestamp": "2026-05-02T..."
}

// Tool-Call Event
{
  "type": "tool_call",
  "data": {
    "tool_name": "read_file",
    "arguments": { "path": "src/main.py" }
  }
}
```

---

## 6. Verzeichnisstruktur

```
Maintain@Github/
├── docker-compose.yml              # Haupt-Compose-File (Produktion)
├── docker-compose.dev.yml          # Overrides für lokale Entwicklung
├── .env                            # Sensible Konfiguration (NICHT in Git!)
├── .env.example                    # Template für .env
├── .gitignore
├── ARCHITECTURE.md                 # Dieses Dokument
├── README.md
│
├── traefik/
│   ├── traefik.yml                 # Statische Traefik-Konfiguration
│   ├── dynamic/
│   │   └── middlewares.yml         # Rate Limiting, CORS etc.
│   └── acme.json                   # Let's Encrypt Zertifikate (nur Datei, leer)
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf                  # Nginx zum Ausliefern des React-Builds
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                # React-Einstiegspunkt
│       ├── App.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Header.tsx
│       │   │   └── MainLayout.tsx
│       │   ├── repo/
│       │   │   ├── RepoList.tsx
│       │   │   ├── FileExplorer.tsx
│       │   │   ├── CodeEditor.tsx  # Monaco Editor
│       │   │   └── DiffViewer.tsx
│       │   ├── chat/
│       │   │   ├── ChatPanel.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── MessageInput.tsx
│       │   │   └── ToolCallDisplay.tsx
│       │   └── agents/
│       │       ├── AgentConfig.tsx
│       │       └── ModelSelector.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── RepoPage.tsx
│       │   ├── ChatPage.tsx
│       │   └── SettingsPage.tsx
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useAuth.ts
│       │   └── useRepo.ts
│       ├── store/
│       │   └── useStore.ts         # Zustand Store
│       ├── api/
│       │   └── client.ts           # TanStack Query + axios
│       └── types/
│           └── index.ts
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/               # Migrations-Files
│   └── app/
│       ├── main.py                 # FastAPI App-Einstiegspunkt
│       ├── config.py               # Pydantic Settings (liest .env)
│       ├── database.py             # SQLAlchemy Engine + Session
│       ├── worker.py               # Celery App-Definition
│       │
│       ├── models/                 # SQLAlchemy ORM-Modelle
│       │   ├── __init__.py
│       │   ├── user.py
│       │   ├── session.py
│       │   ├── repository.py
│       │   ├── chat.py
│       │   ├── message.py
│       │   ├── agent.py
│       │   ├── setting.py
│       │   └── job.py
│       │
│       ├── schemas/                # Pydantic Request/Response-Schemas
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── repository.py
│       │   ├── chat.py
│       │   ├── message.py
│       │   ├── agent.py
│       │   └── settings.py
│       │
│       ├── routers/                # FastAPI Router
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   ├── repos.py
│       │   ├── chats.py
│       │   ├── agents.py
│       │   ├── settings.py
│       │   ├── jobs.py
│       │   └── websocket.py
│       │
│       ├── services/               # Business Logic
│       │   ├── __init__.py
│       │   ├── auth_service.py     # GitHub OAuth, JWT
│       │   ├── github_service.py   # GitHub API-Client
│       │   ├── git_service.py      # GitPython-Wrapper
│       │   ├── ai_service.py       # Ollama + OpenRouter
│       │   ├── agent_service.py    # Agentisches System + Tools
│       │   └── file_service.py     # Dateisystem-Operationen
│       │
│       ├── tasks/                  # Celery-Tasks
│       │   ├── __init__.py
│       │   ├── git_tasks.py        # clone, push (langläufig)
│       │   └── agent_tasks.py      # langläufige Agenten-Runs
│       │
│       ├── middleware/
│       │   ├── auth_middleware.py  # JWT-Validierung
│       │   └── rate_limit.py
│       │
│       └── utils/
│           ├── crypto.py           # Verschlüsselung für Tokens
│           └── startup.py          # DB-Check + Migrationen beim Start
│
└── data/                           # Docker Volumes (bind mounts, nicht in Git)
    ├── postgres/
    ├── redis/
    ├── ollama/
    └── repos/                      # geklonte Repositories
```

---

## 7. Sicherheitskonzept

### 7.1 Authentifizierung

**GitHub OAuth 2.0 Flow:**

1. User klickt "Login with GitHub"
2. Backend generiert `state`-Parameter (CSRF-Schutz) → speichert in Redis (TTL 10 min)
3. Redirect zu `github.com/login/oauth/authorize?client_id=...&state=...&scope=repo,user`
4. GitHub redirectet zu `/auth/github/callback?code=...&state=...`
5. Backend validiert `state`, tauscht `code` gegen GitHub OAuth-Token ein
6. GitHub-Token wird verschlüsselt in DB gespeichert (`AES-256-GCM`)
7. Backend erstellt JWT (`access_token`, 1h) + Refresh-Token (7d)
8. Frontend speichert Tokens in `httpOnly`-Cookies (kein JavaScript-Zugriff)

**JWT-Konfiguration:**
- Algorithmus: `RS256` (asymmetrische Schlüssel)
- Access-Token-Laufzeit: 1 Stunde
- Refresh-Token-Laufzeit: 7 Tage
- Token-Hash wird in `sessions`-Tabelle gespeichert (ermöglicht Server-seitige Invalidierung)

### 7.2 Autorisierung

- Jeder API-Endpoint prüft: `request.user.id == resource.user_id`
- Repository-Pfade werden gegen `user_id` + `repo_id` verifiziert (kein Path-Traversal)
- File-Operationen: nur innerhalb des geklonten Repository-Verzeichnisses erlaubt (Sandbox)
- Git-Push: nur für Repositories, die dem User gehören

### 7.3 HTTPS & Traefik

```yaml
# Traefik HTTPS-Konfiguration (traefik.yml)
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https        # Permanenter Redirect auf HTTPS
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /acme.json
      httpChallenge:
        entryPoint: web
```

### 7.4 Rate Limiting

Traefik-Middleware-Konfiguration:

| Endpunkt-Typ | Grenze |
|---|---|
| Auth-Endpunkte (`/auth/*`) | 10 Req/min pro IP |
| AI-Endpunkte (`/chats/*/messages`) | 20 Req/min pro User |
| File-Operationen (`/repos/*/files`) | 100 Req/min pro User |
| Allgemeine API | 300 Req/min pro User |

### 7.5 CORS

```python
# Backend CORS-Konfiguration
allowed_origins = [
    "https://your-domain.com",
    "http://localhost:3000",  # nur in Dev-Modus
]
```

### 7.6 Sicherheits-Checkliste

- [x] GitHub OAuth-Tokens verschlüsselt in DB (`AES-256-GCM` mit `ENCRYPTION_KEY`)
- [x] OpenRouter API-Keys verschlüsselt in `settings`-Tabelle
- [x] JWT mit RS256 (kein HS256 mit shared secret)
- [x] CSRF-Schutz via `state`-Parameter im OAuth-Flow
- [x] `httpOnly` + `Secure` + `SameSite=Strict` Cookies
- [x] Path-Traversal-Schutz bei File-Operationen (Normalisierung + Prefix-Check)
- [x] SQL-Injection-Schutz durch SQLAlchemy parameterized queries
- [x] Alle Secrets nur in Environment Variables (nie in Code oder Git)
- [x] Docker-Container ohne Root-Rechte (`USER app`)
- [x] Read-only Dateisystem wo möglich
- [x] Security-Header via Traefik: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`

---

## 8. Environment Variables

### 8.1 Vollständige Variable-Liste

```bash
# ============================================================
# BACKEND — Datenbankverbindung
# ============================================================
DATABASE_URL=postgresql+asyncpg://maintain:password@postgres:5432/maintain
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20

# ============================================================
# BACKEND — Redis
# ============================================================
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# ============================================================
# BACKEND — GitHub OAuth
# ============================================================
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://your-domain.com/api/v1/auth/github/callback

# ============================================================
# BACKEND — JWT / Session
# ============================================================
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...  # RS256 Private Key
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...          # RS256 Public Key
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# ============================================================
# BACKEND — Verschlüsselung
# ============================================================
ENCRYPTION_KEY=base64-encoded-32-byte-aes-key  # für GitHub/API-Token-Verschlüsselung

# ============================================================
# BACKEND — AI-Dienste
# ============================================================
OLLAMA_API_URL=http://ollama:11434
OPENROUTER_API_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=sk-or-...     # Optional, kann auch pro User in DB gespeichert werden
OPENROUTER_APP_NAME=Maintain@Github
OPENROUTER_APP_URL=https://your-domain.com

# ============================================================
# BACKEND — Dateisystem
# ============================================================
REPOS_BASE_PATH=/data/repos       # Pfad für geklonte Repositories im Container

# ============================================================
# BACKEND — Anwendung
# ============================================================
APP_ENV=production                 # 'development' | 'production'
APP_DEBUG=false
APP_SECRET_KEY=random-secret-key-for-misc-use
CORS_ALLOWED_ORIGINS=https://your-domain.com
LOG_LEVEL=INFO

# ============================================================
# POSTGRES
# ============================================================
POSTGRES_DB=maintain
POSTGRES_USER=maintain
POSTGRES_PASSWORD=super-secret-db-password

# ============================================================
# TRAEFIK
# ============================================================
TRAEFIK_ACME_EMAIL=admin@your-domain.com
DOMAIN=your-domain.com

# ============================================================
# FRONTEND (Build-Zeit Variablen — Vite VITE_ Prefix)
# ============================================================
VITE_API_BASE_URL=https://your-domain.com/api/v1
VITE_WS_URL=wss://your-domain.com/ws
VITE_APP_NAME=Maintain@Github
```

### 8.2 Variable-Kategorien und Verwaltung

| Kategorie | Verwaltung | Sicherheitsstufe |
|---|---|---|
| DB-Credentials | `.env` (Docker Secrets in Prod) | 🔴 Kritisch |
| GitHub OAuth Secrets | `.env` | 🔴 Kritisch |
| JWT-Schlüssel | `.env` (externe PKI möglich) | 🔴 Kritisch |
| Encryption Key | `.env` | 🔴 Kritisch |
| OpenRouter API Key | DB (verschlüsselt) oder `.env` | 🟠 Hoch |
| Ollama URL | `.env` | 🟡 Mittel |
| Frontend Build-Vars | `.env` (nicht sensitiv) | 🟢 Niedrig |

---

## 9. Datenfluss-Diagramme

### 9.1 GitHub OAuth 2.0 Login Flow

```
User Browser          Frontend             Backend             GitHub API        Redis/DB
     │                    │                    │                    │               │
     │  Klick "Login"     │                    │                    │               │
     │───────────────────►│                    │                    │               │
     │                    │  GET /auth/github  │                    │               │
     │                    │  /login            │                    │               │
     │                    │───────────────────►│                    │               │
     │                    │                    │ gen state=<uuid>   │               │
     │                    │                    │────────────────────────────────────►
     │                    │                    │ SETEX state 600    │               │
     │                    │                    │                    │               │
     │  302 Redirect      │  302 Redirect      │                    │               │
     │◄───────────────────│◄───────────────────│                    │               │
     │  github.com/login  │                    │                    │               │
     │  /oauth/authorize  │                    │                    │               │
     │  ?client_id=...    │                    │                    │               │
     │  &state=<uuid>     │                    │                    │               │
     │                    │                    │                    │               │
     │  User gibt GitHub-Credentials ein       │                    │               │
     │────────────────────────────────────────────────────────────►│               │
     │                    │                    │                    │               │
     │  302 Redirect zu /api/v1/auth/github/callback?code=X&state=Y               │
     │◄───────────────────────────────────────────────────────────────             │
     │                    │                    │                    │               │
     │ GET /callback?     │                    │                    │               │
     │ code=X&state=Y     │                    │                    │               │
     │────────────────────────────────────────►│                    │               │
     │                    │                    │ GET state=Y        │               │
     │                    │                    │────────────────────────────────────►
     │                    │                    │ ✓ state valid      │               │
     │                    │                    │                    │               │
     │                    │                    │ POST /login/oauth  │               │
     │                    │                    │ /access_token      │               │
     │                    │                    │ code=X             │               │
     │                    │                    │───────────────────►│               │
     │                    │                    │◄───────────────────│               │
     │                    │                    │ github_token=gho_..│               │
     │                    │                    │                    │               │
     │                    │                    │ GET /user (GitHub) │               │
     │                    │                    │───────────────────►│               │
     │                    │                    │◄───────────────────│               │
     │                    │                    │ {id, login, ...}   │               │
     │                    │                    │                    │               │
     │                    │                    │ UPSERT users + sessions            │
     │                    │                    │────────────────────────────────────►
     │                    │                    │                    │               │
     │  Set-Cookie: access_token=JWT (httpOnly + Secure)           │               │
     │  Set-Cookie: refresh_token=... (httpOnly + Secure)          │               │
     │◄───────────────────────────────────────►│                    │               │
     │                    │                    │                    │               │
     │  Redirect zu /dashboard                 │                    │               │
     │◄─────────────────── ───────────────────►│                    │               │
```

### 9.2 KI-Agenten-Flow (Agentische Code-Verbesserung)

```
User Browser         Frontend              Backend            AI Provider         Git/FS
     │                   │                    │                (Ollama/OR)           │
     │  Nachricht senden │                    │                    │                 │
     │  "Fix the bug in  │                    │                    │                 │
     │   auth.py"        │                    │                    │                 │
     │──────────────────►│                    │                    │                 │
     │                   │ POST /chats/{id}   │                    │                 │
     │                   │ /messages          │                    │                 │
     │                   │ {role: user,...}   │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ 1. Message in DB speichern           │
     │                   │                    │ 2. Chat-History laden                │
     │                   │                    │                    │                 │
     │  WS: Connected    │                    │                    │                 │
     │◄──────────────────│                    │                    │                 │
     │                   │                    │ 3. API-Call mit Tools-Definition     │
     │                   │                    │───────────────────►│                 │
     │                   │                    │                    │                 │
     │                   │                    │◄───────────────────│                 │
     │                   │                    │ finish_reason:     │                 │
     │                   │                    │ "tool_calls"       │                 │
     │                   │                    │ [{tool: "read_file"│                 │
     │                   │                    │   args: {path:     │                 │
     │                   │                    │   "src/auth.py"}}] │                 │
     │                   │                    │                    │                 │
     │  WS: tool_call    │                    │                    │                 │
     │  {read_file: ...} │◄───────────────────│                    │                 │
     │◄──────────────────│                    │                    │                 │
     │  [Tool-UI zeigt   │                    │                    │                 │
     │   Tool-Aufruf]    │                    │ 4. Tool ausführen                   │
     │                   │                    │────────────────────────────────────►│
     │                   │                    │◄────────────────────────────────────│
     │                   │                    │ file_content = "..."│                 │
     │                   │                    │                    │                 │
     │  WS: tool_result  │                    │                    │                 │
     │◄──────────────────│◄───────────────────│                    │                 │
     │                   │                    │                    │                 │
     │                   │                    │ 5. Weiter: API-Call mit Tool-Result  │
     │                   │                    │───────────────────►│                 │
     │                   │                    │                    │                 │
     │                   │                    │◄───────────────────│                 │
     │                   │                    │ finish_reason:     │                 │
     │                   │                    │ "tool_calls"       │                 │
     │                   │                    │ [{tool:"write_file"│                 │
     │                   │                    │   args:{path:...,  │                 │
     │                   │                    │   content:...}}]   │                 │
     │                   │                    │                    │                 │
     │  WS: tool_call    │                    │                    │                 │
     │  {write_file: ...}│◄───────────────────│                    │                 │
     │◄──────────────────│                    │                    │                 │
     │                   │                    │ 6. Datei schreiben                  │
     │                   │                    │────────────────────────────────────►│
     │                   │                    │◄────────────────────────────────────│
     │                   │                    │ success            │                 │
     │                   │                    │                    │                 │
     │                   │                    │ 7. Finale Antwort  │                 │
     │                   │                    │───────────────────►│                 │
     │                   │                    │                    │                 │
     │                   │                    │ Streaming Response │                 │
     │  WS: message_chunk│◄───────────────────│◄───────────────────│                 │
     │  "I fixed the ... │◄───────────────────│  (chunk by chunk)  │                 │
     │   by changing ... "│                   │                    │                 │
     │  WS: done         │◄───────────────────│                    │                 │
     │◄──────────────────│                    │                    │                 │
     │                   │                    │ 8. Alle Messages in DB speichern    │
```

### 9.3 Repository-Management Flow (Clone + Edit + Push)

```
User Browser         Frontend              Backend            GitHub API         Filesystem
     │                   │                    │                    │                 │
     │  "Repository      │                    │                    │                 │
     │   hinzufügen"     │                    │                    │                 │
     │──────────────────►│                    │                    │                 │
     │                   │ GET /repos/github  │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ GET /user/repos    │                 │
     │                   │                    │───────────────────►│                 │
     │                   │                    │◄───────────────────│                 │
     │                   │                    │ [{repo1}, {repo2}] │                 │
     │                   │◄───────────────────│                    │                 │
     │ Repo-Liste anzeigen│                   │                    │                 │
     │◄──────────────────│                    │                    │                 │
     │                   │                    │                    │                 │
     │  Repo auswählen   │                    │                    │                 │
     │──────────────────►│                    │                    │                 │
     │                   │ POST /repos        │                    │                 │
     │                   │ {github_repo_id}   │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ Repo in DB anlegen │                 │
     │                   │                    │ Job erstellen      │                 │
     │                   │◄───────────────────│                    │                 │
     │                   │ {job_id, status:   │                    │                 │
     │                   │  "pending"}        │                    │                 │
     │                   │                    │                    │                 │
     │                   │                    │ [Celery Task]      │                 │
     │                   │                    │ git clone          │                 │
     │                   │                    │ --depth=1 <url>    │                 │
     │                   │                    │ /data/repos/{id}   │                 │
     │                   │                    │────────────────────────────────────►│
     │  WS: job progress │                    │◄────────────────────────────────────│
     │◄──────────────────│◄───────────────────│ clone complete     │                 │
     │                   │                    │                    │                 │
     │                   │                    │ Repo: is_cloned=true, local_path=.. │
     │                   │                    │ Job: status=success│                 │
     │                   │                    │                    │                 │
     │  Datei bearbeiten │                    │                    │                 │
     │──────────────────►│                    │                    │                 │
     │                   │ GET /repos/{id}    │                    │                 │
     │                   │ /files/src/main.py │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ fs.readFile(path)  │                 │
     │                   │                    │────────────────────────────────────►│
     │                   │                    │◄────────────────────────────────────│
     │                   │◄───────────────────│                    │                 │
     │ Monaco Editor      │                   │                    │                 │
     │ zeigt Datei        │                   │                    │                 │
     │◄──────────────────│                    │                    │                 │
     │                   │                    │                    │                 │
     │  Speichern        │                    │                    │                 │
     │──────────────────►│                    │                    │                 │
     │                   │ PUT /repos/{id}    │                    │                 │
     │                   │ /files/src/main.py │                    │                 │
     │                   │ {content: "..."}   │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ fs.writeFile(path) │                 │
     │                   │                    │────────────────────────────────────►│
     │                   │                    │◄────────────────────────────────────│
     │                   │◄───────────────────│ {success: true}    │                 │
     │                   │                    │                    │                 │
     │  Commit + Push    │                    │                    │                 │
     │──────────────────►│                    │                    │                 │
     │                   │ POST /repos/{id}   │                    │                 │
     │                   │ /commit            │                    │                 │
     │                   │ {msg: "fix: ..."   │                    │                 │
     │                   │  files: [...]}     │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ git add .          │                 │
     │                   │                    │ git commit -m "..."│                 │
     │                   │                    │────────────────────────────────────►│
     │                   │◄───────────────────│◄────────────────────────────────────│
     │                   │                    │                    │                 │
     │                   │ POST /repos/{id}   │                    │                 │
     │                   │ /push              │                    │                 │
     │                   │───────────────────►│                    │                 │
     │                   │                    │ git push origin    │                 │
     │                   │                    │ (via GitHub Token) │                 │
     │                   │                    │────────────────────────────────────►│
     │                   │                    │                    │◄────────────────│
     │                   │                    │ Push via HTTPS     │                 │
     │                   │                    │───────────────────►│                 │
     │                   │                    │◄───────────────────│                 │
     │                   │                    │ 200 OK             │                 │
     │                   │◄───────────────────│                    │                 │
     │ "Push erfolgreich"│                    │                    │                 │
     │◄──────────────────│                    │                    │                 │
```

### 9.4 Verfügbare Agent-Tools (Tool-Calling Schema)

```
Agent Tools (beim LLM registriert):
┌─────────────────────────────────────────────────────────────────┐
│  read_file(path)             → Dateiinhalt lesen                │
│  write_file(path, content)   → Datei schreiben/überschreiben   │
│  list_files(path)            → Verzeichnis auflisten            │
│  search_in_files(query, ext) → Code-Suche (grep)               │
│  git_diff()                  → Aktuellen Diff anzeigen          │
│  git_log(n)                  → Commit-History anzeigen          │
│  git_status()                → Status anzeigen                  │
│  run_command(cmd)            → Sicherer Befehl (allowlist)      │
│  github_create_issue(title, body) → GitHub Issue erstellen      │
│  github_list_issues()        → GitHub Issues auflisten          │
│  github_get_pr(number)       → Pull Request anzeigen            │
└─────────────────────────────────────────────────────────────────┘
```

---

*Dieses Dokument ist die maßgebliche Architektur-Referenz für alle Implementierungsarbeiten an Maintain@Github.*
*Änderungen an der Architektur müssen in diesem Dokument zuerst dokumentiert werden.*
