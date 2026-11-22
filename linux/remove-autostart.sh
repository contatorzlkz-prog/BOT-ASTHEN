#!/usr/bin/env bash
set -euo pipefail
UNIT_FILE="$HOME/.config/systemd/user/asthen-bot.service"
systemctl --user disable --now asthen-bot.service 2>/dev/null || true
rm -f "$UNIT_FILE"
systemctl --user daemon-reload
echo "Servico automatico do ASTHEN BOT removido."
