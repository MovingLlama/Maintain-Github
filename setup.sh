#!/usr/bin/env bash
# shellcheck disable=SC2129,SC2016
# =============================================================================
# Maintain@Github - Interactive Setup Script
#
# This script guides you through the configuration of Maintain@Github.
# It generates a .env file and a docker-compose.generated.yml tailored to
# your infrastructure choices (local/external PostgreSQL, Traefik, Ollama, etc.)
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================

set -euo pipefail

# --- Colors & Helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

print_header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

print_section() {
  echo ""
  echo -e "${YELLOW}── $1 ──${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
  echo -e "${CYAN}ℹ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

ask_yes_no() {
  local prompt="$1"
  local default="${2:-y}"
  local yn_hint
  if [ "$default" = "y" ]; then
    yn_hint="[Y/n]"
  else
    yn_hint="[y/N]"
  fi

  while true; do
    read -rp "$(echo -e "${BOLD}$prompt${NC} $yn_hint: ")" answer
    answer="${answer:-$default}"
    case "$answer" in
      [Yy]* ) return 0 ;;
      [Nn]* ) return 1 ;;
      * ) echo "Please answer y or n." ;;
    esac
  done
}

ask_input() {
  local prompt="$1"
  local default="${2:-}"
  local result

  if [ -n "$default" ]; then
    read -rp "$(echo -e "${BOLD}$prompt${NC} [${default}]: ")" result
    echo "${result:-$default}"
  else
    read -rp "$(echo -e "${BOLD}$prompt${NC}: ")" result
    echo "$result"
  fi
}

ask_input_secret() {
  local prompt="$1"
  local default="${2:-}"
  local result

  if [ -n "$default" ]; then
    read -srp "$(echo -e "${BOLD}$prompt${NC} [****]: ")" result
    echo ""
    echo "${result:-$default}"
  else
    read -srp "$(echo -e "${BOLD}$prompt${NC}: ")" result
    echo ""
    echo "$result"
  fi
}

generate_secret() {
  openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | tr -dc 'a-f0-9' | head -c 64
}

generate_password() {
  openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | tr -dc 'a-f0-9' | head -c 32
}

# =============================================================================
# MAIN SCRIPT
# =============================================================================

# Check prerequisites
for cmd in docker openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    print_error "'$cmd' is required but not installed. Please install it first."
    exit 1
  fi
done

print_header "Maintain@Github - Interactive Setup"

echo -e "This script will guide you through the setup of Maintain@Github."
echo -e "It will generate a ${BOLD}.env${NC} file and a ${BOLD}docker-compose.generated.yml${NC}"
echo -e "based on your infrastructure choices."
echo ""

if [ -f .env ]; then
  print_warning "An existing .env file was found."
  if ! ask_yes_no "Do you want to overwrite it?" "n"; then
    echo "Setup cancelled. Your existing .env was not modified."
    exit 0
  fi
fi

# =============================================================================
# SECTION 1: Infrastructure Choices
# =============================================================================

print_section "Infrastructure Choices"

# --- Traefik ---
USE_TRAEFIK=false
if ask_yes_no "Do you want to use Traefik as reverse proxy (HTTPS with Let's Encrypt)?" "n"; then
  USE_TRAEFIK=true
  print_info "Traefik will be included for automatic HTTPS."
else
  print_info "No Traefik. You can use Cloudflare Tunnel or your own reverse proxy."
fi

# --- PostgreSQL ---
USE_LOCAL_POSTGRES=true
if ask_yes_no "Do you want to run a NEW local PostgreSQL in Docker?" "y"; then
  USE_LOCAL_POSTGRES=true
  print_info "A PostgreSQL container will be included."
else
  USE_LOCAL_POSTGRES=false
  print_info "You will connect to an existing PostgreSQL instance."
fi

# --- Ollama ---
USE_LOCAL_OLLAMA=true
if ask_yes_no "Do you want to run a local Ollama instance in Docker?" "y"; then
  USE_LOCAL_OLLAMA=true
  print_info "An Ollama container will be included."
else
  USE_LOCAL_OLLAMA=false
  print_info "You will connect to an external Ollama instance (or skip it)."
fi

# --- GPU ---
USE_GPU=false
if [ "$USE_LOCAL_OLLAMA" = true ]; then
  if ask_yes_no "Do you have an NVIDIA GPU and want to enable GPU support for Ollama?" "n"; then
    USE_GPU=true
    print_info "GPU support will be enabled for Ollama."
  fi
