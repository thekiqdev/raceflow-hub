# Correção do Rate Limiter - Erro 429 (Too Many Requests)

## Problema Identificado
O backend estava retornando erro 429 (Too Many Requests) para requisições GET em `/api/events`, impedindo o carregamento de categorias e eventos.

## Causa
- A rota `/api/events` estava usando `writeRateLimiter` que permite apenas 50 requisições por 15 minutos
- Requisições GET (leitura) estavam sendo limitadas da mesma forma que requisições de escrita
- Durante o desenvolvimento, isso causava bloqueios frequentes

## Solução Implementada

### 1. Aumento de Limites em Desenvolvimento
- `writeRateLimiter`: 1000 requisições/15min em dev, 50 em produção
- `readRateLimiter`: 1000 requisições/15min em dev, 200 em produção

### 2. Rate Limiter Inteligente
Criado middleware `smartRateLimiter` que:
- Aplica limite restritivo (writeRateLimiter) para operações de escrita (POST, PUT, DELETE, PATCH)
- Aplica limite mais permissivo (readRateLimiter) para operações de leitura (GET)
- Diferencia automaticamente baseado no método HTTP

### 3. Aplicação nas Rotas
- `/api/events` - usa `smartRateLimiter`
- `/api/registrations` - usa `smartRateLimiter`
- `/api/auth` - continua usando `authRateLimiter` (mais restritivo)

## Arquivos Modificados

1. **`backend/src/middleware/rateLimiter.ts`**
   - Aumentado limite do `writeRateLimiter` em desenvolvimento
   - Removida função duplicada `writeOnlyRateLimiter`

2. **`backend/src/server.ts`**
   - Implementado `smartRateLimiter` que diferencia GET de write operations
   - Aplicado nas rotas `/api/events` e `/api/registrations`

## Como Testar

1. **Reinicie o backend** para aplicar as mudanças
2. **Teste o carregamento de eventos** - não deve mais retornar 429
3. **Teste o carregamento de categorias** - deve funcionar normalmente
4. **Verifique os logs** - não deve aparecer mais "Rate limit exceeded"

## Limites Atuais

### Desenvolvimento
- **GET requests** (leitura): 1000 req/15min
- **Write requests** (POST/PUT/DELETE): 1000 req/15min
- **Auth endpoints**: 100 req/15min

### Produção
- **GET requests** (leitura): 200 req/15min
- **Write requests** (POST/PUT/DELETE): 50 req/15min
- **Auth endpoints**: 5 req/15min

## Desabilitar Rate Limiter (Desenvolvimento)

Se ainda houver problemas, você pode desabilitar completamente o rate limiter em desenvolvimento:

1. Adicione ao arquivo `.env`:
   ```
   DISABLE_RATE_LIMIT=true
   ```

2. Reinicie o backend

## Próximos Passos

Após reiniciar o backend:
1. Teste o carregamento de categorias do evento "Corrida Teste"
2. Verifique se as categorias aparecem no modal de inscrição
3. Teste o carregamento de eventos no perfil do runner



