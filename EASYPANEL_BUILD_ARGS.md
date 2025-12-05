# 🔧 Configurar Build Arguments no Easypanel

## ❌ Problema

O frontend não está recebendo a variável `VITE_API_URL` durante o build, mesmo estando configurada nas Environment Variables.

## ✅ Solução

No Easypanel, as variáveis `VITE_*` precisam ser passadas como **Build Arguments** durante o build do Docker, não apenas como Environment Variables.

## 📋 Passo a Passo no Easypanel

### 1. Acessar Configurações do Serviço Frontend

1. No Easypanel, acesse o serviço **Frontend** (`crono-front`)
2. Vá em **Settings** ou **Configurações**
3. Procure por **Build Arguments** ou **Build Environment Variables**

### 2. Adicionar Build Argument

Adicione o seguinte Build Argument:

```
Nome: VITE_API_URL
Valor: https://cronoteam-crono-back.e758qe.easypanel.host/api
```

**⚠️ IMPORTANTE:**
- O nome deve ser exatamente `VITE_API_URL`
- O valor deve ser a URL completa do backend + `/api`
- Use `https://` (não `http://`)

### 3. Verificar Environment Variables (também necessário)

Além do Build Argument, mantenha a variável nas **Environment Variables**:

```
Nome: VITE_API_URL
Valor: https://cronoteam-crono-back.e758qe.easypanel.host/api
```

### 4. Fazer Rebuild

Após configurar:
1. Faça **rebuild completo** do serviço frontend
2. Aguarde o build terminar
3. Verifique os logs do build para confirmar que a variável foi passada

## 🔍 Como Verificar se Funcionou

### Nos Logs do Build

Procure nos logs do build por:
```
VITE_API_URL=https://cronoteam-crono-back.e758qe.easypanel.host/api
```

### No Console do Navegador

Após o rebuild, no console do navegador:
```javascript
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
```

Deve mostrar: `https://cronoteam-crono-back.e758qe.easypanel.host/api`

### Nas Requisições

As requisições devem ir para:
```
https://cronoteam-crono-back.e758qe.easypanel.host/api/...
```

**NÃO** para:
```
http://localhost:3001/api/...
```

## 🆘 Se Easypanel Não Tiver Build Arguments

Se o Easypanel não tiver uma opção específica de "Build Arguments", tente:

1. **Usar Environment Variables com prefixo correto**: Algumas plataformas passam automaticamente variáveis `VITE_*` como build args
2. **Verificar se há seção "Build Environment"**: Alguns painéis têm uma seção separada para variáveis de build
3. **Usar docker-compose ou configuração avançada**: Se disponível, configure via docker-compose ou configuração YAML

## 📝 Nota Técnica

O Dockerfile foi atualizado para aceitar `VITE_API_URL` como ARG:

```dockerfile
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
```

Isso permite que o Easypanel passe a variável durante o build, e o Vite a use para gerar o código JavaScript com a URL correta.

