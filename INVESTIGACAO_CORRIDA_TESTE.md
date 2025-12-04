# Investigação - Evento "Corrida Teste" - Categorias não aparecem

## Problema
O evento "Corrida Teste" tem modalidades cadastradas, mas elas não aparecem no popup de inscrição.

## Logs Adicionados

### Backend
1. **`backend/src/controllers/eventCategoriesController.ts`**
   - Log quando o controller é chamado com o eventId
   - Log com quantidade de categorias encontradas
   - Log com dados completos das categorias

2. **`backend/src/services/eventCategoriesService.ts`**
   - Log quando o serviço é chamado
   - Log com quantidade de linhas retornadas pela query SQL
   - Log com dados brutos (raw rows)
   - Log com categorias mapeadas

### Frontend
1. **`src/lib/api/eventCategories.ts`**
   - Log quando a função é chamada
   - Log com a resposta completa (success, data, error)

2. **`src/pages/EventDetails.tsx`**
   - Log quando categorias são carregadas
   - Warning se não houver categorias

3. **`src/components/event/RegistrationFlow.tsx`**
   - Log quando o modal abre
   - Log com todas as props recebidas (event, categories, kits)

## Como Investigar

### Passo 1: Verificar Console do Navegador
1. Abra o console do navegador (F12)
2. Navegue até o evento "Corrida Teste"
3. Clique em "Fazer Inscrição"
4. Procure pelos seguintes logs:

```
📡 getEventCategories called with eventId: <id>
🌐 Making request: { url: ..., endpoint: '/events/.../categories' }
✅ Response received: { status: 200, ... }
📡 getEventCategories response: { success: true, dataLength: X, data: [...] }
📋 Categories loaded: [...]
🔍 RegistrationFlow opened: { categoriesCount: X, categories: [...] }
```

### Passo 2: Verificar Logs do Backend
1. Abra o terminal onde o backend está rodando
2. Procure pelos seguintes logs:

```
🔍 getEventCategoriesController called with eventId: <id>
🔍 getEventCategories called with eventId: <id>
📋 SQL query returned X rows
📋 Raw rows: [...]
📋 Mapped categories: [...]
📋 Categories found: X categories
```

### Passo 3: Verificar Banco de Dados
Execute o script `debug_corrida_teste.sql` para verificar:
1. Se o evento existe
2. Se o evento tem categorias cadastradas
3. Se há algum problema com os dados

### Passo 4: Verificar Network Tab
1. Abra o DevTools (F12)
2. Vá para a aba Network
3. Filtre por "categories"
4. Clique em "Fazer Inscrição"
5. Verifique:
   - Se a requisição foi feita
   - Status da resposta (200, 404, 500)
   - Conteúdo da resposta (Preview ou Response)

## Possíveis Causas

### 1. Evento não encontrado
- O eventId pode estar incorreto
- O evento pode não existir no banco

### 2. Categorias não cadastradas
- O evento pode não ter categorias na tabela `event_categories`
- Verificar com: `SELECT * FROM event_categories WHERE event_id = '<id>'`

### 3. Problema na Query SQL
- A query pode estar retornando 0 linhas
- Verificar se o `event_id` está correto na tabela

### 4. Problema na API Response
- A resposta pode estar vindo vazia
- Verificar se o formato da resposta está correto

### 5. Problema no Frontend
- As categorias podem estar sendo carregadas mas não renderizadas
- Verificar se o array está vazio no componente

## Próximos Passos

1. **Executar os logs** e verificar o que aparece no console
2. **Verificar o banco de dados** usando o script SQL
3. **Testar a API diretamente** usando curl ou Postman:
   ```bash
   curl http://localhost:3001/api/events/<eventId>/categories
   ```
4. **Verificar se há erro de CORS** ou problema de autenticação

## Arquivos Modificados

- ✅ `backend/src/controllers/eventCategoriesController.ts` - Logs adicionados
- ✅ `backend/src/services/eventCategoriesService.ts` - Logs adicionados
- ✅ `src/lib/api/eventCategories.ts` - Logs adicionados
- ✅ `src/pages/EventDetails.tsx` - Logs adicionados (já estava)
- ✅ `src/components/event/RegistrationFlow.tsx` - Logs adicionados (já estava)

## Comandos Úteis

```sql
-- Encontrar evento "Corrida Teste"
SELECT id, title, status FROM events WHERE title ILIKE '%corrida teste%';

-- Ver categorias do evento (substitua <event_id>)
SELECT * FROM event_categories WHERE event_id = '<event_id>';

-- Verificar se há registros
SELECT COUNT(*) FROM registrations WHERE event_id = '<event_id>';
```

```bash
# Testar endpoint diretamente
curl http://localhost:3001/api/events/<eventId>/categories

# Com autenticação (se necessário)
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/events/<eventId>/categories
```



