#!/bin/bash
# Actualiza Twilio en /opt/n8n/.env y recrea el contenedor n8n.
# Uso: bash set-twilio-env.sh

set -e

ENV_FILE=/opt/n8n/.env
COMPOSE_DIR=/opt/n8n
REPO_COMPOSE=/home/trota/crm-django/n8n/docker-compose.yml

# Valores Twilio: deben venir del entorno o de /opt/n8n/.env (nunca hardcodear secretos).
# Ejemplo:
#   export TWILIO_ACCOUNT_SID=ACxxxx
#   export TWILIO_AUTH_TOKEN=xxxx
#   bash scripts/set-twilio-env.sh

: "${TWILIO_ACCOUNT_SID:?Define TWILIO_ACCOUNT_SID}"
: "${TWILIO_AUTH_TOKEN:?Define TWILIO_AUTH_TOKEN}"
TWILIO_WHATSAPP_NUMBER="${TWILIO_WHATSAPP_NUMBER:-+14155238886}"
TWILIO_WEBHOOK_URL="${TWILIO_WEBHOOK_URL:-https://bot.app.trotacrm.com/webhook/whatsapp}"

mkdir -p "$COMPOSE_DIR"

# Upsert de variables en .env
upsert() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

touch "$ENV_FILE"
upsert TWILIO_ACCOUNT_SID "$TWILIO_ACCOUNT_SID"
upsert TWILIO_AUTH_TOKEN "$TWILIO_AUTH_TOKEN"
upsert TWILIO_WHATSAPP_NUMBER "$TWILIO_WHATSAPP_NUMBER"
upsert TWILIO_WEBHOOK_URL "$TWILIO_WEBHOOK_URL"

# Asegurar que docker-compose pase las vars al contenedor
if [ -f "$REPO_COMPOSE" ]; then
  cp "$REPO_COMPOSE" "$COMPOSE_DIR/docker-compose.yml"
fi

cd "$COMPOSE_DIR"
docker compose up -d

echo "==> .env (Twilio):"
grep '^TWILIO_' "$ENV_FILE" | sed 's/AUTH_TOKEN=.*/AUTH_TOKEN=***oculto***/'

echo "==> Vars dentro del contenedor:"
docker inspect n8n --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^TWILIO_' | sed 's/AUTH_TOKEN=.*/AUTH_TOKEN=***oculto***/'

echo "==> Logs:"
docker logs n8n 2>&1 | tail -20
