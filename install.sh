#!/usr/bin/env bash
# =============================================================================
# Maintain@Github – Interactive Setup Wizard
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Redirect stdin from /dev/tty so interactive prompts work even when the
# script is piped in via:  curl -fsSL .../install.sh | bash
# ---------------------------------------------------------------------------
exec < /dev/tty

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
BOLD=$'\033[1m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
RED=$'\033[0;31m'
RESET=$'\033[0m'

info()    { echo -e "${CYAN}ℹ  $*${RESET}"; }
success() { echo -e "${GREEN}✔  $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠  $*${RESET}"; }
error()   { echo -e "${RED}✖  $*${RESET}" >&2; exit 1; }
title()   { echo -e "\n${BOLD}${CYAN}$*${RESET}"; echo "$(printf '─%.0s' {1..60})"; }

# Ask a question; second arg is the default value (shown in brackets)
ask() {
    local prompt="$1"
    local default="${2:-}"
    local var_name="$3"
    local answer

    if [[ -n "$default" ]]; then
        echo -en "  ${BOLD}${prompt}${RESET} [${default}]: "
    else
        echo -en "  ${BOLD}${prompt}${RESET}: "
    fi

    read -r answer
    if [[ -z "$answer" && -n "$default" ]]; then
        answer="$default"
    fi
    # Store in the caller's variable
    printf -v "$var_name" '%s' "$answer"
}

# Ask for a secret (no echo)
ask_secret() {
    local prompt="$1"
    local var_name="$2"
    local answer

    echo -en "  ${BOLD}${prompt}${RESET} (hidden): "
    read -rs answer
    echo
    printf -v "$var_name" '%s' "$answer"
}

# Yes/No question; returns 0 for yes, 1 for no
ask_yn() {
    local prompt="$1"
    local default="${2:-y}"   # "y" or "n"
    local answer

    if [[ "$default" == "y" ]]; then
        echo -en "  ${BOLD}${prompt}${RESET} [Y/n]: "
    else
        echo -en "  ${BOLD}${prompt}${RESET} [y/N]: "
    fi

    read -r answer
    answer="${answer:-$default}"
    [[ "${answer,,}" == "y" ]]
}

gen_secret() {
    # 32 random hex bytes → 64-char string
    openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))"
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}"
cat << 'EOF'
  __  __       _       _        _          ____  _ _   _           _
 |  \/  | __ _(_)_ __ | |_ __ _(_)_ __    / ___(_) |_| |__  _   _| |__
 | |\/| |/ _` | | '_ \| __/ _` | | '_ \  | |  _| | __| '_ \| | | | '_ \
 | |  | | (_| | | | | | || (_| | | | | | | |_| | | |_| | | | |_| | |_) |
 |_|  |_|\__,_|_|_| |_|\__\__,_|_|_| |_|  \____|_|\__|_| |_|\__,_|_.__/

EOF
echo -e "${RESET}${CYAN}  Interactive Setup Wizard${RESET}\n"

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
title "1/5  Checking Prerequisites"

command -v docker &>/dev/null        || error "Docker is not installed. Please install Docker first."
docker compose version &>/dev/null   || error "Docker Compose v2 is required. 'docker compose' not found."
command -v curl &>/dev/null          || error "'curl' is required but not installed."
command -v openssl &>/dev/null       || warn "openssl not found – will use Python for secret generation."

success "All prerequisites satisfied."

# ---------------------------------------------------------------------------
# 2. Setup type
# ---------------------------------------------------------------------------
title "2/5  Choose Setup Type"

echo "  ${BOLD}(F) Full${RESET}    – includes PostgreSQL, Redis, Ollama & Traefik reverse proxy"
echo "         → suitable for a public server / VPS with a real domain"
echo ""
echo "  ${BOLD}(M) Minimal${RESET} – only backend + frontend + Redis"
echo "         → you supply an external PostgreSQL and/or Ollama"
echo "         → perfect for local dev or Cloudflare Tunnel setups"
echo ""

SETUP_TYPE=""
while [[ ! "$SETUP_TYPE" =~ ^[FfMm]$ ]]; do
    echo -en "  ${BOLD}Your choice${RESET} (F/M): "
    read -r SETUP_TYPE
done

if [[ "$SETUP_TYPE" =~ ^[Ff]$ ]]; then
    MODE="full"
    COMPOSE_FILE="docker-compose.yml"
    info "Full setup selected."
else
    MODE="minimal"
    COMPOSE_FILE="docker-compose.minimal.yml"
    info "Minimal setup selected."
fi

# ---------------------------------------------------------------------------
# 3. Collect configuration
# ---------------------------------------------------------------------------
title "3/5  Configuration"

# ── App secrets (auto-generated, user can override) ─────────────────────────
APP_SECRET_KEY_GEN=$(gen_secret)
JWT_SECRET_KEY_GEN=$(gen_secret)

info "Generating random secrets for APP_SECRET_KEY and JWT_SECRET_KEY..."
info "You can accept the generated values (press Enter) or paste your own.\n"

