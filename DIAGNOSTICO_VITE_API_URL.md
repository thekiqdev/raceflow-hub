# 🔍 Diagnóstico: VITE_API_URL não está funcionando

## ❌ Problema

O frontend continua usando `http://localhost:3001/api` mesmo após configurar a variável e fazer rebuild.

## 🔍 Diagnóstico Passo a Passo

### 1. Verificar se a Variável está Configurada no Easypanel

No Easypanel, no serviço **Frontend** (`crono-front`):

1. Vá em **Environment Variables**
2. Procure por `VITE_API_URL`
3. Verifique:
   - ✅ Nome exato: `VITE_API_URL` (com VITE_ no início, maiúsculas)
   - ✅ Valor: `https://cronoteam-crono-back.e758qe.easypanel.host/api`
   - ✅ Sem espaços extras
   - ✅ Usa `https://` (não `http://`)

### 2. Verificar se a Variável está Disponível no Build

No Easypanel, após fazer rebuild, verifique os **logs do build**:

Procure por algo como:
```
VITE_API_URL=https://cronoteam-crono-back.e758qe.easypanel.host/api
```

Ou verifique se há erros relacionados a variáveis de ambiente.

### 3. Verificar no Código Compilado

Após o rebuild, você pode verificar se a variável foi injetada:

1. No navegador, acesse: `https://cronoteam-crono-front.e758qe.easypanel.host`
2. Abra o DevTools (F12)
3. Vá na aba **Network**
4. Recarregue a página
5. Procure pelo arquivo JavaScript principal (ex: `index-Dodax68D.js`)
6. Clique nele e veja o código
7. Procure por `localhost:3001` - se encontrar, a variável não foi injetada

### 4. Teste Direto no Console do Navegador

No console do navegador, execute:

```javascript
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
```

**Resultado esperado:**
- ✅ Se mostrar `https://cronoteam-crono-back.e758qe.easypanel.host/api` → Variável está configurada
- ❌ Se mostrar `undefined` ou `http://localhost:3001/api` → Variável NÃO está configurada

## 🛠️ Soluções Possíveis

### Solução 1: Verificar Nome da Variável

No Easypanel, certifique-se de que o nome está **exatamente** assim:
```
VITE_API_URL
```

**NÃO use:**
- `vite_api_url` (minúsculas)
- `VITE_API_URL_` (com underscore no final)
- `VITE_API` (sem _URL)
- `API_URL` (sem VITE_)

### Solução 2: Verificar se o Build Usa a Variável

No Easypanel, ao fazer rebuild, verifique:

1. Os logs do build devem mostrar as variáveis de ambiente
2. Se não aparecer `VITE_API_URL` nos logs, ela não está sendo passada para o build

### Solução 3: Forçar Rebuild Limpo

No Easypanel:

1. Vá no serviço Frontend
2. Pare o serviço
3. Remova o cache (se houver opção)
4. Faça rebuild completo
5. Inicie o serviço

### Solução 4: Verificar Configuração do Vite

Se o problema persistir, pode ser necessário verificar o `vite.config.ts` para garantir que as variáveis estão sendo processadas corretamente.

## 📋 Checklist Completo

- [ ] Variável `VITE_API_URL` existe no Easypanel (serviço Frontend)
- [ ] Nome está exatamente `VITE_API_URL` (case-sensitive)
- [ ] Valor está correto: `https://cronoteam-crono-back.e758qe.easypanel.host/api`
- [ ] Variável foi salva (alguns painéis precisam clicar em "Save")
- [ ] Rebuild completo foi feito (não apenas restart)
- [ ] Logs do build mostram a variável
- [ ] Console do navegador mostra a variável correta
- [ ] Cache do navegador foi limpo

## 🆘 Se Nada Funcionar

### Alternativa: Hardcode Temporário (Apenas para Teste)

Se precisar testar rapidamente, podemos temporariamente hardcodar a URL no código. **⚠️ ATENÇÃO**: Isso é apenas para diagnóstico, não para produção!

Mas primeiro, vamos tentar descobrir por que a variável não está sendo injetada.

## 📞 Informações para Diagnóstico

Por favor, forneça:

1. **Screenshot ou texto** das variáveis de ambiente do frontend no Easypanel
2. **Logs do build** do frontend (último rebuild)
3. **Resultado do comando** no console do navegador:
   ```javascript
   console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
   ```

Com essas informações, posso ajudar a identificar exatamente onde está o problema.