fi

# =============================================================================
# SECTION 2: Domain & Traefik Configuration
# =============================================================================

DOMAIN="localhost"
TRAEFIK_EMAIL=""
TRAEFIK_DASHBOARD_AUTH=""

if [ "$USE_TRAEFIK" = true ]; then
  print_section "Domain & Traefik Configuration"

  DOMAIN=$(ask_input "Enter your domain (e.g. maintain.example.com)" "")
  while [ -z "$DOMAIN" ]; do
    print_warning "Domain is required when using Traefik."
    DOMAIN=$(ask_input "Enter your domain (e.g. maintain.example.com)" "")
  done

  TRAEFIK_EMAIL=$(ask_input "Enter your email for Let's Encrypt certificates" "")
  while [ -z "$TRAEFIK_EMAIL" ]; do
    print_warning "Email is required for Let's Encrypt."
    TRAEFIK_EMAIL=$(ask_input "Enter your email for Let's Encrypt certificates" "")
  done

  if ask_yes_no "Do you want to protect the Traefik dashboard with basic auth?" "y"; then
    echo -e "  Generate credentials with: ${CYAN}htpasswd -nb admin yourpassword${NC}"
    TRAEFIK_DASHBOARD_AUTH=$(ask_input "Enter htpasswd string (or leave empty to skip)" "")
  fi
else
  print_section "Domain Configuration"
  DOMAIN=$(ask_input "Enter your domain or hostname" "localhost")
fi

# =============================================================================
# SECTION 3: GitHub OAuth
# =============================================================================

print_section "GitHub OAuth Configuration"

echo -e "  Create a GitHub OAuth App at: ${CYAN}https://github.com/settings/developers${NC}"
if [ "$USE_TRAEFIK" = true ]; then
  echo -e "  Set the callback URL to: ${CYAN}https://${DOMAIN}/auth/github/callback${NC}"
else
  echo -e "  Set the callback URL to: ${CYAN}http://${DOMAIN}:8000/auth/github/callback${NC}"
fi
echo ""

GITHUB_CLIENT_ID=$(ask_input "GitHub OAuth Client ID" "")
GITHUB_CLIENT_SECRET=$(ask_input_secret "GitHub OAuth Client Secret" "")

if [ "$USE_TRAEFIK" = true ]; then
  GITHUB_REDIRECT_URI="https://${DOMAIN}/auth/github/callback"
else
  GITHUB_REDIRECT_URI=$(ask_input "GitHub OAuth Redirect URI" "http://${DOMAIN}:8000/auth/github/callback")
fi

# =============================================================================
# SECTION 4: PostgreSQL Configuration
# =============================================================================

print_section "PostgreSQL Configuration"

POSTGRES_DB="maintain_github"
POSTGRES_USER="maintain"
POSTGRES_PASSWORD=""
POSTGRES_HOST=""
POSTGRES_PORT="5432"

if [ "$USE_LOCAL_POSTGRES" = true ]; then
  POSTGRES_HOST="postgres"
  POSTGRES_DB=$(ask_input "Database name" "maintain_github")
  POSTGRES_USER=$(ask_input "Database user" "maintain")
  POSTGRES_PASSWORD=$(generate_password)
  print_success "Generated a secure password for PostgreSQL."
  echo -e "  Password: ${CYAN}${POSTGRES_PASSWORD}${NC}"
  echo -e "  (This is stored in .env - no need to remember it)"
else
  POSTGRES_HOST=$(ask_input "PostgreSQL host" "host.docker.internal")
  POSTGRES_PORT=$(ask_input "PostgreSQL port" "5432")
  POSTGRES_DB=$(ask_input "Database name" "maintain_github")
  POSTGRES_USER=$(ask_input "Database user" "maintain")
  POSTGRES_PASSWORD=$(ask_input_secret "Database password" "")
  while [ -z "$POSTGRES_PASSWORD" ]; do
    print_warning "Password is required."
    POSTGRES_PASSWORD=$(ask_input_secret "Database password" "")
  done
fi

# =============================================================================
# SECTION 5: Ollama Configuration
# =============================================================================

print_section "Ollama Configuration"

OLLAMA_BASE_URL=""

