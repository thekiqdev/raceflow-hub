#!/bin/sh

# Script para criar usuários de teste
# Uso: ./create-test-users.sh
# Ou: sh create-test-users.sh

echo "🚀 Criando usuários de teste..."
echo ""

# Verificar se as variáveis de ambiente estão configuradas
if [ -z "$POSTGRES_HOST" ]; then
  echo "⚠️  POSTGRES_HOST não configurado. Usando padrão: localhost"
  export POSTGRES_HOST=${POSTGRES_HOST:-localhost}
fi

if [ -z "$POSTGRES_DB" ]; then
  echo "⚠️  POSTGRES_DB não configurado. Usando padrão: raceflow_db"
  export POSTGRES_DB=${POSTGRES_DB:-raceflow_db}
fi

if [ -z "$POSTGRES_USER" ]; then
  echo "⚠️  POSTGRES_USER não configurado. Usando padrão: raceflow_user"
  export POSTGRES_USER=${POSTGRES_USER:-raceflow_user}
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "❌ POSTGRES_PASSWORD não configurado!"
  exit 1
fi

echo "📊 Configuração:"
echo "   Host: $POSTGRES_HOST"
echo "   Database: $POSTGRES_DB"
echo "   User: $POSTGRES_USER"
echo ""

# Executar o script Node.js
echo "🔄 Executando script Node.js..."
npm run create-test-users

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Script executado com sucesso!"
else
  echo ""
  echo "❌ Erro ao executar o script!"
  exit 1
fi

