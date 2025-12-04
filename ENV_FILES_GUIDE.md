# 📝 Guia dos Arquivos .env

## 📁 Estrutura dos Arquivos

```
projeto/
├── frontend.env.example          # Variáveis do Frontend
├── env.example                   # Variáveis gerais (legado)
│
└── backend/
    └── env.example                # Variáveis do Backend
```

## 🎯 Arquivos .env Separados

### 1. Frontend (`frontend.env.example`)

**Localização**: `/frontend.env.example`

**Variáveis:**
- `VITE_API_URL` - URL do backend API

**Como usar:**
1. Copie para `.env` na raiz do projeto:
   ```bash
   cp frontend.env.example .env
   ```
2. Ou configure diretamente no Easypanel (variáveis de ambiente do serviço frontend)

**Variáveis necessárias:**
```env
VITE_API_URL=http://localhost:3001/api
```

---

### 2. Backend (`backend/env.example`)

**Localização**: `/backend/env.example`

**Variáveis:**
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `API_PORT`
- `API_URL`
- `CORS_ORIGIN`
- `NODE_ENV`

**Como usar:**
1. Copie para `.env` na pasta backend:
   ```bash
   cp backend/env.example backend/.env
   ```
2. Ou configure diretamente no Easypanel (variáveis de ambiente do serviço backend)

**Variáveis necessárias:**
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password
DATABASE_URL=postgresql://raceflow_user:raceflow_password@localhost:5432/raceflow_db
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
API_PORT=3001
API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:5173,http://localhost:8080,http://localhost:3000
NODE_ENV=development
```

---

## 🚀 Para Easypanel

No Easypanel, você **NÃO precisa** criar arquivos `.env`. Configure as variáveis diretamente nas **Environment Variables** de cada serviço:

### Frontend Service:
```env
VITE_API_URL=https://raceflow-backend-xxxxx.easypanel.host/api
```

### Backend Service:
```env
POSTGRES_HOST=raceflow-postgres
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=sua_senha_segura
DATABASE_URL=postgresql://raceflow_user:sua_senha_segura@raceflow-postgres:5432/raceflow_db
JWT_SECRET=seu_jwt_secret_super_seguro
JWT_EXPIRES_IN=7d
API_PORT=3001
API_URL=https://raceflow-backend-xxxxx.easypanel.host
CORS_ORIGIN=https://raceflow-frontend-xxxxx.easypanel.host
NODE_ENV=production
```

---

## 💻 Para Desenvolvimento Local

### Frontend:
1. Copie `frontend.env.example` para `.env` na raiz
2. Ou use os valores padrão (já funcionam para desenvolvimento)

### Backend:
1. Copie `backend/env.example` para `backend/.env`
2. Ajuste as variáveis conforme necessário

---

## ⚠️ Importante

- **NUNCA** commite arquivos `.env` no Git (já estão no `.gitignore`)
- Use `.env.example` como template
- Em produção (Easypanel), configure as variáveis diretamente no painel
- As variáveis do frontend são usadas **durante o build**, não em runtime
- As variáveis do backend são usadas **em runtime**

