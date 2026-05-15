# Komplettes Debugging-System für Maintain@Github

## Übersicht

```mermaid
graph TB
    subgraph "Frontend - React/Vite"
        DP[DebugProvider Context]
        DL[Debug Panel Overlay]
        AX[axios Logger]
        EB2[ErrorBoundary 2.0]
        WL[WebVitals Tracking]
    end

    subgraph "Traefik"
        AL[Access Logs JSON]
        DM[Debug Middleware]
    end

    subgraph "Backend - FastAPI"
        RID[Request ID Middleware]
        SL[Structured Logging]
        GEH[Global Error Handler]
        DBM[Debug Mode: SQL/HTTP/AI]
        MET[/api/metrics Endpoint]
    end

    subgraph "Infrastructure"
        DPORT[Debug Port :5678]
        LD[JSON-File Log Driver]
        PROM[Prometheus Scrape]
    end

    Browser --> AL --> RID --> GEH
    RID --> SL
    GEH --> SL
    DBM --> SL
    MET --> PROM
    SL --> LD
    DP --> DL
    DP --> AX
```

---

## Phase 1: Backend Structured Logging

### Neue Dateien

#### `backend/app/core/logging.py`
- `setup_logging()` Funktion als Ersatz für `logging.basicConfig`
- **JSON-Formatter** für Produktion (`LOG_FORMAT=json`): Maschinenlesbare Logs mit Feldern: `timestamp`, `level`, `logger`, `message`, `request_id`, `user_id`, `client_ip`, `duration_ms`, `module`
- **Colored-Formatter** für Entwicklung (`LOG_FORMAT=console`): Farbige Ausgabe mit `colorlog`
- `ContextFilter`: logging.Filter der `request_id`, `user_id`, `client_ip` aus `contextvars` in jedes Log-Record injectet
- `get_logger(name)`: Wrapper um `logging.getLogger` mit vorkonfiguriertem Adapter
- Log-Level aus `settings.log_level` (DEBUG, INFO, WARNING, ERROR)

#### `backend/app/core/request_id.py`
- `RequestIDMiddleware`: Starlette BaseHTTPMiddleware
  - Generiert `uuid4()` pro Request
  - Speichert in `request.state.request_id`
  - Setzt `X-Request-ID` Response-Header
  - Setzt `request_id` contextvar für Logging
  - Extrahiert `user_id` aus authenticated request für Logging
  - Extrahiert `client_ip` aus `X-Forwarded-For` oder `request.client.host`

### Zu modifizierende Dateien

#### `backend/main.py`
- `setup_logging()` aufrufen **vor** App-Erstellung (ersetzt `logging.basicConfig`)
- `RequestIDMiddleware` als erste Middleware hinzufügen
- `RequestLoggingMiddleware` um request_id erweitern

#### `backend/app/core/middleware.py`
- `RequestLoggingMiddleware.dispatch()` erweitern:
  - `request_id` aus `request.state.request_id` in Log-Message aufnehmen
  - `user_id` aus `request.state` (falls authenticated)
  - Format: `[rid] method path → status (duration_ms)`

#### `backend/app/core/config.py`
- Neue Settings:
  - `log_level: str = "INFO"`
  - `log_format: str = "console"` (console / json)

---

## Phase 2: Backend Error Handling

### Neue Dateien

#### `backend/app/core/error_handlers.py`
- `register_error_handlers(app: FastAPI)` registriert Exception-Handler:
  - **`HTTPException`**: Strukturierte JSON-Response mit `error`, `detail`, `request_id`
  - **`RequestValidationError`** (Pydantic): Field-level errors + request_id
  - **`WebSocketException`**: Schließen mit Code + Reason
  - **`Exception`** (Fallback): 
    - Produktion: `{"error": "Internal server error", "request_id": "..."}`
    - Debug: Zusätzlich `traceback` im Response
  - Alle Handler loggen den vollen Fehler (mit Traceback) via `logger.exception()`

