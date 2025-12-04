# Guia de Inicialização - RaceFlow Hub

Este guia mostra como iniciar o projeto completo após a migração do Supabase.

## Pré-requisitos

- Docker e Docker Compose instalados
- Node.js 18+ e npm
- Git

## Início Rápido (Windows)

### Usando Script Automatizado

Execute o script de inicialização:

```batch
start.bat
```

Ou no PowerShell:

```powershell
.\start.ps1
```

O script irá:
1. Verificar Docker
2. Iniciar banco de dados
3. Executar migrations
4. Instalar dependências (se necessário)
5. Iniciar backend e frontend

## Passo a Passo Manual

### 1. Clonar o Repositório

```bash
git clone <repository-url>
cd cronoteam
```

### 2. Configurar Banco de Dados (PostgreSQL)

#### 2.1. Criar arquivo `.env` na raiz do projeto

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password
POSTGRES_DB=raceflow_db
POSTGRES_PORT=5432
POSTGRES_HOST=localhost
```

#### 2.2. Iniciar PostgreSQL com Docker

```bash
docker-compose up -d
```

Isso irá:
- Criar um container PostgreSQL
- Configurar o banco de dados
- Expor na porta 5432

#### 2.3. Executar Migrations

```bash
cd backend
psql -h localhost -U raceflow_user -d raceflow_db -f migrations/001_initial_schema.sql
psql -h localhost -U raceflow_user -d raceflow_db -f migrations/002_add_indexes.sql
psql -h localhost -U raceflow_user -d raceflow_db -f migrations/003_optimize_queries.sql
```

Ou usando Docker:

```bash
docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db < backend/migrations/001_initial_schema.sql
docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db < backend/migrations/002_add_indexes.sql
docker exec -i raceflow_postgres psql -U raceflow_user -d raceflow_db < backend/migrations/003_optimize_queries.sql
```

### 3. Configurar Backend

#### 3.1. Instalar Dependências

```bash
cd backend
npm install
```

#### 3.2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` no diretório `backend/`:

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password

# JWT
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRES_IN=7d

# Server
API_PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

#### 3.3. Iniciar Backend

```bash
npm run dev
```

O backend estará rodando em `http://localhost:3001`

### 4. Configurar Frontend

#### 4.1. Instalar Dependências

```bash
cd ..
npm install --legacy-peer-deps
```

#### 4.2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_API_URL=http://localhost:3001/api
```

#### 4.3. Iniciar Frontend

```bash
npm run dev
```

O frontend estará rodando em `http://localhost:5173`

## Verificação

### 1. Verificar Banco de Dados

```bash
docker ps
# Deve mostrar o container raceflow_postgres rodando
```

### 2. Verificar Backend

```bash
curl http://localhost:3001/api/health
# Deve retornar: {"success":true,"message":"API is healthy",...}
```

### 3. Verificar Frontend

Abra `http://localhost:5173` no navegador

## Scripts Úteis

### Parar Banco de Dados

```bash
docker-compose down
```

### Ver Logs do Banco

```bash
docker-compose logs -f postgres
```

### Reiniciar Banco de Dados

```bash
docker-compose restart
```

### Limpar Banco de Dados (CUIDADO: apaga todos os dados)

```bash
docker-compose down -v
docker-compose up -d
# Depois executar migrations novamente
```

## Estrutura de Diretórios

```
cronoteam/
├── backend/              # Backend API (Node.js/Express)
│   ├── src/
│   ├── migrations/
│   └── package.json
├── src/                 # Frontend (React/Vite)
├── docker-compose.yml   # Configuração Docker
├── .env                 # Variáveis de ambiente (raiz)
└── package.json         # Frontend package.json
```

## Troubleshooting

### Erro: "Cannot connect to database"

1. Verifique se o Docker está rodando: `docker ps`
2. Verifique se o container está rodando: `docker-compose ps`
3. Verifique as variáveis de ambiente no `.env`
4. Verifique os logs: `docker-compose logs postgres`

### Erro: "Port already in use"

1. Verifique se outra aplicação está usando a porta
2. Altere a porta no `.env` ou `docker-compose.yml`

### Erro: "Migration failed"

1. Verifique se o banco está rodando
2. Verifique as credenciais no `.env`
3. Execute as migrations uma por uma

## Próximos Passos

1. Criar um usuário admin (via API ou SQL)
2. Testar os endpoints (veja `backend/TESTING.md`)
3. Configurar produção (veja documentação de deploy)

## Suporte

- Backend: `backend/README.md`
- API: `backend/API_DOCUMENTATION.md`
- Testes: `backend/TESTING.md`
- Segurança: `backend/SECURITY.md`

