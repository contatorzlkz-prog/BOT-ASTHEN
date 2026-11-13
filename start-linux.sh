#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Arquivo .env não encontrado. Execute ./setup-linux.sh primeiro."
  exit 1
fi

npm start
