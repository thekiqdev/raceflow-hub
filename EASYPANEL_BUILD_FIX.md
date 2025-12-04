# 🔧 Correção do Build no Easypanel

## ❌ Problema Identificado

O build do backend está falhando porque está tentando instalar dependências do frontend (`react-day-picker`, `date-fns@4.1.0`).

**Erro:**
```
npm error ERESOLVE could not resolve
npm error While resolving: react-day-picker@8.10.1
npm error Found: date-fns@4.1.0
npm error Could not resolve dependency:
npm error peer date-fns@"^2.28.0 || ^3.0.0" from react-day-picker@8.10.1
```

## 🔍 Causa

O build context no Easypanel pode estar apontando para a **raiz do projeto** em vez da pasta `backend/`. Isso faz com que o Dockerfile tente copiar o `package.json` do frontend.

## ✅ Solução

### 1. Verificar Build Context no Easypanel

No Easypanel, certifique-se de que:
- **Build Context**: `/backend` (não `/` ou raiz)
- **Dockerfile**: `backend/Dockerfile`

### 2. Dockerfile Corrigido

O Dockerfile agora:
- Verifica se está usando o `package.json` correto (raceflow-backend)
- Usa apenas arquivos do backend
- Não tenta instalar dependências do frontend

### 3. .dockerignore Atualizado

O `.dockerignore` do backend agora exclui:
- Arquivos do frontend (se o build context for a raiz)
- `../package.json` (package.json do frontend)
- `../node_modules`
- `../src` (src do frontend)

## 🚀 Como Aplicar

1. **No Easypanel**, verifique a configuração do serviço backend:
   - Build Context: `/backend` ou `./backend`
   - Dockerfile: `backend/Dockerfile` ou `Dockerfile`

2. **Se o Build Context for a raiz** (`/`):
   - O `.dockerignore` já está configurado para excluir arquivos do frontend
   - O Dockerfile verifica o package.json correto

3. **Faça o rebuild** do serviço no Easypanel

## 📝 Configuração Recomendada no Easypanel

### Backend Service:
- **Source**: Repositório Git
- **Build Context**: `/backend` ou `./backend`
- **Dockerfile**: `Dockerfile` (se build context for `/backend`)
- **OU Dockerfile**: `backend/Dockerfile` (se build context for `/`)

### Frontend Service:
- **Source**: Repositório Git
- **Build Context**: `/` (raiz)
- **Dockerfile**: `Dockerfile`

## ⚠️ Importante

Se o problema persistir, verifique:
1. O build context está correto?
2. O Dockerfile está no caminho correto?
3. O `.dockerignore` está excluindo os arquivos corretos?

