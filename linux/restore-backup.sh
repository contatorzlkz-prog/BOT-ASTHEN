#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

was_active=0
if systemctl --user is-active --quiet asthen-bot.service; then
  was_active=1
  systemctl --user stop asthen-bot.service
fi

echo "Backups disponiveis:"
node src/maintenance-cli.js list
echo
read -r -p "Identificador exato do backup: " BACKUP_ID
if [[ -z "$BACKUP_ID" ]]; then
  echo "Restauracao cancelada."
  if [[ "$was_active" -eq 1 ]]; then systemctl --user start asthen-bot.service; fi
  exit 1
fi

read -r -p "Digite RESTAURAR para confirmar: " CONFIRM
if [[ "$CONFIRM" != "RESTAURAR" ]]; then
  echo "Restauracao cancelada."
  if [[ "$was_active" -eq 1 ]]; then systemctl --user start asthen-bot.service; fi
  exit 1
fi

if node src/maintenance-cli.js restore "$BACKUP_ID"; then
  echo "Restauracao concluida."
  if [[ "$was_active" -eq 1 ]]; then systemctl --user start asthen-bot.service; fi
else
  echo "A restauracao falhou. Os dados anteriores foram preservados."
  if [[ "$was_active" -eq 1 ]]; then systemctl --user start asthen-bot.service; fi
  exit 1
fi
