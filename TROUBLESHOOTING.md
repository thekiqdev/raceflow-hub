# 🔧 Guia de Troubleshooting

## Erro: "Failed to fetch" ou "Network error"

Este erro geralmente indica que o frontend não consegue se conectar ao backend. Siga estes passos:

### 1. Verificar se o Backend está rodando

O backend deve estar rodando na porta **3001** por padrão.

**Verificar:**
```bash
# No terminal, execute:
curl http://localhost:3001/api/health
```

Ou abra no navegador: `http://localhost:3001/api/health`

**Se não estiver rodando, inicie o backend:**
```bash
cd backend
npm run dev
```

Você deve ver:
```
🚀 Server running on http://localhost:3001
📊 Health check: http://localhost:3001/api/health
```

### 2. Verificar variáveis de ambiente

**Frontend (.env na raiz do projeto):**
```env
VITE_API_URL=http://localhost:3001/api
```

**Backend (.env na pasta backend/):**
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=raceflow_password
API_PORT=3001
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=seu_jwt_secret_aqui
```

### 3. Verificar se o Docker está rodando

O PostgreSQL precisa estar rodando no Docker:

```bash
# Verificar se o container está rodando
docker ps

# Se não estiver, inicie:
docker-compose up -d
```

### 4. Verificar CORS

O backend deve permitir requisições do frontend. Verifique se o `CORS_ORIGIN` no backend está configurado para `http://localhost:5173` (ou a porta que o Vite está usando).

### 5. Verificar porta do frontend

O frontend geralmente roda na porta **5173** (Vite padrão). Se estiver em outra porta, atualize o `CORS_ORIGIN` no backend.

### 6. Verificar console do navegador

Abra o DevTools (F12) e verifique:
- **Console**: Mensagens de erro detalhadas
- **Network**: Se a requisição está sendo feita e qual é a resposta

### 7. Testar manualmente a API

Use o Postman, Insomnia ou curl para testar:

```bash
# Testar login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'
```

## Checklist rápido

- [ ] Backend está rodando? (`npm run dev` na pasta `backend/`)
- [ ] Docker está rodando? (`docker ps`)
- [ ] PostgreSQL está acessível? (`docker-compose ps`)
- [ ] Variável `VITE_API_URL` está configurada?
- [ ] Porta 3001 está livre?
- [ ] CORS está configurado corretamente?

## Erros comuns

### "Cannot connect to database"
- Verifique se o Docker está rodando
- Verifique as credenciais do PostgreSQL no `.env` do backend

### "JWT_SECRET is not defined"
- Adicione `JWT_SECRET` no `.env` do backend
- Use uma string aleatória segura

### "CORS error"
- Verifique se `CORS_ORIGIN` no backend corresponde à URL do frontend
- Verifique se o frontend está rodando na porta esperada

## Ainda com problemas?

1. Verifique os logs do backend no terminal
2. Verifique os logs do Docker: `docker-compose logs postgres`
3. Verifique o console do navegador (F12)
4. Teste a API diretamente com curl ou Postman





