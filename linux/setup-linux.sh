#!/usr/bin/env bash
# Instalador para Linux/VPS. Rode: bash linux/setup-linux.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale Node.js 26 LTS (https://nodejs.org/) e rode novamente."
  exit 1
fi

node -e "process.exit(Number(process.versions.node.split('.')[0]) >=22?0:1)" || {
  echo "Node.js $(node --version) é antigo. Use Node.js 22 ou mais novo (recomendado: 26 LTS)."
  exit 1
}

echo "Node $(node --version)"
npm install --no-audit --no-fund
npm run check
npm run check:commands
npm test

if [[ ! -f .env ]]; then
  echo
  read -r -p "Token do bot Discord: " DISCORD_TOKEN
  read -r -p "Application ID do bot: " CLIENT_ID
  read -r -p "ID do servidor de teste (opcional): " GUILD_ID
  if [[ -z "$DISCORD_TOKEN" || -z "$CLIENT_ID" ]]; then
    echo "Token e Application ID são obrigatórios. Execute o instalador novamente."
    exit 1
  fi

  {
    printf 'DISCORD_TOKEN=%s\n' "$DISCORD_TOKEN"
    printf 'CLIENT_ID=%s\n' "$CLIENT_ID"
    printf 'GUILD_ID=%s\n' "$GUILD_ID"
    printf 'DKB_HOST=127.0.0.1\n'
    printf 'DKB_PORT=8787\n'
    printf 'SUPABASE_URL=\n'
    printf 'SUPABASE_SECRET_KEY=\n'
    printf 'SUPABASE_TABLE=asthen_bot_state\n'
  } > .env
  chmod 600 .env
  echo "Arquivo .env criado."
else
  echo "Arquivo .env existente preservado."
fi

mkdir -p data
chmod +x linux/start-linux.sh
echo "Instalação concluída. Execute: bash linux/start-linux.sh"
