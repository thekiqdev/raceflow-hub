# 🔧 Solução: Erro 429 (Too Many Requests)

## ❌ Problema

Ao tentar fazer login, você recebe o erro:
```
POST https://cronoteam-crono-back.e758qe.easypanel.host/api/auth/login 429 (Too Many Requests)
```

## 🔍 Causa

O rate limiter está bloqueando requisições porque o limite para endpoints de autenticação (`/api/auth`) é muito restritivo em produção.

## ✅ Soluções

### Solução 1: Aguardar (Temporária)

O rate limiter reseta automaticamente após **15 minutos**. Aguarde e tente novamente.

### Solução 2: Reiniciar o Backend (Rápida)

No Easypanel:
1. Acesse o serviço **Backend** (`crono-back`)
2. Clique em **Restart** ou **Reiniciar**
3. Isso limpa o rate limiter em memória

### Solução 3: Desabilitar Rate Limiting Temporariamente (Para Testes)

No Easypanel, no serviço **Backend**, adicione a variável de ambiente:

```env
DISABLE_RATE_LIMIT=true
```

Depois, reinicie o backend.

**⚠️ IMPORTANTE**: Remova essa variável após os testes! Rate limiting é importante para segurança.

### Solução 4: Aumentar Limite (Já Implementado)

O código foi atualizado para aumentar o limite de **5 para 20 requisições** por 15 minutos em produção.

**Para aplicar:**
1. Faça rebuild do backend no Easypanel
2. Ou reinicie o serviço (se já tiver o código atualizado)

## 📊 Limites Atuais (Após Atualização)

| Endpoint | Ambiente | Limite | Janela |
|----------|----------|--------|--------|
| `/api/auth` | Desenvolvimento | 100 req | 15 min |
| `/api/auth` | Produção | **20 req** | 15 min |
| Outros | Desenvolvimento | 1000 req | 15 min |
| Outros | Produção | 200 req | 15 min |

## 🔄 Como Resetar o Rate Limiter

### Opção A: Reiniciar Backend
- No Easypanel, reinicie o serviço backend
- Isso limpa o rate limiter em memória

### Opção B: Aguardar
- O rate limiter reseta automaticamente após 15 minutos

### Opção C: Desabilitar Temporariamente
- Adicione `DISABLE_RATE_LIMIT=true` nas variáveis de ambiente
- Reinicie o backend
- **Lembre-se de remover após os testes!**

## ⚠️ Nota de Segurança

Rate limiting é importante para:
- Prevenir ataques de força bruta
- Proteger contra DDoS
- Limitar abuso da API

**NÃO desabilite em produção** a menos que seja temporário para testes.

## 🎯 Próximos Passos

1. **Imediato**: Reinicie o backend no Easypanel para limpar o rate limiter
2. **Após rebuild**: O limite aumentado (20 req) estará ativo
3. **Para testes**: Use `DISABLE_RATE_LIMIT=true` temporariamente

