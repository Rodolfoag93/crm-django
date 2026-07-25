#!/bin/bash
# Deploy al droplet de produccion
# Uso: bash deploy.sh

set -e

SERVER="root@178.128.182.227"
APP_DIR="/home/trota/crm-django"
VENV="$APP_DIR/venv"
PYTHON="$VENV/bin/python"

echo "==> Haciendo pull del codigo..."
ssh $SERVER "sudo -u trota git -C $APP_DIR pull origin master"

echo "==> Verificando entorno virtual..."
ssh $SERVER "test -x $VENV/bin/python || sudo -u trota python3 -m venv $VENV"

echo "==> Instalando dependencias..."
ssh $SERVER "sudo -u trota $VENV/bin/pip install -r $APP_DIR/requirements.txt -q"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"

echo "==> Compilando PWA localmente..."
(cd "$FRONTEND" && npm ci --silent && npm run build --silent)

echo "==> Subiendo PWA a produccion..."
ssh $SERVER "rm -rf $APP_DIR/pwa && mkdir -p $APP_DIR/pwa"
scp -r "$FRONTEND/dist/"* $SERVER:$APP_DIR/pwa/
ssh $SERVER "chown -R trota:www-data $APP_DIR/pwa"

echo "==> Aplicando migraciones..."
ssh $SERVER "sudo -u trota $PYTHON $APP_DIR/manage.py migrate --noinput"

echo "==> Respaldando media..."
ssh $SERVER "bash $APP_DIR/scripts/backup_media.sh"

echo "==> Recolectando archivos estaticos..."
ssh $SERVER "chown -R trota:www-data $APP_DIR/staticfiles && sudo -u trota $PYTHON $APP_DIR/manage.py collectstatic --noinput 2>&1 | tail -2"

echo "==> Reiniciando gunicorn..."
ssh $SERVER "systemctl restart gunicorn && systemctl is-active gunicorn"

echo ""
echo "Deploy completado."
