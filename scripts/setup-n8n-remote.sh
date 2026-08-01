#!/bin/bash
set -e
APP_DIR=/opt/n8n
REPO_N8N=/home/trota/crm-django/n8n
NGINX_SITE=bot.app.trotacrm.com

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y docker-compose-plugin
fi

mkdir -p "$APP_DIR"
cp "$REPO_N8N/docker-compose.yml" "$APP_DIR/docker-compose.yml"
cd "$APP_DIR"
docker compose pull -q
docker compose up -d

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
        proxy_read_timeout 300s;
    }
}
NGINX_HTTP

ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
nginx -t
systemctl reload nginx

echo "n8n_local:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5678/)"
docker compose ps

if [ -f "/etc/letsencrypt/live/${NGINX_SITE}/fullchain.pem" ]; then
  cp "$REPO_N8N/nginx-${NGINX_SITE}.conf" "/etc/nginx/sites-available/${NGINX_SITE}"
  nginx -t
  systemctl reload nginx
  echo "ssl:ok"
else
  echo "ssl:pendiente - configura DNS bot.app -> 178.128.182.227 y ejecuta:"
  echo "  certbot certonly --nginx -d ${NGINX_SITE}"
fi