### Zu modifizierende Dateien

#### `backend/main.py`
- `register_error_handlers(app)` nach Router-Registrierung aufrufen

---

## Phase 3: Backend Debug Mode

### Neue Dateien

#### `backend/app/core/debug.py`
- `DebugContext` Klasse:
  - `is_debug()`: Prüft `settings.debug`
  - `log_query(query, params)`: SQL-Query-Logging mit Parametern
  - `log_http_request(method, url, headers, body)`: Outbound-HTTP-Logging
  - `log_http_response(status, duration, body)`: Response-Logging
- `@timed(name)` Decorator: Misst Funktions-Ausführungszeit, loggt bei DEBUG

### Zu modifizierende Dateien

#### `backend/app/db/base.py`
- `get_db()` Session-Factory: `echo=settings.debug` für SQLAlchemy Query-Logging

#### `backend/app/services/ai/ai_service.py`
- `chat_ollama()` / `chat_openrouter()`: Debug-Logging für:
  - Modell-Name, Message-Anzahl, Tool-Anzahl
  - Request-Dauer
  - Response-Größe (Token/Chars)
- `stream_ollama()` / `stream_openrouter()`: Chunk-Anzahl + Dauer loggen
- `list_ollama_models()` / `list_openrouter_models()`: Fehler-Details im Debug-Mode

#### `backend/app/services/ai/agent_runner.py`
- `run()`: Jede Iteration loggen (Iteration X/15, Tool-Calls, Tool-Results-Länge)
- `_parse_response()`: Raw-Response-Struktur im Debug-Mode inspizieren

#### `backend/app/services/git/git_service.py`
- `GIT_PYTHON_TRACE=full` setzen wenn `settings.debug`
- Clone/Pull/Commit-Dauer messen und loggen
- Fehler mit vollständigem Git-Output loggen

---

## Phase 4: Backend Metrics

### Neue Dateien

#### `backend/app/core/metrics.py`
- Prometheus-Metriken (alle mit `maintain_` Präfix):
  - `http_requests_total` (Counter): Labels: `method`, `endpoint`, `status_code`
  - `http_request_duration_seconds` (Histogram): Labels: `method`, `endpoint`
  - `http_requests_in_flight` (Gauge)
  - `ai_service_calls_total` (Counter): Labels: `provider`, `model`, `status`
  - `ai_service_duration_seconds` (Histogram): Labels: `provider`, `model`
  - `websocket_connections_active` (Gauge)
  - `git_operations_total` (Counter): Labels: `operation` (clone/pull/commit/push)
  - `git_operation_duration_seconds` (Histogram)
- `MetricsMiddleware`: Starlette BaseHTTPMiddleware zum Tracken von Requests
- `/api/metrics` Endpoint (nur für authentifizierte User oder `METRICS_ENABLED`)

### Zu modifizierende Dateien

#### `backend/main.py`
- `/api/metrics` Router registrieren
- `MetricsMiddleware` hinzufügen (nach RequestID, vor RateLimit)

#### `backend/requirements.txt`
- `prometheus-client>=0.20.0` hinzufügen

#### `backend/app/core/config.py`
- `metrics_enabled: bool = True`

---

## Phase 5: Frontend Debugging

### Neue Dateien

#### `frontend/src/components/common/DebugProvider.tsx`
- React Context: `DebugContext`
  - `isDebug: boolean` — geschaltet via `?debug=true` Query-Param oder `localStorage`
  - `logs: DebugLog[]` — In-Memory Log-Buffer (max 500 Einträge)
  - `addLog(level, module, message, data?)`
  - `clearLogs()`
  - `toggleDebug()`
- `useDebug()` Hook exportieren

