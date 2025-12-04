# RaceFlow Hub

Plataforma de gestão de corridas de rua com sistema completo de cronometragem, inscrições e gestão de eventos.

## 🚀 Início Rápido

### Windows (Recomendado)

Execute o script de inicialização:

```batch
start.bat
```

Ou no PowerShell:

```powershell
.\start.ps1
```

O script automatiza todo o processo de inicialização!

### Manual

Veja o arquivo [START.md](./START.md) para instruções detalhadas.

**Resumo rápido:**

1. **Iniciar banco de dados:**
   ```bash
   docker-compose up -d
   ```

2. **Executar migrations:**
   ```bash
   cd backend
   psql -h localhost -U raceflow_user -d raceflow_db -f migrations/001_initial_schema.sql
   psql -h localhost -U raceflow_user -d raceflow_db -f migrations/002_add_indexes.sql
   psql -h localhost -U raceflow_user -d raceflow_db -f migrations/003_optimize_queries.sql
   ```

3. **Iniciar backend:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

4. **Iniciar frontend:**
   ```bash
   npm install --legacy-peer-deps
   npm run dev
   ```

## 📋 Pré-requisitos

- Docker e Docker Compose
- Node.js 18+
- PostgreSQL (via Docker)

## 🏗️ Arquitetura

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Banco de Dados**: PostgreSQL (Docker)
- **Autenticação**: JWT

## 📁 Estrutura do Projeto

```
cronoteam/
├── backend/              # Backend API
│   ├── src/
│   │   ├── config/      # Configurações
│   │   ├── controllers/ # Controllers
│   │   ├── middleware/  # Middlewares
│   │   ├── routes/      # Rotas
│   │   ├── services/    # Lógica de negócio
│   │   └── server.ts    # Servidor principal
│   ├── migrations/      # Migrations do banco
│   └── package.json
├── src/                 # Frontend React
│   ├── components/     # Componentes React
│   ├── lib/            # Bibliotecas e utilitários
│   ├── pages/          # Páginas
│   └── main.tsx        # Entry point
├── docker-compose.yml  # Configuração Docker
└── package.json        # Frontend dependencies
```

## 🔧 Scripts Disponíveis

### Frontend
- `npm run dev` - Inicia servidor de desenvolvimento
- `npm run build` - Build para produção
- `npm run preview` - Preview do build

### Backend
- `npm run dev` - Inicia servidor em desenvolvimento
- `npm run build` - Compila TypeScript
- `npm start` - Inicia servidor em produção
- `npm run type-check` - Verifica erros TypeScript

## 📚 Documentação

- [START.md](./START.md) - Guia de inicialização completo
- [backend/README.md](./backend/README.md) - Documentação do backend
- [backend/API_DOCUMENTATION.md](./backend/API_DOCUMENTATION.md) - Documentação da API
- [backend/TESTING.md](./backend/TESTING.md) - Guia de testes
- [backend/SECURITY.md](./backend/SECURITY.md) - Documentação de segurança
- [MIGRACAO_SUPABASE_PARA_DOCKER_POSTGRES.md](./MIGRACAO_SUPABASE_PARA_DOCKER_POSTGRES.md) - Documentação da migração

## 🔐 Autenticação

A autenticação é feita via JWT tokens. O token deve ser incluído no header:

```
Authorization: Bearer <token>
```

## 🗄️ Banco de Dados

O banco de dados PostgreSQL roda em um container Docker. As configurações estão em `docker-compose.yml` e `.env`.

### Migrations

As migrations estão em `backend/migrations/`:
- `001_initial_schema.sql` - Schema inicial
- `002_add_indexes.sql` - Índices para performance
- `003_optimize_queries.sql` - Otimizações de queries

## 🌐 Endpoints Principais

- `GET /api/health` - Health check
- `POST /api/auth/register` - Registrar usuário
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Obter usuário atual
- `GET /api/events` - Listar eventos
- `POST /api/events` - Criar evento
- `GET /api/registrations` - Listar inscrições

Veja [backend/API_DOCUMENTATION.md](./backend/API_DOCUMENTATION.md) para documentação completa.

## 🧪 Testes

Consulte [backend/TESTING.md](./backend/TESTING.md) para guia completo de testes.

### Teste Rápido

```bash
# Health check
curl http://localhost:3001/api/health
```

## 🔒 Segurança

- Rate limiting implementado
- Validação de entrada com Zod
- Autenticação JWT
- Autorização baseada em roles
- Logs de segurança

Veja [backend/SECURITY.md](./backend/SECURITY.md) para mais detalhes.

## 📝 Variáveis de Ambiente

### Raiz do Projeto (.env)
```env
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password
POSTGRES_DB=raceflow_db
POSTGRES_PORT=5432
POSTGRES_HOST=localhost
```

### Backend (backend/.env)
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password
JWT_SECRET=your-secret-key
API_PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001/api
```

## 🚢 Deploy

### Produção

1. Configure variáveis de ambiente de produção
2. Use um PostgreSQL gerenciado (AWS RDS, DigitalOcean, etc.)
3. Configure HTTPS
4. Configure backup automático
5. Configure monitoramento

## 📦 Dependências Principais

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Radix UI

### Backend
- Express
- PostgreSQL (pg)
- JWT (jsonwebtoken)
- Bcrypt
- Zod

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

ISC

## 📞 Suporte

Para problemas ou dúvidas:
- Consulte a documentação em `backend/`
- Veja [START.md](./START.md) para troubleshooting
- Abra uma issue no repositório
