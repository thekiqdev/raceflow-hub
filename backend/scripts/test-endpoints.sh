#!/bin/bash

# Script de teste de endpoints da API RaceFlow Hub
# Uso: ./test-endpoints.sh

BASE_URL="http://localhost:3001"
TOKEN=""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testando Endpoints da API RaceFlow Hub"
echo "=========================================="
echo ""

# Função para fazer requisições
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -n "Testando: $description... "
    
    if [ -z "$data" ]; then
        if [ -z "$TOKEN" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Authorization: Bearer $TOKEN")
        fi
    else
        if [ -z "$TOKEN" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $TOKEN" \
                -d "$data")
        fi
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ OK (${http_code})${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL (${http_code})${NC}"
        echo "Response: $body"
        return 1
    fi
}

# 1. Health Check
make_request "GET" "/api/health" "" "Health Check"

# 2. Registrar usuário
REGISTER_DATA='{
  "email": "test@example.com",
  "password": "password123",
  "full_name": "Test User",
  "cpf": "12345678900",
  "phone": "85999999999",
  "birth_date": "1990-01-01",
  "gender": "M",
  "lgpd_consent": true
}'

make_request "POST" "/api/auth/register" "$REGISTER_DATA" "Registrar Usuário"

# Extrair token da resposta
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "$REGISTER_DATA")

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    # Tentar login se registro falhou (usuário já existe)
    LOGIN_DATA='{"email":"test@example.com","password":"password123"}'
    LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "$LOGIN_DATA")
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
fi

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}Token obtido: ${TOKEN:0:20}...${NC}"
    echo ""
    
    # 3. Obter usuário atual
    make_request "GET" "/api/auth/me" "" "Obter Usuário Atual"
    
    # 4. Obter perfil
    make_request "GET" "/api/profiles/me" "" "Obter Próprio Perfil"
    
    # 5. Listar eventos
    make_request "GET" "/api/events" "" "Listar Eventos"
    
    # 6. Listar inscrições
    make_request "GET" "/api/registrations" "" "Listar Inscrições"
    
    # 7. Obter configurações da home
    make_request "GET" "/api/home-page-settings" "" "Obter Configurações da Home"
else
    echo -e "${RED}Erro: Não foi possível obter token${NC}"
fi

echo ""
echo "✅ Testes concluídos!"





