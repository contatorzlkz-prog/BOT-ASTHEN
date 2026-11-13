#!/usr/bin/env bash
# Instalador para Linux/VPS. Rode: bash linux/setup-linux.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale Node.js 22 LTS (https://nodejs.org/) e rode novamente."
  exit 1
fi

node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)" || {
  echo "Node.js $(node --version) é antigo. Use Node.js 20 ou mais novo (recomendado: 22 LTS)."
  exit 1
}

echo "Node $(node --version)"
npm install --no-audit --no-fund
npm run check
npm run check:commands

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Arquivo .env criado. Preencha DISCORD_TOKEN e CLIENT_ID (nano .env)."
fi

mkdir -p data
chmod +x linux/start-linux.sh
echo "Instalação concluída. Edite .env e execute: bash linux/start-linux.sh"
