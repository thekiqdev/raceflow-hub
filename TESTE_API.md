# 🧪 Teste Rápido da API

## Verificar se o Backend está rodando

### 1. Teste no navegador
Abra estas URLs no navegador:

- **Health Check:** http://localhost:3001/api/health
- **Home Page Settings:** http://localhost:3001/api/home-page-settings

Se você ver JSON, o backend está funcionando! ✅

### 2. Teste com curl (PowerShell)
```powershell
# Health check
curl http://localhost:3001/api/health

# Home page settings
curl http://localhost:3001/api/home-page-settings
```

### 3. Verificar se o backend está rodando
No terminal onde você iniciou o backend, você deve ver:
```
🚀 Server running on http://localhost:3001
📊 Health check: http://localhost:3001/api/health
```

### 4. Se o backend não estiver rodando
```bash
cd backend
npm run dev
```

## Problemas Comuns

### "Failed to fetch"
- ✅ Backend não está rodando → Inicie com `npm run dev` na pasta `backend/`
- ✅ CORS bloqueando → Já corrigido para aceitar porta 8080
- ✅ Porta 3001 ocupada → Verifique se outra aplicação está usando a porta

### "Connection refused"
- ✅ Backend não está rodando
- ✅ Docker não está rodando (para PostgreSQL)

### Verificar porta do frontend
O frontend pode estar rodando em:
- `http://localhost:5173` (Vite padrão)
- `http://localhost:8080` (outra configuração)
- `http://localhost:3000` (outra configuração)

O CORS agora aceita todas essas portas! ✅





