# Kit não salva ao cadastrar novo evento

## Resumo

Ao criar um novo evento com categorias e kit (associando o kit a uma categoria), o sync de kits falhava com **400 Bad Request** e mensagem **"Validation Error"**, e o kit não era gravado.

## Causa raiz

1. **Categorias novas sem `id` no estado**  
   No fluxo de criação de evento, ao adicionar uma categoria em `EventFormDialog` (`addCategory`), o objeto da categoria **não recebe `id`** (fica `undefined`), pois o id só existe após o POST no backend.

2. **Associação kit ↔ categoria antes do save**  
   Na aba Kits, o usuário pode marcar em quais categorias o kit está disponível. O checkbox usa `category.id` como valor. Para uma categoria recém-adicionada, `category.id` é `undefined`.

3. **`category_ids` com valor inválido**  
   Ao marcar o kit para essa categoria, o estado do kit fica com `category_ids: [undefined]`. Na hora do submit, esse array é enviado no payload de sync dos kits. Em JSON, `undefined` vira `null`, então a API recebe `category_ids: [null]`.

4. **Validação no backend**  
   O endpoint `POST /api/events/:eventId/kits` (sync) valida cada kit com Zod:  
   `category_ids: z.array(z.string().uuid('ID da categoria inválido')).optional()`.  
   Um array contendo `null` não é um array de UUIDs, então a validação falha e o servidor responde **400 Validation Error**. O kit não é salvo.

## Evidência no log

```json
"kits": [{
  "name": "padrão",
  "description": "teste",
  "price": 0,
  "display_order": 0,
  "category_ids": [null],
  "products": []
}]
```

```text
POST /events/3cb29be2-.../kits → 400 (Bad Request)
Error syncing kits: Validation Error
```

## Solução implementada

1. **Sanitização de `category_ids` no frontend (EventFormDialog)**  
   Ao montar o payload de sync dos kits:
   - Considera válido apenas string que seja UUID e não comece com `temp-`.
   - Remove `null`, `undefined`, strings vazias e ids temporários.

2. **Mapeamento por posição quando o id ainda não existe**  
   Como as categorias são criadas e recarregadas na mesma ordem, antes de montar o payload de kits o frontend busca de novo as categorias do evento (`getCategories(eventId)`). Para cada `category_ids` do kit:
   - Se o item na posição `i` for inválido (ex.: `undefined`), usa o id da categoria na mesma posição `i` da lista de categorias já salvas.
   - Assim, “kit associado à primeira categoria (ainda sem id)” vira “kit associado ao id da primeira categoria após o reload”.

3. **Função `validCategoryIds`**  
   - Usa `isValidId` para decidir se um item do array é um UUID válido.
   - Aplica o mapeamento por posição com a lista de categorias salvas.
   - Retorna `undefined` quando não sobrar nenhum id válido (evita enviar `[]` ou `[null]`).

Com isso, o sync de kits passa a enviar apenas UUIDs válidos (ou `undefined` quando não há associação), a validação do backend passa e o kit é salvo corretamente, inclusive quando associado a categorias recém-criadas no mesmo formulário.

## Arquivos alterados

- `src/components/organizer/EventFormDialog.tsx`
  - No bloco “Sync kits”: busca de categorias do evento, `isValidId`, `validCategoryIds` com mapeamento por posição e uso de `validCategoryIds(kit.category_ids)` no payload de cada kit.

## Referência de validação no backend

- `backend/src/controllers/eventKitsController.ts`: schema do sync com  
  `category_ids: z.array(z.string().uuid('ID da categoria inválido')).optional()`.
