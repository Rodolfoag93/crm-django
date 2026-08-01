#!/bin/bash
# Instala n8n con Docker Compose + nginx en el Droplet de produccion.
# Uso en servidor: bash setup-n8n.sh
# Requiere: DNS bot.app.trotacrm.com apuntando a este servidor antes del SSL.

set -e

APP_DIR="/opt/n8n"
NGINX_SITE="bot.app.trotacrm.com"
REPO_N8N="/home/trota/crm-django/n8n"
echo "==> Instalando Docker si falta..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y docker-compose-plugin
fi

echo "==> Preparando $APP_DIR..."
mkdir -p "$APP_DIR"
cp "$REPO_N8N/docker-compose.yml" "$APP_DIR/docker-compose.yml"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$REPO_N8N/.env.example" "$APP_DIR/.env"
  echo ""
  echo "IMPORTANTE: Edita $APP_DIR/.env con passwords reales antes de continuar."
  echo "  nano $APP_DIR/.env"
  exit 1
fi

echo "==> Levantando n8n..."
cd "$APP_DIR"
docker compose pull -q
docker compose up -d

echo "==> Configurando nginx..."
cp "$REPO_N8N/nginx-${NGINX_SITE}.conf" "/etc/nginx/sites-available/${NGINX_SITE}"

if [ ! -f "/etc/letsencrypt/live/${NGINX_SITE}/fullchain.pem" ]; then
  cat > "/etc/nginx/sites-available/${NGINX_SITE}" <<'NGINX_HTTP'
server {
    listen 80;
    server_name bot.app.trotacrm.com;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_HTTP
  ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
  nginx -t
  systemctl reload nginx
  echo ""
  echo "==> Obteniendo certificado SSL (requiere DNS propagado)..."
  certbot certonly --nginx -d "$NGINX_SITE" --non-interactive --agree-tos -m admin@trotacrm.com || {
    echo "Certbot fallo. Verifica DNS bot.app -> IP del droplet y vuelve a ejecutar:"
    echo "  certbot certonly --nginx -d $NGINX_SITE"
    exit 1
  }
  cp "$REPO_N8N/nginx-${NGINX_SITE}.conf" "/etc/nginx/sites-available/${NGINX_SITE}"
fi

ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
nginx -t
systemctl reload nginx

echo ""
echo "Listo."
echo "  n8n: https://${NGINX_SITE}"
echo "  CRM bot API: https://app.trotacrm.com/v1/bot/"
docker compose ps
