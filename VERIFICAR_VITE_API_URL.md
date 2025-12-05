# 🔍 Como Verificar se VITE_API_URL Está Configurada Corretamente

## ⚠️ Problema Comum

O frontend ainda está usando `http://localhost:3001/api` mesmo após configurar a variável.

## ✅ Solução Passo a Passo

### 1. Verificar Variável no Easypanel

1. No Easypanel, acesse o serviço **Frontend** (`crono-front`)
2. Vá em **Environment Variables** ou **Variáveis de Ambiente**
3. Verifique se existe:
   ```
   VITE_API_URL=https://cronoteam-crono-back.e758qe.easypanel.host/api
   ```

**⚠️ IMPORTANTE**: 
- Nome exato: `VITE_API_URL` (não `VITE_API_URL_` ou similar)
- Valor: `https://cronoteam-crono-back.e758qe.easypanel.host/api` (com `https://` e `/api` no final)
- Sem espaços extras antes ou depois

### 2. Fazer Rebuild Completo

**CRÍTICO**: Variáveis `VITE_*` são injetadas durante o BUILD, não em runtime!

1. No Easypanel, vá ao serviço Frontend
2. Clique em **Rebuild** ou **Redeploy**
3. Aguarde o build completar (pode levar alguns minutos)

**❌ NÃO funciona:**
- Apenas reiniciar o serviço
- Apenas adicionar a variável sem rebuild

**✅ Funciona:**
- Adicionar variável → Fazer rebuild completo

### 3. Verificar no Código Compilado

Após o rebuild, você pode verificar se a variável foi injetada:

1. Acesse o frontend: `https://cronoteam-crono-front.e758qe.easypanel.host`
2. Abra o Console do navegador (F12)
3. Procure por requisições na aba **Network**
4. Verifique a URL das requisições:

**✅ CORRETO:**
```
https://cronoteam-crono-back.e758qe.easypanel.host/api/home-page-settings
```

**❌ ERRADO:**
```
http://localhost:3001/api/home-page-settings
```

### 4. Verificar no Source Code (Opcional)

Se quiser verificar diretamente no código compilado:

1. No navegador, abra DevTools (F12)
2. Vá na aba **Sources** ou **Fontes**
3. Procure pelo arquivo JavaScript principal (geralmente `index-*.js`)
4. Procure por `localhost:3001` ou `VITE_API_URL`

Se encontrar `localhost:3001` hardcoded, significa que o build foi feito antes de adicionar a variável.

## 🔧 Troubleshooting

### Problema: Variável adicionada mas ainda usa localhost

**Causa**: Build foi feito antes de adicionar a variável.

**Solução**: 
1. Verifique se a variável está salva no Easypanel
2. Faça um rebuild completo do frontend
3. Limpe o cache do navegador (Ctrl+Shift+R)

### Problema: Variável não aparece no build

**Causa**: Nome da variável está incorreto ou há espaços extras.

**Solução**:
- Verifique se está exatamente: `VITE_API_URL` (maiúsculas)
- Verifique se não há espaços antes/depois do valor
- Verifique se o valor começa com `https://` (não `http://`)

### Problema: Build falha após adicionar variável

**Causa**: Valor da variável pode ter caracteres especiais não escapados.

**Solução**:
- Use apenas a URL simples: `https://cronoteam-crono-back.e758qe.easypanel.host/api`
- Não use aspas no valor da variável no Easypanel
- Não use variáveis de ambiente dentro do valor (ex: `${API_URL}`)

## 📋 Checklist

- [ ] Variável `VITE_API_URL` adicionada no Easypanel (Frontend)
- [ ] Valor correto: `https://cronoteam-crono-back.e758qe.easypanel.host/api`
- [ ] Rebuild completo feito após adicionar variável
- [ ] Cache do navegador limpo (Ctrl+Shift+R)
- [ ] Console do navegador mostra URLs corretas (não localhost)
- [ ] Requisições funcionando no Network tab

## 🎯 Teste Rápido

Após o rebuild, no Console do navegador, você deve ver:

```javascript
// ✅ CORRETO
🌐 Making request: {
  url: 'https://cronoteam-crono-back.e758qe.easypanel.host/api/home-page-settings',
  ...
}

// ❌ ERRADO (ainda precisa de rebuild)
🌐 Making request: {
  url: 'http://localhost:3001/api/home-page-settings',
  ...
}
```

## 💡 Dica

Se após várias tentativas ainda não funcionar:

1. **Remova** a variável `VITE_API_URL` do Easypanel
2. Faça um rebuild
3. **Adicione** a variável novamente com o valor correto
4. Faça outro rebuild
5. Limpe o cache do navegador

Isso força uma reconstrução completa com a variável correta.

