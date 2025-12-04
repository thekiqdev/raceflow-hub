# RaceFlow Backend API

Backend API para o RaceFlow Hub, construído com Node.js, Express e TypeScript.

## 🚀 Início Rápido

### Pré-requisitos
- Node.js 18+ e npm
- PostgreSQL rodando (via Docker Compose)

### Instalação

1. **Instalar dependências:**
   ```bash
   npm install
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   cp .env.example .env
   # Edite o arquivo .env com suas configurações
   ```

3. **Iniciar servidor em desenvolvimento:**
   ```bash
   npm run dev
   ```

4. **Build para produção:**
   ```bash
   npm run build
   npm start
   ```

## 📁 Estrutura do Projeto

```
backend/
├── src/
│   ├── config/          # Configurações (database, etc)
│   ├── controllers/      # Controllers das rotas
│   ├── middleware/       # Middlewares (auth, errorHandler)
│   ├── models/           # Modelos de dados
│   ├── routes/           # Definição de rotas
│   ├── services/         # Lógica de negócio
│   ├── types/            # Tipos TypeScript
│   ├── utils/            # Funções utilitárias
│   └── server.ts         # Arquivo principal do servidor
├── migrations/           # Migrations do banco de dados
├── package.json
└── tsconfig.json
```

## 🔧 Scripts Disponíveis

- `npm run dev` - Inicia servidor em modo desenvolvimento com hot reload
- `npm run build` - Compila TypeScript para JavaScript
- `npm start` - Inicia servidor em produção
- `npm run type-check` - Verifica erros de TypeScript sem compilar
- `npm run lint` - Executa linter

## 🌐 Endpoints

### Health Check
- `GET /api/health` - Verifica saúde da API e conexão com banco

### Root
- `GET /` - Informações da API

## 🔐 Autenticação

A autenticação é feita via JWT tokens. Inclua o token no header:
```
Authorization: Bearer <token>
```

## 🗄️ Banco de Dados

O backend usa PostgreSQL. A conexão é configurada via variáveis de ambiente:
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

## 📝 Variáveis de Ambiente

Veja `.env.example` para todas as variáveis necessárias:
- Configurações do PostgreSQL
- JWT_SECRET
- API_PORT
- CORS_ORIGIN
- NODE_ENV

### Exemplo de .env

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# Server
API_PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## 🛠️ Desenvolvimento

### Adicionar Nova Rota

1. Criar controller em `src/controllers/`
2. Criar service em `src/services/` (se necessário)
3. Criar rota em `src/routes/`
4. Registrar rota em `src/server.ts`

### Middlewares Disponíveis

- `authenticate` - Requer autenticação JWT
- `optionalAuth` - Autenticação opcional
- `errorHandler` - Tratamento global de erros
- `asyncHandler` - Wrapper para rotas async

## 📦 Dependências Principais

- **express** - Framework web
- **pg** - Cliente PostgreSQL
- **bcrypt** - Hash de senhas
- **jsonwebtoken** - JWT tokens
- **cors** - CORS middleware
- **express-validator** - Validação de dados
- **zod** - Schema validation

## 📚 Documentação Adicional

- `API_DOCUMENTATION.md` - Documentação completa da API
- `TESTING.md` - Guia de testes
- `SECURITY.md` - Documentação de segurança
- `migrations/README.md` - Documentação de migrations

## 🧪 Testes

Consulte `TESTING.md` para guia completo de testes.

### Testes Rápidos

1. **Health Check:**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Registrar usuário:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","full_name":"Test","cpf":"12345678900","phone":"85999999999","birth_date":"1990-01-01","lgpd_consent":true}'
   ```

3. **Script de teste automatizado:**
   ```bash
   chmod +x scripts/test-endpoints.sh
   ./scripts/test-endpoints.sh
   ```

### Validação do Banco de Dados

```bash
psql -h localhost -U raceflow_user -d raceflow_db -f scripts/validate-db.sql
```

## 📄 Licença

ISC

