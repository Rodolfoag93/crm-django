#!/bin/bash
# Respalda media/ en el servidor antes de cada deploy
set -euo pipefail

APP_DIR="/home/trota/crm-django"
BACKUP_DIR="/home/trota/backups/media"
STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET="$BACKUP_DIR/media_$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

if [ -d "$APP_DIR/media" ] && [ "$(ls -A "$APP_DIR/media" 2>/dev/null)" ]; then
  tar -czf "$TARGET" -C "$APP_DIR" media
  echo "Backup creado: $TARGET"
  ls -1t "$BACKUP_DIR"/media_*.tar.gz | tail -n +8 | xargs -r rm -f
else
  echo "Sin archivos en media/, backup omitido"
fi
