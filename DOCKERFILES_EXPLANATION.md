# 🐳 Explicação dos Dockerfiles

## 📋 Resumo

**NÃO**, os Dockerfiles são **DIFERENTES** para frontend e backend. Cada um tem suas próprias necessidades.

## 🎯 Estrutura dos Dockerfiles

### 1. Frontend Dockerfile (`Dockerfile` na raiz)

**Localização**: `/Dockerfile`

**O que faz:**
- Usa Node.js para **build** do React/Vite
- Usa Nginx para **servir** os arquivos estáticos em produção
- Build em 2 estágios (multi-stage build):
  1. **Builder**: Compila o código React/Vite
  2. **Production**: Serve com Nginx

**Características:**
- Porta: `80` (HTTP padrão)
- Serve arquivos estáticos
- Configuração SPA (Single Page Application) no Nginx
- Não precisa de Node.js em runtime (só no build)

**Variáveis de ambiente necessárias:**
- `VITE_API_URL` (usado no build, não em runtime)

---

### 2. Backend Dockerfile (`backend/Dockerfile`)

**Localização**: `/backend/Dockerfile`

**O que faz:**
- Usa Node.js para **build** do TypeScript
- Usa Node.js para **executar** a aplicação em produção
- Build em 2 estágios (multi-stage build):
  1. **Builder**: Compila TypeScript para JavaScript
  2. **Production**: Executa o servidor Express

**Características:**
- Porta: `3001` (API)
- Executa servidor Node.js/Express
- Conecta ao PostgreSQL
- Precisa de Node.js em runtime

**Variáveis de ambiente necessárias:**
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

---

## 🔍 Diferenças Principais

| Aspecto | Frontend | Backend |
|---------|----------|---------|
| **Runtime** | Nginx | Node.js |
| **Porta** | 80 | 3001 |
| **Build** | Vite (React) | TypeScript |
| **Output** | Arquivos estáticos | Servidor Express |
| **Variáveis ENV** | 1 (`VITE_API_URL`) | 11+ variáveis |
| **Dependências** | Apenas no build | Build + Runtime |

---

## 📁 Estrutura de Arquivos

```
projeto/
├── Dockerfile                    # Frontend (React + Nginx)
├── nginx.conf                    # Configuração do Nginx
├── .env.example                  # Variáveis do Frontend
│
├── backend/
│   ├── Dockerfile               # Backend (Node.js + Express)
│   └── .env.example              # Variáveis do Backend
│
└── docker-compose.prod.yml      # Orquestração (opcional)
```

---

## 🚀 Por que são diferentes?

### Frontend:
- **Não precisa** de Node.js em produção
- **Apenas serve** arquivos HTML/CSS/JS estáticos
- Nginx é mais eficiente para servir arquivos estáticos
- Build acontece **uma vez** (não em cada requisição)

### Backend:
- **Precisa** de Node.js em produção
- **Executa** código JavaScript dinamicamente
- Processa requisições HTTP
- Conecta ao banco de dados
- Executa lógica de negócio

---

## ✅ Resumo

- ✅ **Frontend**: `Dockerfile` (raiz) → Nginx serve arquivos estáticos
- ✅ **Backend**: `backend/Dockerfile` → Node.js executa servidor Express
- ✅ **São diferentes** porque têm necessidades diferentes
- ✅ Cada um tem seu próprio `.env.example`