#### `frontend/src/components/common/DebugPanel.tsx`
- Nur sichtbar wenn `isDebug === true`
- Tabs: **Logs** | **Network** | **Performance** | **State**
- **Logs-Tab**: Gefilterte Log-Ausgabe (Level-Filter: DEBUG/INFO/WARN/ERROR), Modul-Filter, Auto-Scroll
- **Network-Tab**: API-Calls mit Method, URL, Status, Dauer, Request/Response-Body (truncated)
- **Performance-Tab**: WebVitals (LCP, FID, CLS), Komponenten-Render-Zeiten
- **State-Tab**: Auth-Store, Repo-Store Snapshots
- Minimierbar, repositionierbar (unten-rechts fixiert)

#### `frontend/src/utils/logger.ts`
- `createLogger(module: string)` → `{ debug, info, warn, error }`
- Jeder Call erzeugt `DebugLog` Eintrag und pushed in DebugContext (wenn verfügbar)
- `console.debug/info/warn/error` parallel
- Timestamp, Modul-Name, optional data-Payload

### Zu modifizierende Dateien

#### `frontend/src/App.tsx`
- `<DebugProvider>` um die gesamte App wrappen
- `<DebugPanel />` am Ende rendern

#### `frontend/src/api/client.ts`
- Request-Interceptor: Log `method`, `url`, `headers`, `body` via `createLogger('api')`
- Response-Interceptor: Log `status`, `duration`, `data` preview
- Nur aktiv wenn `isDebug`

#### `frontend/src/components/common/ErrorBoundary.tsx`
- `ErrorInfo.componentStack` anzeigen (nicht nur `error.message`)
- "Copy Error Details" Button (JSON mit message, stack, componentStack in Clipboard)
- Log via `createLogger('error-boundary')`
- Optional: Error-Report an Backend senden (`POST /api/debug/errors`)

#### `frontend/src/hooks/useWebSocket.ts`
- Connection-State-Logging: `connecting → connected → disconnected`
- Reconnect-Attempts zählen und loggen
- Message-Count tracken

---

## Phase 6: Infrastruktur

### Zu modifizierende Dateien

#### `traefik/traefik.yml`
- Access Logs aktivieren:
```yaml
accessLog:
  format: json
  filePath: "/var/log/traefik/access.log"
  filters:
    statusCodes: ["200-299", "300-399", "400-499", "500-599"]
```

#### `traefik/dynamic/middlewares.yml`
- `debug-headers` Middleware:
```yaml
http:
  middlewares:
    debug-headers:
      headers:
        customResponseHeaders:
          X-Debug-Mode: "true"
        customRequestHeaders:
          X-Forwarded-By: "traefik"
```

#### `docker-compose.dev.yml`
- Backend-Service:
  - `DEBUG=true` Umgebungsvariable
  - `LOG_LEVEL=DEBUG`
  - `LOG_FORMAT=console`
  - Port `5678:5678` (debugpy)
  - Volume-Mount: `./backend:/app` (für Hot-Reload)
  - Command: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` (statt ohne --reload)
- Worker-Service:
  - `DEBUG=true`, `LOG_LEVEL=DEBUG`
  - `celery -A app.core.celery_app worker --loglevel=debug`
- Traefik:
  - Volume-Mount für Access-Logs: `./logs/traefik:/var/log/traefik`

#### `docker-compose.yml` (Produktion)
- Log-Driver für alle Services:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
    labels: "maintain.service"
```

#### `docker-compose.minimal.yml`
- Gleiche Log-Driver-Konfiguration wie Produktion

#### `backend/Dockerfile`
- `ARG DEBUG=false`
- `RUN if [ "$DEBUG" = "true" ]; then pip install debugpy; fi`
- `CMD`: Wenn `DEBUG=true` → `python -m debugpy --listen 0.0.0.0:5678 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload`, sonst wie bisher

---

## Phase 7: Makefile & Dev-Experience

### Zu modifizierende Dateien

#### `Makefile`
Neue Targets:

```makefile
# Debug Mode
dev-debug:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Debugger available on port 5678"
	@echo "Attach with VS Code: F5 → 'Python: Remote Attach'"

dev-debug-build:
	docker compose -f docker-compose.dev.yml up -d --build
	@echo "Debugger available on port 5678"

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

# Database
db-query-log-on:
	docker compose -f docker-compose.dev.yml exec postgres psql -U maintain -d maintain_github -c "ALTER SYSTEM SET log_statement = 'all'; SELECT pg_reload_conf();"

db-query-log-off:
	docker compose -f docker-compose.dev.yml exec postgres psql -U maintain -d maintain_github -c "ALTER SYSTEM SET log_statement = 'none'; SELECT pg_reload_conf();"

# Metrics
metrics:
	@echo "Prometheus metrics:"
	@curl -s http://localhost:8000/api/metrics | head -30

# Debug Attach Helper
debug-attach:
	@echo "Add this to your VS Code launch.json:"
	@echo '{'
	@echo '  "name": "Python: Remote Attach",'
	@echo '  "type": "debugpy",'
	@echo '  "request": "attach",'
	@echo '  "connect": { "host": "localhost", "port": 5678 },'
	@echo '  "pathMappings": [{ "localRoot": "$${workspaceFolder}/backend", "remoteRoot": "/app" }]'
	@echo '}'
```

---

## VS Code Launch-Konfiguration

### `.vscode/launch.json` (neu)
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Remote Attach (Backend)",
      "type": "debugpy",
      "request": "attach",
      "connect": { "host": "localhost", "port": 5678 },
      "pathMappings": [
        { "localRoot": "${workspaceFolder}/backend", "remoteRoot": "/app" }
      ],
      "justMyCode": false
    },
    {
      "name": "Chrome: Frontend Debug",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/frontend/src",
      "sourceMapPathOverrides": {
        "webpack:///./src/*": "${webRoot}/*"
      }
    }
  ]
}
```

---

## Abhängigkeiten (Neu)

| Paket | Version | Zweck |
|-------|---------|-------|
| `prometheus-client` | >=0.20.0 | Metriken (Backend) |
| `colorlog` | >=6.8.0 | Farbiges Console-Logging (Backend Dev) |
| `debugpy` | >=1.8.0 | Remote Debugging (Backend Dev, optional) |

---

## Datei-Änderungen Zusammenfassung

| Aktion | Datei |
|--------|-------|
| **NEU** | `backend/app/core/logging.py` |
| **NEU** | `backend/app/core/request_id.py` |
| **NEU** | `backend/app/core/error_handlers.py` |
| **NEU** | `backend/app/core/debug.py` |
| **NEU** | `backend/app/core/metrics.py` |
| **NEU** | `frontend/src/components/common/DebugProvider.tsx` |
| **NEU** | `frontend/src/components/common/DebugPanel.tsx` |
| **NEU** | `frontend/src/utils/logger.ts` |
| **NEU** | `.vscode/launch.json` |
| **MODIFY** | `backend/main.py` |
| **MODIFY** | `backend/app/core/config.py` |
| **MODIFY** | `backend/app/core/middleware.py` |
| **MODIFY** | `backend/app/db/base.py` |
| **MODIFY** | `backend/app/services/ai/ai_service.py` |
| **MODIFY** | `backend/app/services/ai/agent_runner.py` |
| **MODIFY** | `backend/app/services/git/git_service.py` |
| **MODIFY** | `backend/requirements.txt` |
| **MODIFY** | `backend/Dockerfile` |
| **MODIFY** | `frontend/src/App.tsx` |
| **MODIFY** | `frontend/src/api/client.ts` |
| **MODIFY** | `frontend/src/components/common/ErrorBoundary.tsx` |
| **MODIFY** | `frontend/src/hooks/useWebSocket.ts` |
| **MODIFY** | `traefik/traefik.yml` |
| **MODIFY** | `traefik/dynamic/middlewares.yml` |
| **MODIFY** | `docker-compose.yml` |
| **MODIFY** | `docker-compose.dev.yml` |
| **MODIFY** | `docker-compose.minimal.yml` |
| **MODIFY** | `Makefile` |