if [ "$USE_LOCAL_OLLAMA" = true ]; then
  OLLAMA_BASE_URL="http://ollama:11434"
  print_info "Ollama will be available at ${OLLAMA_BASE_URL} (internal Docker network)."
else
  OLLAMA_BASE_URL=$(ask_input "Ollama base URL" "http://host.docker.internal:11434")
fi

# =============================================================================
# SECTION 6: OpenRouter API (optional)
# =============================================================================

print_section "OpenRouter AI (optional)"

OPENROUTER_API_KEY=""
echo -e "  OpenRouter provides access to cloud AI models (GPT-4, Claude, etc.)"
echo -e "  Get an API key at: ${CYAN}https://openrouter.ai/keys${NC}"
echo ""

if ask_yes_no "Do you want to configure an OpenRouter API key?" "n"; then
  OPENROUTER_API_KEY=$(ask_input_secret "OpenRouter API Key" "")
fi

# =============================================================================
# SECTION 7: Security & Secrets (auto-generated)
# =============================================================================

print_section "Security & Secrets"

APP_SECRET_KEY=$(generate_secret)
JWT_SECRET_KEY=$(generate_secret)

print_success "Generated APP_SECRET_KEY"
print_success "Generated JWT_SECRET_KEY"

JWT_ALGORITHM="HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=$(ask_input "JWT access token expiry (minutes)" "60")
JWT_REFRESH_TOKEN_EXPIRE_DAYS=$(ask_input "JWT refresh token expiry (days)" "30")

# =============================================================================
# SECTION 8: Additional Settings
# =============================================================================

print_section "Additional Settings"

REPOS_STORAGE_PATH="/app/repos"
RATE_LIMIT_PER_MINUTE=$(ask_input "Rate limit per minute" "60")
DEBUG="false"

if ask_yes_no "Enable debug mode?" "n"; then
  DEBUG="true"
fi

# Ports (only relevant without Traefik)
BACKEND_PORT="8000"
FRONTEND_PORT="3000"
if [ "$USE_TRAEFIK" = false ]; then
  BACKEND_PORT=$(ask_input "Backend port" "8000")
  FRONTEND_PORT=$(ask_input "Frontend port" "3000")
fi

# CORS
if [ "$USE_TRAEFIK" = true ]; then
  ALLOWED_ORIGINS="https://${DOMAIN}"
else
  ALLOWED_ORIGINS="http://${DOMAIN}:${FRONTEND_PORT}"
fi

# =============================================================================
# GENERATE .env FILE
# =============================================================================

print_section "Generating .env file"

cat > .env << ENVEOF
# =============================================================================
# Maintain@Github - Environment Variables
# Generated by setup.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# =============================================================================

# --- App ---
APP_SECRET_KEY=${APP_SECRET_KEY}
DEBUG=${DEBUG}

# --- Domain / Traefik ---
DOMAIN=${DOMAIN}
TRAEFIK_EMAIL=${TRAEFIK_EMAIL}
TRAEFIK_DASHBOARD_AUTH=${TRAEFIK_DASHBOARD_AUTH}

# --- GitHub OAuth ---
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
REDIS_URL=redis://redis:6379/0

# --- JWT ---
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_ALGORITHM=${JWT_ALGORITHM}
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=${JWT_ACCESS_TOKEN_EXPIRE_MINUTES}
JWT_REFRESH_TOKEN_EXPIRE_DAYS=${JWT_REFRESH_TOKEN_EXPIRE_DAYS}

# --- OpenRouter AI ---
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}

# --- Ollama ---
OLLAMA_BASE_URL=${OLLAMA_BASE_URL}

# --- File Storage ---
REPOS_STORAGE_PATH=${REPOS_STORAGE_PATH}

# --- Security ---
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
RATE_LIMIT_PER_MINUTE=${RATE_LIMIT_PER_MINUTE}

# --- Ports (used in minimal/non-Traefik setup) ---
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
ENVEOF

print_success "Created .env file"

# =============================================================================
# GENERATE docker-compose.generated.yml
# =============================================================================

print_section "Generating docker-compose.generated.yml"

COMPOSE_FILE="docker-compose.generated.yml"

# Start building the compose file
cat > "$COMPOSE_FILE" << 'HEADER'
# =============================================================================
# Maintain@Github - Docker Compose Configuration
# Generated by setup.sh - DO NOT EDIT MANUALLY (re-run setup.sh instead)
# =============================================================================

