# 🚀 Deploy no Easypanel - Resumo Rápido

## Arquivos Criados

- `Dockerfile` - Frontend (React + Vite + Nginx)
- `backend/Dockerfile` - Backend (Node.js + Express)
- `nginx.conf` - Configuração do Nginx para SPA
- `docker-compose.prod.yml` - Docker Compose para produção
- `env.example` - Variáveis de ambiente de exemplo
- `.dockerignore` - Arquivos ignorados no build
- `backend/.dockerignore` - Arquivos ignorados no build do backend
- `EASYPANEL_DEPLOYMENT.md` - Guia completo de deploy

## Configuração Rápida no Easypanel

### 1. PostgreSQL
- Crie um serviço PostgreSQL
- Anote: Host, Port, Database, User, Password

### 2. Backend
- **Build Context**: `/backend`
- **Dockerfile**: `backend/Dockerfile`
- **Port**: `3001`
- **Env Vars**: Veja `env.example`

### 3. Frontend
- **Build Context**: `/` (raiz)
- **Dockerfile**: `Dockerfile`
- **Port**: `80`
- **Env Vars**: `VITE_API_URL`

### 4. Migrações
Execute as migrações SQL em ordem (001 a 018) no banco de dados.

## Variáveis de Ambiente Importantes

### Backend:
```env
POSTGRES_HOST=raceflow-postgres  # Nome do serviço PostgreSQL
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=sua_senha_segura
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=seu_secret_super_seguro
# Use a URL que o Easypanel gerou para o backend
API_URL=https://raceflow-backend-xxxxx.easypanel.host
# Use a URL do frontend (gerada pelo Easypanel)
CORS_ORIGIN=https://raceflow-frontend-xxxxx.easypanel.host
```

### Frontend:
```env
# Use a URL do backend + /api
VITE_API_URL=https://raceflow-backend-xxxxx.easypanel.host/api
```

**📖 IMPORTANTE**: Veja `EASYPANEL_URLS_GUIDE.md` para entender como descobrir e configurar as URLs no Easypanel!