ask "APP_SECRET_KEY" "$APP_SECRET_KEY_GEN" APP_SECRET_KEY
ask "JWT_SECRET_KEY" "$JWT_SECRET_KEY_GEN" JWT_SECRET_KEY

# ── Domain / Traefik (full only) ────────────────────────────────────────────
if [[ "$MODE" == "full" ]]; then
    echo ""
    info "Traefik needs your public domain and an e-mail for Let's Encrypt."
    ask "Your public domain (e.g. maintain.example.com)" "" DOMAIN
    ask "E-mail for Let's Encrypt / Traefik" "admin@${DOMAIN}" TRAEFIK_EMAIL

    echo ""
    warn "Traefik dashboard basic auth (htpasswd format: user:\$\$apr1\$\$...)"
    warn "Generate with:  htpasswd -nb admin yourpassword"
    warn "Leave empty to disable the dashboard."
    ask "TRAEFIK_DASHBOARD_AUTH" "admin:\$\$apr1\$\$disabled" TRAEFIK_DASHBOARD_AUTH

    ALLOWED_ORIGINS="https://${DOMAIN}"
    GITHUB_REDIRECT_URI="https://${DOMAIN}/auth/github/callback"
    BACKEND_PORT=""
    FRONTEND_PORT=""
else
    # Minimal: domain is for display / OAuth callback only
    DOMAIN="localhost"
    TRAEFIK_EMAIL=""
    TRAEFIK_DASHBOARD_AUTH=""

    echo ""
    ask "Backend port" "8000" BACKEND_PORT
    ask "Frontend port" "3000" FRONTEND_PORT
    ALLOWED_ORIGINS="http://localhost:${FRONTEND_PORT}"
    GITHUB_REDIRECT_URI="http://localhost:${BACKEND_PORT}/auth/github/callback"
fi

# ── GitHub OAuth ─────────────────────────────────────────────────────────────
echo ""
info "GitHub OAuth credentials"
info "Create an OAuth App at: https://github.com/settings/applications/new"
info "Set callback URL to:    ${GITHUB_REDIRECT_URI}"
echo ""
ask "GitHub Client ID"     "" GITHUB_CLIENT_ID
ask_secret "GitHub Client Secret" GITHUB_CLIENT_SECRET

# ── Database ──────────────────────────────────────────────────────────────────
echo ""
if [[ "$MODE" == "full" ]]; then
    info "PostgreSQL runs as a Docker container."
    ask "PostgreSQL database name" "maintain_github" POSTGRES_DB
    ask "PostgreSQL user"          "maintain"        POSTGRES_USER
    ask_secret "PostgreSQL password (choose a strong one)" POSTGRES_PASSWORD
    POSTGRES_HOST="postgres"
    POSTGRES_PORT="5432"
    REDIS_URL="redis://redis:6379/0"
else
    info "Minimal setup: provide your external PostgreSQL connection."
    ask "PostgreSQL host (use 'host.docker.internal' for localhost)" "host.docker.internal" POSTGRES_HOST
    ask "PostgreSQL port"          "5432"            POSTGRES_PORT
    ask "PostgreSQL database name" "maintain_github" POSTGRES_DB
    ask "PostgreSQL user"          "maintain"        POSTGRES_USER
    ask_secret "PostgreSQL password" POSTGRES_PASSWORD
    REDIS_URL="redis://redis:6379/0"
fi

# ── AI provider ───────────────────────────────────────────────────────────────
echo ""
title "   AI Provider"
echo "  ${BOLD}(O) OpenRouter${RESET}  – cloud AI via https://openrouter.ai (requires API key)"
echo "  ${BOLD}(L) Ollama${RESET}      – local LLM (self-hosted)"
echo "  ${BOLD}(B) Both${RESET}        – configure both"
echo ""

AI_CHOICE=""
while [[ ! "$AI_CHOICE" =~ ^[OoLlBb]$ ]]; do
    echo -en "  ${BOLD}Your choice${RESET} (O/L/B): "
    read -r AI_CHOICE
done

OPENROUTER_API_KEY=""
OLLAMA_BASE_URL=""

if [[ "$AI_CHOICE" =~ ^[OoBb]$ ]]; then
    ask_secret "OpenRouter API Key" OPENROUTER_API_KEY
fi

if [[ "$AI_CHOICE" =~ ^[LlBb]$ ]]; then
    if [[ "$MODE" == "full" ]]; then
        OLLAMA_BASE_URL="http://ollama:11434"
        info "Ollama will run as a container; base URL set to ${OLLAMA_BASE_URL}"
    else
        ask "Ollama base URL" "http://host.docker.internal:11434" OLLAMA_BASE_URL
    fi
fi

# ── Storage ───────────────────────────────────────────────────────────────────
echo ""
ask "Repository storage path inside container" "/app/repos" REPOS_STORAGE_PATH

if [[ "$MODE" == "full" ]]; then
    ask "Max repository size (MB)" "500" MAX_REPO_SIZE_MB
else
    MAX_REPO_SIZE_MB="500"
fi