services:
HEADER

# --- Traefik Service ---
if [ "$USE_TRAEFIK" = true ]; then
cat >> "$COMPOSE_FILE" << 'TRAEFIK_SVC'
  traefik:
    image: traefik:v3.0
    container_name: maintain_traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/traefik.yml:ro
      - ./traefik/dynamic:/dynamic:ro
      - maintain_traefik_certs:/certs
    networks:
      - maintain_net
    labels:
      - "traefik.enable=true"
TRAEFIK_SVC

cat >> "$COMPOSE_FILE" << TRAEFIK_LABELS
      - "traefik.http.routers.dashboard.rule=Host(\`traefik.${DOMAIN}\`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.users=\${TRAEFIK_DASHBOARD_AUTH}"

TRAEFIK_LABELS
fi

# --- PostgreSQL Service ---
if [ "$USE_LOCAL_POSTGRES" = true ]; then
cat >> "$COMPOSE_FILE" << 'POSTGRES_SVC'
  postgres:
    image: postgres:16-alpine
    container_name: maintain_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-maintain_github}
      POSTGRES_USER: ${POSTGRES_USER:-maintain}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - maintain_postgres_data:/var/lib/postgresql/data
    networks:
      - maintain_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-maintain} -d ${POSTGRES_DB:-maintain_github}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

POSTGRES_SVC
fi

# --- Redis Service ---
cat >> "$COMPOSE_FILE" << 'REDIS_SVC'
  redis:
    image: redis:7-alpine
    container_name: maintain_redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - maintain_redis_data:/data
    networks:
      - maintain_net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

REDIS_SVC

# --- Ollama Service ---
if [ "$USE_LOCAL_OLLAMA" = true ]; then
cat >> "$COMPOSE_FILE" << 'OLLAMA_SVC'
  ollama:
    image: ollama/ollama:latest
    container_name: maintain_ollama
    restart: unless-stopped
    volumes:
      - maintain_ollama_data:/root/.ollama
    networks:
      - maintain_net
OLLAMA_SVC

  if [ "$USE_GPU" = true ]; then
cat >> "$COMPOSE_FILE" << 'OLLAMA_GPU'
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
OLLAMA_GPU
  fi

  echo "" >> "$COMPOSE_FILE"
fi

# --- Backend Service ---
cat >> "$COMPOSE_FILE" << 'BACKEND_SVC_START'
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: maintain_backend
    restart: unless-stopped
    env_file: .env
    environment:
BACKEND_SVC_START

if [ "$USE_LOCAL_POSTGRES" = true ]; then
  echo "      POSTGRES_HOST: postgres" >> "$COMPOSE_FILE"
else
  echo '      POSTGRES_HOST: ${POSTGRES_HOST:-host.docker.internal}' >> "$COMPOSE_FILE"
fi

echo "      REDIS_URL: redis://redis:6379/0" >> "$COMPOSE_FILE"

if [ "$USE_LOCAL_OLLAMA" = true ]; then
  echo "      OLLAMA_BASE_URL: http://ollama:11434" >> "$COMPOSE_FILE"
else
  echo '      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}' >> "$COMPOSE_FILE"
fi

echo "      REPOS_STORAGE_PATH: /app/repos" >> "$COMPOSE_FILE"

# Ports (only without Traefik)
if [ "$USE_TRAEFIK" = false ]; then
cat >> "$COMPOSE_FILE" << 'BACKEND_PORTS'
    ports:
      - "${BACKEND_PORT:-8000}:8000"
BACKEND_PORTS
fi

cat >> "$COMPOSE_FILE" << 'BACKEND_VOLUMES'
    volumes:
      - maintain_repos:/app/repos
BACKEND_VOLUMES

# depends_on
echo "    depends_on:" >> "$COMPOSE_FILE"
if [ "$USE_LOCAL_POSTGRES" = true ]; then
cat >> "$COMPOSE_FILE" << 'BACKEND_DEP_PG'
      postgres:
        condition: service_healthy
BACKEND_DEP_PG
fi
cat >> "$COMPOSE_FILE" << 'BACKEND_DEP_REDIS'
      redis:
        condition: service_healthy
BACKEND_DEP_REDIS

echo "    networks:" >> "$COMPOSE_FILE"
echo "      - maintain_net" >> "$COMPOSE_FILE"

