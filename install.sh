#!/bin/bash
set -e

# Configuration
REPO_OWNER="stefan-seyerl"
REPO_NAME="maintain-github"
BASE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main"

echo "🚀 Starting Maintain@Github Installation..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose v2 is not installed."
    exit 1
fi

# Create necessary directories
mkdir -p traefik/dynamic

# Download required files
echo "📥 Downloading configuration files..."
curl -fsSL "${BASE_URL}/docker-compose.yml" -o docker-compose.yml
curl -fsSL "${BASE_URL}/docker-compose.minimal.yml" -o docker-compose.minimal.yml
curl -fsSL "${BASE_URL}/traefik/traefik.yml" -o traefik/traefik.yml
curl -fsSL "${BASE_URL}/traefik/dynamic/middlewares.yml" -o traefik/dynamic/middlewares.yml
curl -fsSL "${BASE_URL}/.env.example" -o .env.example

# Handle .env file
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Please edit the .env file and fill in your GitHub OAuth credentials and Domain!"
else
    echo "✅ .env file already exists, skipping copy."
fi

echo ""
echo "🎉 Installation files downloaded successfully!"
echo ""
echo "Next steps:"
echo "1. Edit the .env file: nano .env"
echo "2. Start the application: docker compose up -d"
echo ""
echo "If you prefer the minimal setup (external DB/Ollama), use: docker compose -f docker-compose.minimal.yml up -d"
