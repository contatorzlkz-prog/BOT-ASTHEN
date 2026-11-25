#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js nao encontrado. Execute linux/setup-linux.sh primeiro."
  exit 1
fi
node -e "process.exit(Number(process.versions.node.split('.')[0]) >=22?0:1)" || {
  echo "O ASTHEN BOT exige Node.js 22 ou superior."
  exit 1
}

escape_unit() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/ /\\x20/g'
}

NODE_ESCAPED="$(escape_unit "$NODE")"
ROOT_ESCAPED="$(escape_unit "$ROOT")"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/asthen-bot.service"
mkdir -p "$UNIT_DIR" "$ROOT/data/logs" "$ROOT/backups"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=ASTHEN Discord and Minecraft Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_ESCAPED
ExecStart=$NODE_ESCAPED $ROOT_ESCAPED/src/index.js
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=0
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$ROOT_ESCAPED/data $ROOT_ESCAPED/backups $ROOT_ESCAPED/.env

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now asthen-bot.service
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" >/dev/null 2>&1 || true
fi

echo "Servico asthen-bot.service instalado e iniciado."
echo "Estado: systemctl --user status asthen-bot"
echo "Logs: journalctl --user -u asthen-bot -f"
