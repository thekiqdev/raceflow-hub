# 🔄 Como Resetar o Rate Limiter

## Problema: Erro 429 (Too Many Requests)

Se você está recebendo erro 429, significa que atingiu o limite de requisições.

## Solução Rápida

### Opção 1: Reiniciar o Backend (Recomendado)
O rate limiter é armazenado em memória, então reiniciar o backend limpa todos os contadores:

```bash
# Pare o backend (Ctrl+C)
# Depois inicie novamente:
cd backend
npm run dev
```

### Opção 2: Desabilitar Rate Limiter em Desenvolvimento

Adicione no arquivo `.env` do backend:

```env
DISABLE_RATE_LIMIT=true
```

Depois reinicie o backend.

### Opção 3: Aguardar 15 minutos

O limite expira automaticamente após 15 minutos.

## Limites Atuais

- **Autenticação**: 100 requisições por 15 minutos (desenvolvimento)
- **Outras rotas**: 100 requisições por 15 minutos (desenvolvimento)

Em produção, esses limites são mais restritivos.

## Para Desenvolvimento

Recomendado: Desabilitar o rate limiter adicionando no `.env`:

```env
DISABLE_RATE_LIMIT=true
```