# ── JWT settings (sane defaults) ──────────────────────────────────────────────
JWT_ALGORITHM="HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES="60"
JWT_REFRESH_TOKEN_EXPIRE_DAYS="30"
RATE_LIMIT_PER_MINUTE="60"

# ---------------------------------------------------------------------------
# 4. Write .env
# ---------------------------------------------------------------------------
title "4/5  Writing .env"

if [[ -f .env ]]; then
    if ask_yn ".env already exists – overwrite it?" "n"; then
        cp .env ".env.backup.$(date +%Y%m%d_%H%M%S)"
        warn "Existing .env backed up."
    else
        error "Aborted – .env left unchanged."
    fi
fi

cat > .env << ENVEOF
# =============================================================================
# Maintain@Github – generated by install.sh on $(date)
# Setup mode: ${MODE}
# =============================================================================

# --- App ---
APP_SECRET_KEY=${APP_SECRET_KEY}
DEBUG=false

# --- Domain ---
DOMAIN=${DOMAIN}
ENVEOF

if [[ "$MODE" == "full" ]]; then
cat >> .env << ENVEOF

# --- Traefik ---
TRAEFIK_EMAIL=${TRAEFIK_EMAIL}
TRAEFIK_DASHBOARD_AUTH=${TRAEFIK_DASHBOARD_AUTH}
ENVEOF
fi

cat >> .env << ENVEOF

# --- GitHub OAuth ---
# App created at: https://github.com/settings/applications/new
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_REDIRECT_URI=${GITHUB_REDIRECT_URI}

# --- PostgreSQL ---
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# --- Redis ---
REDIS_URL=${REDIS_URL}

# --- JWT ---
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_ALGORITHM=${JWT_ALGORITHM}
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=${JWT_ACCESS_TOKEN_EXPIRE_MINUTES}
JWT_REFRESH_TOKEN_EXPIRE_DAYS=${JWT_REFRESH_TOKEN_EXPIRE_DAYS}

# --- AI ---
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
OLLAMA_BASE_URL=${OLLAMA_BASE_URL}

# --- File Storage ---
REPOS_STORAGE_PATH=${REPOS_STORAGE_PATH}
MAX_REPO_SIZE_MB=${MAX_REPO_SIZE_MB}

# --- Security ---
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
RATE_LIMIT_PER_MINUTE=${RATE_LIMIT_PER_MINUTE}
ENVEOF

if [[ "$MODE" == "minimal" ]]; then
cat >> .env << ENVEOF

# --- Ports (minimal setup) ---
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
ENVEOF
fi

success ".env written successfully."

# ---------------------------------------------------------------------------
# 5. Download docker-compose & traefik config
# ---------------------------------------------------------------------------
title "5/5  Downloading docker-compose & config files"

REPO_OWNER="MovingLlama"
REPO_NAME="Maintain-Github"
BASE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main"

info "Fetching ${COMPOSE_FILE}..."
curl -fsSL "${BASE_URL}/${COMPOSE_FILE}" -o "${COMPOSE_FILE}"
success "${COMPOSE_FILE} downloaded."

if [[ "$MODE" == "full" ]]; then
    mkdir -p traefik/dynamic
    info "Fetching traefik configuration..."
    curl -fsSL "${BASE_URL}/traefik/traefik.yml"                  -o traefik/traefik.yml
    curl -fsSL "${BASE_URL}/traefik/dynamic/middlewares.yml"       -o traefik/dynamic/middlewares.yml
    success "Traefik config downloaded."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Setup complete!${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Files created / updated:"
echo -e "    ${CYAN}.env${RESET}                  ← your configuration"
echo -e "    ${CYAN}${COMPOSE_FILE}${RESET}"
if [[ "$MODE" == "full" ]]; then
echo -e "    ${CYAN}traefik/traefik.yml${RESET}"
echo -e "    ${CYAN}traefik/dynamic/middlewares.yml${RESET}"
fi
echo ""
echo -e "  ${BOLD}Review your .env before starting:${RESET}"
echo -e "    ${YELLOW}nano .env${RESET}"
echo ""

if [[ "$MODE" == "full" ]]; then
echo -e "  ${BOLD}Start the full stack:${RESET}"
echo -e "    ${YELLOW}docker compose up -d${RESET}"
echo ""
echo -e "  ${BOLD}Access the app:${RESET}"
echo -e "    https://${DOMAIN}"
else
echo -e "  ${BOLD}Start the minimal stack:${RESET}"
echo -e "    ${YELLOW}docker compose -f docker-compose.minimal.yml up -d${RESET}"
echo ""
echo -e "  ${BOLD}Access the app:${RESET}"
echo -e "    Frontend:  http://localhost:${FRONTEND_PORT}"
echo -e "    Backend:   http://localhost:${BACKEND_PORT}"
fi

echo ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo -e "    View logs:   ${YELLOW}docker compose -f ${COMPOSE_FILE} logs -f${RESET}"
echo -e "    Stop:        ${YELLOW}docker compose -f ${COMPOSE_FILE} down${RESET}"
echo ""
