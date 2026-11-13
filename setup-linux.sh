#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale Node.js 26 LTS antes de continuar."
  exit 1
fi

node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<24||(a===24&&b<17)||a>=27)process.exit(1)" || {
  echo "Versão incompatível: use Node.js 24.17+ ou 26 LTS."
  exit 1
}

echo "Node $(node --version)"
npm install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Arquivo .env criado. Configure DISCORD_TOKEN e CLIENT_ID."
fi

mkdir -p data
chmod +x start-linux.sh
echo "Instalação concluída. Edite .env e execute ./start-linux.sh"
