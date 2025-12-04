# 🌐 Guia de URLs no Easypanel

## 📋 Como Funciona

No Easypanel, **cada serviço App recebe automaticamente uma URL única**. Você não precisa criar serviços separados apenas para ter URLs diferentes.

## 🎯 Estrutura de Serviços

### 1. Backend (API)
- **Serviço**: `raceflow-backend`
- **URL Automática do Easypanel**: `https://raceflow-backend-xxxxx.easypanel.host`
- **OU Domínio Customizado**: `https://api.seudominio.com`

### 2. Frontend (Web)
- **Serviço**: `raceflow-frontend`
- **URL Automática do Easypanel**: `https://raceflow-frontend-xxxxx.easypanel.host`
- **OU Domínio Customizado**: `https://seudominio.com`

### 3. PostgreSQL
- **Serviço**: `raceflow-postgres`
- **Acesso Interno**: `raceflow-postgres:5432` (apenas dentro do Easypanel)
- **Não tem URL pública** (é um banco de dados interno)

## 🔧 Configuração das Variáveis

### Backend - Environment Variables

```env
# URL do próprio backend (use a URL que o Easypanel gerou)
API_URL=https://raceflow-backend-xxxxx.easypanel.host
# OU se tiver domínio customizado:
# API_URL=https://api.seudominio.com

# CORS: Permite requisições do frontend
# ⚠️ OBRIGATÓRIO em produção (sem isso, CORS bloqueia requisições do frontend)
CORS_ORIGIN=https://raceflow-frontend-xxxxx.easypanel.host
# OU se tiver domínio customizado:
# CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com
```

### Frontend - Environment Variables

```env
# URL do backend + /api
# ⚠️ OBRIGATÓRIO em produção (sem isso, frontend tenta conectar em localhost)
VITE_API_URL=https://raceflow-backend-xxxxx.easypanel.host/api
# OU se tiver domínio customizado:
# VITE_API_URL=https://api.seudominio.com/api
```

## 📝 Passo a Passo Prático

### 1. Criar Backend
1. Crie o serviço `raceflow-backend`
2. **Copie a URL** que o Easypanel gerou (ex: `https://raceflow-backend-abc123.easypanel.host`)
3. Configure as variáveis:
   ```env
   API_URL=https://raceflow-backend-abc123.easypanel.host
   CORS_ORIGIN=https://raceflow-frontend-xyz789.easypanel.host
   ```
   ⚠️ **Nota**: Você ainda não tem a URL do frontend, então pode deixar o CORS vazio temporariamente ou usar `*` para desenvolvimento.

### 2. Criar Frontend
1. Crie o serviço `raceflow-frontend`
2. **Copie a URL** que o Easypanel gerou (ex: `https://raceflow-frontend-xyz789.easypanel.host`)
3. Configure as variáveis:
   ```env
   VITE_API_URL=https://raceflow-backend-abc123.easypanel.host/api
   ```

### 3. Atualizar CORS no Backend
1. Volte ao serviço `raceflow-backend`
2. Atualize a variável `CORS_ORIGIN`:
   ```env
   CORS_ORIGIN=https://raceflow-frontend-xyz789.easypanel.host
   ```
3. Reinicie o serviço backend

## 🌍 Usando Domínios Customizados

Se você tiver domínios próprios:

### 1. Configurar Domínio no Backend
- No serviço `raceflow-backend`, vá em **Domains**
- Adicione: `api.seudominio.com`
- Configure o DNS apontando para o Easypanel

### 2. Configurar Domínio no Frontend
- No serviço `raceflow-frontend`, vá em **Domains**
- Adicione: `seudominio.com` e `www.seudominio.com`
- Configure o DNS apontando para o Easypanel

### 3. Atualizar Variáveis

**Backend:**
```env
API_URL=https://api.seudominio.com
CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com
```

**Frontend:**
```env
VITE_API_URL=https://api.seudominio.com/api
```

## ❓ Perguntas Frequentes

### Preciso criar um serviço separado só para a API?
**Não!** O backend JÁ É a API. Quando você cria o serviço `raceflow-backend`, ele automaticamente recebe uma URL e já funciona como API.

### Como descobrir a URL do meu serviço?
1. No Easypanel, vá para o serviço
2. Na página do serviço, você verá a URL na parte superior
3. Ou vá em **Domains** para ver todas as URLs configuradas

### Posso usar a mesma URL para frontend e backend?
**Não recomendado**, mas tecnicamente possível. O ideal é:
- Frontend: `seudominio.com`
- Backend: `api.seudominio.com`

### O que acontece se eu não configurar CORS corretamente?
O navegador bloqueará as requisições do frontend para o backend com erro de CORS.

### Posso usar `*` no CORS para desenvolvimento?
Sim, mas **NUNCA em produção**:
```env
CORS_ORIGIN=*  # Apenas para desenvolvimento/teste
```

## ✅ Checklist

- [ ] Backend criado e URL copiada
- [ ] Frontend criado e URL copiada
- [ ] `API_URL` no backend configurada com a URL do backend (opcional, mas recomendado)
- [ ] ⚠️ `CORS_ORIGIN` no backend configurada com a URL do frontend (**OBRIGATÓRIO em produção**)
- [ ] ⚠️ `VITE_API_URL` no frontend configurada com a URL do backend + `/api` (**OBRIGATÓRIO em produção**)
- [ ] Testado acesso ao frontend
- [ ] Testado se o frontend consegue fazer requisições para o backend

**⚠️ IMPORTANTE**: Sem `CORS_ORIGIN` e `VITE_API_URL` configurados, a aplicação não funcionará em produção!

## 🔍 Exemplo Completo

### URLs Geradas pelo Easypanel:
- Backend: `https://raceflow-backend-abc123.easypanel.host`
- Frontend: `https://raceflow-frontend-xyz789.easypanel.host`

### Variáveis do Backend:
```env
API_URL=https://raceflow-backend-abc123.easypanel.host
CORS_ORIGIN=https://raceflow-frontend-xyz789.easypanel.host
```

### Variáveis do Frontend:
```env
VITE_API_URL=https://raceflow-backend-abc123.easypanel.host/api
```

### Resultado:
- ✅ Frontend acessível em: `https://raceflow-frontend-xyz789.easypanel.host`
- ✅ API acessível em: `https://raceflow-backend-abc123.easypanel.host/api`
- ✅ Frontend consegue fazer requisições para a API

