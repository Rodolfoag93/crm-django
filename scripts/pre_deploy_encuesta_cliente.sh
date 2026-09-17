#!/bin/bash
# Respaldo en servidor ANTES de migrar/desplegar encuesta cliente + ranking 70/30.
# Ejecutar en el droplet como root (SSH). Ajustar TS si repites el mismo día.
#
# Prerrequisito manual (panel DigitalOcean):
#   Droplet trotacrm → Snapshots → Take snapshot
#   Nombre sugerido: pre-encuesta-cliente-YYYY-MM-DD
#   Esperar 100% antes de continuar con migrate/restart.

set -euo pipefail

TS=$(date +%Y%m%d%H%M%S)
BK=/root/backups/pre-encuesta-$TS
mkdir -p "$BK"

echo "==> Backup en $BK"

tar -czf "$BK/crm-django-code.tgz" -C /home/trota crm-django \
  --exclude='crm-django/venv' --exclude='crm-django/node_modules' --exclude='crm-django/.git'

cp -a /etc/nginx/sites-enabled/app.trotacrm.com "$BK/nginx-app.trotacrm.com" 2>/dev/null || true

tar -czf "$BK/pwa.tgz" -C /home/trota/crm-django pwa 2>/dev/null || true

if sudo -u postgres pg_dump -Fc crm_trota > "$BK/crm_trota.dump" 2>/dev/null; then
  echo "PostgreSQL dump: $BK/crm_trota.dump"
else
  echo "pg_dump falló; usando dumpdata Django..."
  sudo -u trota bash -lc 'cd /home/trota/crm-django && source venv/bin/activate && python manage.py dumpdata --natural-foreign --indent 2 -o /tmp/datadump.json'
  cp /tmp/datadump.json "$BK/datadump.json"
fi

ls -la "$BK"
echo ""
echo "Guarda esta ruta para rollback puntual: $BK"
echo "Después del backup: migrate, deploy código/PWA, nginx -t, restart gunicorn."
echo "Checklist: scripts/post_deploy_checklist_encuesta_cliente.sh"