# Traefik labels for backend
if [ "$USE_TRAEFIK" = true ]; then
cat >> "$COMPOSE_FILE" << BACKEND_LABELS
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=Host(\`${DOMAIN}\`) && (PathPrefix(\`/api\`) || PathPrefix(\`/ws\`) || PathPrefix(\`/auth\`))"
      - "traefik.http.routers.backend.entrypoints=websecure"
      - "traefik.http.routers.backend.tls=true"
      - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
      - "traefik.http.services.backend.loadbalancer.server.port=8000"
      - "traefik.http.middlewares.backend-ratelimit.ratelimit.average=100"
      - "traefik.http.middlewares.backend-ratelimit.ratelimit.burst=50"
      - "traefik.http.routers.backend.middlewares=backend-ratelimit"
BACKEND_LABELS
fi

# extra_hosts (only without local postgres/ollama)
if [ "$USE_LOCAL_POSTGRES" = false ] || [ "$USE_LOCAL_OLLAMA" = false ]; then
cat >> "$COMPOSE_FILE" << 'BACKEND_EXTRA_HOSTS'
    extra_hosts:
      - "host.docker.internal:host-gateway"
BACKEND_EXTRA_HOSTS
fi

echo "" >> "$COMPOSE_FILE"

# --- Worker Service ---
cat >> "$COMPOSE_FILE" << 'WORKER_SVC_START'
  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: maintain_worker
    restart: unless-stopped
    command: celery -A app.core.celery_app worker --loglevel=info --concurrency=4
    env_file: .env
    environment:
WORKER_SVC_START

if [ "$USE_LOCAL_POSTGRES" = true ]; then
  echo "      POSTGRES_HOST: postgres" >> "$COMPOSE_FILE"
else
  echo '      POSTGRES_HOST: ${POSTGRES_HOST:-host.docker.internal}' >> "$COMPOSE_FILE"
fi

echo "      REDIS_URL: redis://redis:6379/0" >> "$COMPOSE_FILE"

if [ "$USE_LOCAL_OLLAMA" = true ]; then
  echo "      OLLAMA_BASE_URL: http://ollama:11434" >> "$COMPOSE_FILE"
else
  echo '      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}' >> "$COMPOSE_FILE"
fi

echo "      REPOS_STORAGE_PATH: /app/repos" >> "$COMPOSE_FILE"

cat >> "$COMPOSE_FILE" << 'WORKER_VOLUMES'
    volumes:
      - maintain_repos:/app/repos
WORKER_VOLUMES

# depends_on
echo "    depends_on:" >> "$COMPOSE_FILE"
if [ "$USE_LOCAL_POSTGRES" = true ]; then
cat >> "$COMPOSE_FILE" << 'WORKER_DEP_PG'
      postgres:
        condition: service_healthy
WORKER_DEP_PG
fi
cat >> "$COMPOSE_FILE" << 'WORKER_DEP_REDIS'
      redis:
        condition: service_healthy
WORKER_DEP_REDIS

echo "    networks:" >> "$COMPOSE_FILE"
echo "      - maintain_net" >> "$COMPOSE_FILE"

# extra_hosts (only without local postgres/ollama)
if [ "$USE_LOCAL_POSTGRES" = false ] || [ "$USE_LOCAL_OLLAMA" = false ]; then
cat >> "$COMPOSE_FILE" << 'WORKER_EXTRA_HOSTS'
    extra_hosts:
      - "host.docker.internal:host-gateway"
WORKER_EXTRA_HOSTS
fi

echo "" >> "$COMPOSE_FILE"

# --- Frontend Service ---
cat >> "$COMPOSE_FILE" << 'FRONTEND_SVC_START'
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: maintain_frontend
    restart: unless-stopped
FRONTEND_SVC_START

if [ "$USE_TRAEFIK" = false ]; then
cat >> "$COMPOSE_FILE" << 'FRONTEND_PORTS'
    ports:
      - "${FRONTEND_PORT:-3000}:80"
FRONTEND_PORTS
fi

cat >> "$COMPOSE_FILE" << 'FRONTEND_DEPS'
    depends_on:
      - backend
    networks:
      - maintain_net
FRONTEND_DEPS

if [ "$USE_TRAEFIK" = true ]; then
cat >> "$COMPOSE_FILE" << FRONTEND_LABELS
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(\`${DOMAIN}\`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls=true"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=80"
      - "traefik.http.routers.frontend-http.rule=Host(\`${DOMAIN}\`)"
      - "traefik.http.routers.frontend-http.entrypoints=web"
      - "traefik.http.routers.frontend-http.middlewares=redirect-https"
      - "traefik.http.middlewares.redirect-https.redirectscheme.scheme=https"
      - "traefik.http.middlewares.redirect-https.redirectscheme.permanent=true"
FRONTEND_LABELS
fi

echo "" >> "$COMPOSE_FILE"

# --- Networks ---
cat >> "$COMPOSE_FILE" << 'NETWORKS'
networks:
  maintain_net:
    driver: bridge

NETWORKS

# --- Volumes ---
echo "volumes:" >> "$COMPOSE_FILE"

if [ "$USE_LOCAL_POSTGRES" = true ]; then
  echo "  maintain_postgres_data:" >> "$COMPOSE_FILE"
fi

echo "  maintain_redis_data:" >> "$COMPOSE_FILE"

if [ "$USE_LOCAL_OLLAMA" = true ]; then
  echo "  maintain_ollama_data:" >> "$COMPOSE_FILE"
fi

if [ "$USE_TRAEFIK" = true ]; then
  echo "  maintain_traefik_certs:" >> "$COMPOSE_FILE"
fi

echo "  maintain_repos:" >> "$COMPOSE_FILE"

print_success "Created docker-compose.generated.yml"

# =============================================================================
# SUMMARY
# =============================================================================

print_header "Setup Complete!"

echo -e "  ${BOLD}Configuration Summary:${NC}"
echo ""
echo -e "  Domain:              ${CYAN}${DOMAIN}${NC}"
echo -e "  Traefik:             $([ "$USE_TRAEFIK" = true ] && echo -e "${GREEN}Yes${NC}" || echo -e "${YELLOW}No${NC}")"
echo -e "  Local PostgreSQL:    $([ "$USE_LOCAL_POSTGRES" = true ] && echo -e "${GREEN}Yes (Docker)${NC}" || echo -e "${YELLOW}External (${POSTGRES_HOST}:${POSTGRES_PORT})${NC}")"
echo -e "  Local Ollama:        $([ "$USE_LOCAL_OLLAMA" = true ] && echo -e "${GREEN}Yes (Docker)${NC}" || echo -e "${YELLOW}External (${OLLAMA_BASE_URL})${NC}")"
if [ "$USE_LOCAL_OLLAMA" = true ] && [ "$USE_GPU" = true ]; then
  echo -e "  GPU Support:         ${GREEN}Enabled${NC}"
fi
echo -e "  OpenRouter:          $([ -n "$OPENROUTER_API_KEY" ] && echo -e "${GREEN}Configured${NC}" || echo -e "${YELLOW}Not configured${NC}")"
echo -e "  GitHub OAuth:        $([ -n "$GITHUB_CLIENT_ID" ] && echo -e "${GREEN}Configured${NC}" || echo -e "${YELLOW}Not configured${NC}")"
echo ""
echo -e "  ${BOLD}Generated files:${NC}"
echo -e "    - ${CYAN}.env${NC}"
echo -e "    - ${CYAN}docker-compose.generated.yml${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. Review the generated files:"
echo -e "     ${CYAN}cat .env${NC}"
echo -e "     ${CYAN}cat docker-compose.generated.yml${NC}"
echo ""
echo -e "  2. Start the application:"
echo -e "     ${CYAN}docker compose -f docker-compose.generated.yml up -d --build${NC}"
echo ""

if [ "$USE_LOCAL_OLLAMA" = true ]; then
  echo -e "  3. Pull an Ollama model (after services are running):"
  echo -e "     ${CYAN}docker exec maintain_ollama ollama pull llama3:8b${NC}"
  echo ""
fi

if [ "$USE_TRAEFIK" = true ]; then
  echo -e "  Make sure your DNS A record points to this server:"
  echo -e "     ${CYAN}${DOMAIN} → YOUR_SERVER_IP${NC}"
  echo ""
fi

echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "     ${CYAN}docker compose -f docker-compose.generated.yml logs -f${NC}        # View logs"
echo -e "     ${CYAN}docker compose -f docker-compose.generated.yml down${NC}           # Stop services"
echo -e "     ${CYAN}docker compose -f docker-compose.generated.yml restart${NC}        # Restart"
echo ""
