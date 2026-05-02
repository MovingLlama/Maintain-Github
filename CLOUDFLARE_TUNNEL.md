# Cloudflare Tunnel Setup (Alternative zu Traefik)

Mit Cloudflare Tunnel (cloudflared) kannst du Maintain@Github sicher extern
verfügbar machen, **ohne Ports in der Firewall öffnen zu müssen**.

## Voraussetzungen

- Cloudflare-Account mit einer Domain
- `cloudflared` installiert oder als Docker Container

## Option A: cloudflared als Docker Service

Füge folgenden Service zu `docker-compose.minimal.yml` hinzu:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: maintain_cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - maintain_net
```

Dann in `.env`:
```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJhbGci...  # Dein Tunnel-Token von Cloudflare
```

## Option B: cloudflared auf dem Host

```bash
# Installieren (Debian/Ubuntu)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authentifizieren
cloudflared tunnel login

# Tunnel erstellen
cloudflared tunnel create maintain-github

# Konfigurieren (~/.cloudflared/config.yml)
cat > ~/.cloudflared/config.yml << EOF
tunnel: <TUNNEL-ID>
credentials-file: /home/$USER/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: yourdomain.com
    service: http://localhost:3000
  - hostname: api.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
EOF

# DNS-Einträge erstellen
cloudflared tunnel route dns maintain-github yourdomain.com
cloudflared tunnel route dns maintain-github api.yourdomain.com

# Als Systemdienst starten
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## Konfiguration für Cloudflare Tunnel

Wenn du Cloudflare Tunnel verwendest, passe in `.env` folgendes an:

```bash
DOMAIN=yourdomain.com
GITHUB_REDIRECT_URI=https://yourdomain.com/auth/github/callback
ALLOWED_ORIGINS=https://yourdomain.com
DEBUG=false
```

## Sicherheitshinweis

Mit Cloudflare Tunnel:
- **Kein Port muss in der Firewall geöffnet werden** ✅
- Traffic ist automatisch über Cloudflare TLS verschlüsselt ✅
- DDoS-Schutz durch Cloudflare ✅
- Kostenlos für persönliche Nutzung ✅
