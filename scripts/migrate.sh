#!/usr/bin/env bash
# Executa as migrations do backend (PostgreSQL).
# Uso: ./scripts/migrate.sh   ou   bash scripts/migrate.sh
# Requer: variáveis de ambiente do banco (POSTGRES_* ou .env em backend/)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/../backend"

if [ ! -f "${BACKEND_DIR}/package.json" ]; then
  echo "Erro: backend/package.json não encontrado. Execute a partir da raiz do projeto."
  exit 1
fi

cd "${BACKEND_DIR}"
npm run migrate
