# 🔧 Correção: Frontend não consegue conectar ao Backend

## ❌ Problema

O frontend está tentando se conectar a `http://localhost:3001/api` em vez da URL do backend no Easypanel.

**Erro no console:**
```
GET http://localhost:3001/api/home-page-settings net::ERR_CONNECTION_REFUSED
```

## ✅ Solução

### Passo 1: Identificar as URLs dos Serviços

No Easypanel, identifique as URLs dos seus serviços:

1. **Backend**: `https://cronoteam-crono-back.e758qe.easypanel.host`
2. **Frontend**: `https://cronoteam-crono-front.e758qe.easypanel.host`

### Passo 2: Configurar Variáveis de Ambiente do Frontend

1. No Easypanel, acesse o serviço **Frontend** (`crono-front`)
2. Vá em **Environment Variables** ou **Variáveis de Ambiente**
3. Adicione/Atualize a variável:

```env
VITE_API_URL=https://cronoteam-crono-back.e758qe.easypanel.host/api
```

**⚠️ IMPORTANTE**: 
- Use a URL do **backend** (não do frontend)
- Adicione `/api` no final
- Use `https://` (não `http://`)

### Passo 3: Configurar Variáveis de Ambiente do Backend

1. No Easypanel, acesse o serviço **Backend** (`crono-back`)
2. Vá em **Environment Variables**
3. Atualize as seguintes variáveis:

```env
# URL do próprio backend
API_URL=https://cronoteam-crono-back.e758qe.easypanel.host

# CORS: Permite requisições do frontend
CORS_ORIGIN=https://cronoteam-crono-front.e758qe.easypanel.host

# Ambiente
NODE_ENV=production
```

### Passo 4: Rebuild dos Serviços

Após atualizar as variáveis:

1. **Frontend**: Faça rebuild (as variáveis `VITE_*` são injetadas no build)
2. **Backend**: Reinicie o serviço (ou faça rebuild se necessário)

### Passo 5: Verificar

1. Acesse o frontend: `https://cronoteam-crono-front.e758qe.easypanel.host`
2. Abra o Console do navegador (F12)
3. Verifique se as requisições estão indo para a URL correta:
   - ✅ Correto: `https://cronoteam-crono-back.e758qe.easypanel.host/api/...`
   - ❌ Errado: `http://localhost:3001/api/...`

## 📋 Checklist de Configuração

### Frontend (`crono-front`)
- [ ] `VITE_API_URL=https://cronoteam-crono-back.e758qe.easypanel.host/api`
- [ ] Rebuild feito após adicionar variável

### Backend (`crono-back`)
- [ ] `API_URL=https://cronoteam-crono-back.e758qe.easypanel.host`
- [ ] `CORS_ORIGIN=https://cronoteam-crono-front.e758qe.easypanel.host`
- [ ] `NODE_ENV=production`
- [ ] Serviço reiniciado

## 🔍 Como Verificar se Está Correto

### No Console do Navegador

Após o rebuild do frontend, você deve ver:

```javascript
// ✅ CORRETO
🌐 Making request: {
  url: 'https://cronoteam-crono-back.e758qe.easypanel.host/api/home-page-settings',
  method: 'GET',
  ...
}

// ❌ ERRADO (ainda usando localhost)
🌐 Making request: {
  url: 'http://localhost:3001/api/home-page-settings',
  method: 'GET',
  ...
}
```

### Teste Manual

No navegador, acesse diretamente:
```
https://cronoteam-crono-back.e758qe.easypanel.host/api/health
```

Deve retornar:
```json
{
  "status": "ok",
  "timestamp": "...",
  "database": "connected"
}
```

## ⚠️ Notas Importantes

1. **Variáveis `VITE_*`**: São injetadas durante o **build** do frontend. Se você adicionar depois do build, precisa fazer rebuild.

2. **CORS**: O backend precisa ter `CORS_ORIGIN` configurado com a URL exata do frontend, caso contrário as requisições serão bloqueadas.

3. **HTTPS**: Use sempre `https://` em produção. O Easypanel fornece SSL automaticamente.

4. **Porta**: Não precisa especificar porta nas URLs do Easypanel (já vem no domínio).

## 🐛 Troubleshooting

### Frontend ainda usando localhost após rebuild

- Verifique se a variável está escrita corretamente: `VITE_API_URL` (não `VITE_API_URL_` ou similar)
- Verifique se fez rebuild completo (não apenas restart)
- Limpe o cache do navegador (Ctrl+Shift+R)

### CORS bloqueando requisições

- Verifique se `CORS_ORIGIN` no backend inclui a URL exata do frontend
- Verifique se não há espaços extras na URL
- Reinicie o backend após atualizar `CORS_ORIGIN`

### Backend não responde

- Verifique se o backend está rodando (health check)
- Verifique se a URL está correta (sem typos)
- Verifique os logs do backend no Easypanel

