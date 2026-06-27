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

echo "==> Instalando dependencias..."
ssh $SERVER "sudo -u trota $VENV/bin/pip install -r $APP_DIR/requirements.txt -q"

echo "==> Aplicando migraciones..."
ssh $SERVER "sudo -u trota $PYTHON $APP_DIR/manage.py migrate --noinput"

echo "==> Recolectando archivos estaticos..."
ssh $SERVER "chown -R trota:www-data $APP_DIR/staticfiles && sudo -u trota $PYTHON $APP_DIR/manage.py collectstatic --noinput 2>&1 | tail -2"

echo "==> Reiniciando gunicorn..."
ssh $SERVER "systemctl restart gunicorn && systemctl is-active gunicorn"

echo ""
echo "Deploy completado."
