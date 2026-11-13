#!/usr/bin/env bash
# Inicia o bot. Rode: bash linux/start-linux.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Arquivo .env não encontrado. Execute: bash linux/setup-linux.sh"
  exit 1
fi

npm start
