# Detailed Setup Guide

## 1. Server Requirements

- OS: Ubuntu 22.04+ / Debian 11+ / any Linux with Docker
- RAM: Minimum 2GB (4GB+ recommended for Ollama)
- CPU: 2+ cores
- Storage: 20GB+ (more if using large Ollama models)
- Open ports: 80 (HTTP), 443 (HTTPS)
- Docker >= 24.0
- Docker Compose >= 2.20

## 2. Install Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version          # Docker version 24.x+
docker compose version    # Docker Compose version v2.x+
```

## 3. Create GitHub OAuth App

1. Go to: https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in:
   ```
   Application name:    Maintain@Github
   Homepage URL:        https://YOUR_DOMAIN
   Callback URL:        https://YOUR_DOMAIN/auth/github/callback
   ```
4. Click **Register application**
5. Note the **Client ID**
6. Click **Generate a new client secret** → note the **Client Secret**

## 4. DNS Configuration

Create A records at your DNS provider:
```
A    your-domain.com           → YOUR_SERVER_IP
A    traefik.your-domain.com   → YOUR_SERVER_IP  (optional)
```

Wait for DNS propagation (5–60 minutes typically).

## 5. Configure Firewall

```bash
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

## 6. Configure the Application

```bash
# Copy template
cp .env.example .env

# Generate secure values
APP_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 16)

echo "APP_SECRET_KEY=$APP_SECRET"
echo "JWT_SECRET_KEY=$JWT_SECRET"
echo "POSTGRES_PASSWORD=$DB_PASS"
```

Edit `.env`:
```bash
nano .env
```

Set these required values:
```bash
# Domain
DOMAIN=your-domain.com
TRAEFIK_EMAIL=your@email.com

# GitHub OAuth (from Step 3)
GITHUB_CLIENT_ID=Ov23liXXXXXXXXXX
GITHUB_CLIENT_SECRET=abc123...
GITHUB_REDIRECT_URI=https://your-domain.com/auth/github/callback

# Generated secrets (from above)
APP_SECRET_KEY=<generated>
JWT_SECRET_KEY=<generated>
POSTGRES_PASSWORD=<generated>

# Optional: OpenRouter for cloud AI models
OPENROUTER_API_KEY=sk-or-v1-...
```

## 7. First Start

```bash
# Create required directories
mkdir -p traefik/certs

# Build images and start
make up-build

# Monitor logs (Ctrl+C to stop following)
make logs
```

Expected startup sequence:
1. Traefik starts and requests Let's Encrypt certificate
2. PostgreSQL starts and becomes healthy
3. Redis starts and becomes healthy
4. Backend starts, waits for DB/Redis, runs migrations
5. Frontend builds and starts
6. Worker starts

**Ready when you see:** `Application startup complete.`

## 8. Add AI Models

```bash
# Interactive model pull
make ollama-pull

# Suggested models:
# - llama3:8b          (3.5GB, good general purpose)
# - codellama:7b       (3.8GB, code focused)
# - deepseek-coder:6.7b (3.8GB, excellent for code)
```

## 9. Access & Login

1. Open `https://your-domain.com` in your browser
2. Click **"Continue with GitHub"**
3. Authorize the application
4. You're logged in! 🎉

## 10. Updating

```bash
# Pull latest code changes
git pull

# Rebuild and restart
make up-build

# Apply any new database migrations
make db-upgrade
```

## Production Checklist

- [ ] Strong random `APP_SECRET_KEY` set (32+ chars)
- [ ] Strong random `JWT_SECRET_KEY` set (32+ chars)
- [ ] Strong `POSTGRES_PASSWORD` set
- [ ] `DEBUG=false` in .env
- [ ] `TRAEFIK_EMAIL` set for Let's Encrypt
- [ ] `DOMAIN` matches your actual domain
- [ ] GitHub OAuth callback URL matches `GITHUB_REDIRECT_URI`
- [ ] Firewall allows only ports 22, 80, 443
- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [ ] Regular backups configured for PostgreSQL volume
