#!/bin/bash
# Verificación post-deploy encuesta cliente (ejecutar en droplet o vía curl desde tu máquina).
# Uso en servidor:
#   sudo -u trota bash -lc 'cd /home/trota/crm-django && source venv/bin/activate && python manage.py migrate --noinput'
#   nginx -t && systemctl restart gunicorn

set -euo pipefail

BASE="${BASE_URL:-https://app.trotacrm.com}"

echo "==> Checklist encuesta cliente / ranking coordinadores"
echo "BASE=$BASE"
echo ""

check() {
  local desc="$1"
  local url="$2"
  local expect="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo "000")
  if [ "$code" = "$expect" ]; then
    echo "[OK] $desc ($code)"
  else
    echo "[FAIL] $desc (esperado $expect, obtuvo $code) $url"
    return 1
  fi
}

check "Admin login" "$BASE/admin/login/" "200"
check "Auth me sin token" "$BASE/v1/auth/me/" "401"

echo ""
echo "Manual (con token staff en CRM):"
echo "  - GET $BASE/v1/crm/animacion/eventos/ → eventos con encuesta_cliente"
echo "  - GET $BASE/v1/crm/rankings/?rol=coordinadores&anio=$(date +%Y) → puntaje_final"
echo "  - GET $BASE/v1/animador/ranking/ → top 10 con puntaje compuesto"
echo "  - CRM Animación: capturar encuesta 5×5 y ver badge en tarjeta"
echo ""
echo "Rollback: restaurar snapshot DO o archivos desde /root/backups/pre-encuesta-*"
