# Plano de Implementação: Ordenação de Modalidades, Categorias e Kits

## Objetivo
Permitir que organizadores definam e alterem a ordem de exibição de modalidades, categorias e kits nos eventos, garantindo que sejam exibidos exatamente na ordem definida pelo organizador.

## Situação Atual

### Modalidades
- **Ordenação atual**: `ORDER BY name ASC` (alfabética por nome)
- **Arquivo**: `backend/src/services/modalitiesService.ts` (linha 38)
- **Tabela**: `modalities`

### Categorias
- **Ordenação atual**: `ORDER BY c.name ASC` (alfabética por nome)
- **Arquivo**: `backend/src/services/categoriesService.ts` (linhas 19 e 52)
- **Tabela**: `categories`

### Kits
- **Ordenação atual**: `ORDER BY price ASC, name ASC` (por preço, depois por nome)
- **Arquivo**: `backend/src/services/eventKitsService.ts` (linha 40)
- **Tabela**: `event_kits`

## Estrutura da Solução

### Campo de Ordenação
Adicionar um campo `display_order` (INTEGER) em cada tabela:
- `modalities.display_order`
- `categories.display_order`
- `event_kits.display_order`

### Comportamento
- O campo `display_order` será único por evento (não global)
- Valores começam em 1 e incrementam sequencialmente
- Ao ordenar, atualizar os valores de `display_order` de todos os itens afetados
- A ordenação será aplicada em todas as consultas que listam esses itens

---

## ETAPA 1: Migração do Banco de Dados

### 1.1 Criar Migration para Modalidades

**Arquivo**: `backend/migrations/047_add_display_order_to_modalities.sql`

```sql
-- Migration 047: Add display_order to modalities
-- Adicionar campo display_order na tabela modalities para permitir ordenação customizada

-- 1. Adicionar coluna display_order
ALTER TABLE public.modalities 
ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

-- 2. Inicializar display_order com base na ordem atual (name ASC)
-- Usar ROW_NUMBER() para gerar valores sequenciais por evento
UPDATE public.modalities m
SET display_order = sub.row_num
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY name ASC) as row_num
  FROM public.modalities
) sub
WHERE m.id = sub.id;

-- 3. Tornar a coluna NOT NULL após inicialização
ALTER TABLE public.modalities 
ALTER COLUMN display_order SET NOT NULL;

-- 4. Criar índice composto para melhor performance nas consultas ordenadas
CREATE INDEX IF NOT EXISTS idx_modalities_event_display_order 
ON public.modalities(event_id, display_order);

-- 5. Adicionar comentário
COMMENT ON COLUMN public.modalities.display_order IS 'Ordem de exibição da modalidade no evento. Valores menores aparecem primeiro.';
```

### 1.2 Criar Migration para Categorias

**Arquivo**: `backend/migrations/048_add_display_order_to_categories.sql`

```sql
-- Migration 048: Add display_order to categories
-- Adicionar campo display_order na tabela categories para permitir ordenação customizada

-- 1. Adicionar coluna display_order
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

-- 2. Inicializar display_order com base na ordem atual (name ASC)
UPDATE public.categories c
SET display_order = sub.row_num
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY name ASC) as row_num
  FROM public.categories
) sub
WHERE c.id = sub.id;

-- 3. Tornar a coluna NOT NULL após inicialização
ALTER TABLE public.categories 
ALTER COLUMN display_order SET NOT NULL;

-- 4. Criar índice composto
CREATE INDEX IF NOT EXISTS idx_categories_event_display_order 
ON public.categories(event_id, display_order);

-- 5. Adicionar comentário
COMMENT ON COLUMN public.categories.display_order IS 'Ordem de exibição da categoria no evento. Valores menores aparecem primeiro.';
```

### 1.3 Criar Migration para Kits

**Arquivo**: `backend/migrations/049_add_display_order_to_event_kits.sql`

```sql
-- Migration 049: Add display_order to event_kits
-- Adicionar campo display_order na tabela event_kits para permitir ordenação customizada

-- 1. Adicionar coluna display_order
ALTER TABLE public.event_kits 
ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

-- 2. Inicializar display_order com base na ordem atual (price ASC, name ASC)
UPDATE public.event_kits ek
SET display_order = sub.row_num
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY price ASC, name ASC) as row_num
  FROM public.event_kits
) sub
WHERE ek.id = sub.id;

-- 3. Tornar a coluna NOT NULL após inicialização
ALTER TABLE public.event_kits 
ALTER COLUMN display_order SET NOT NULL;

-- 4. Criar índice composto
CREATE INDEX IF NOT EXISTS idx_event_kits_event_display_order 
ON public.event_kits(event_id, display_order);

-- 5. Adicionar comentário
COMMENT ON COLUMN public.event_kits.display_order IS 'Ordem de exibição do kit no evento. Valores menores aparecem primeiro.';
```

### 1.4 Atualizar Script de Migrações

**Arquivo**: `backend/scripts/run-migrations.ts`

Adicionar as novas migrations na lista de execução:
- `047_add_display_order_to_modalities.sql`
- `048_add_display_order_to_categories.sql`
- `049_add_display_order_to_event_kits.sql`

---

## ETAPA 2: Atualizar Types/Interfaces (Backend)

### 2.1 Atualizar Interface Modality

**Arquivo**: `backend/src/types/index.ts`

```typescript
export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  display_order: number; // Adicionar
  created_at: Date;
  updated_at: Date;
}

export interface CreateModalityData {
  event_id: string;
  name: string;
  distance: string;
  display_order?: number; // Opcional na criação
}

export interface UpdateModalityData {
  name?: string;
  distance?: string;
  display_order?: number; // Adicionar
}
```

### 2.2 Atualizar Interface Category

**Arquivo**: `backend/src/types/index.ts`

```typescript
export interface Category {
  id: string;
  event_id: string;
  name: string;
  price: number;
  category_type: string;
  gender: string;
  min_age: number | null;
  max_participants: number | null;
  is_default: boolean;
  display_order: number; // Adicionar
  created_at: Date;
  updated_at: Date;
  modality_ids: string[];
}

export interface CreateCategoryData {
  event_id: string;
  name: string;
  price: number;
  category_type: string;
  gender: string;
  min_age?: number | null;
  max_participants?: number | null;
  is_default?: boolean;
  display_order?: number; // Opcional na criação
  modality_ids?: string[];
}

export interface UpdateCategoryData {
  name?: string;
  price?: number;
  category_type?: string;
  gender?: string;
  min_age?: number | null;
  max_participants?: number | null;
  is_default?: boolean;
  display_order?: number; // Adicionar
  modality_ids?: string[];
}
```

### 2.3 Atualizar Interface EventKit

**Arquivo**: `backend/src/services/eventKitsService.ts`

```typescript
export interface EventKit {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  display_order: number; // Adicionar
  created_at: Date | null;
  products?: KitProduct[];
}
```

---

## ETAPA 3: Atualizar Services (Backend)

### 3.1 Atualizar modalitiesService.ts

**Arquivo**: `backend/src/services/modalitiesService.ts`

**Mudanças**:

1. **getModalitiesByEvent**: Alterar `ORDER BY` para usar `display_order`
```typescript
export const getModalitiesByEvent = async (eventId: string): Promise<Modality[]> => {
  const result = await query(
    `SELECT * FROM modalities
     WHERE event_id = $1
     ORDER BY display_order ASC, name ASC`, // Alterado
    [eventId]
  );
  // ... resto do código
};
```

2. **createModality**: Calcular `display_order` automaticamente se não fornecido
```typescript
export const createModality = async (
  data: CreateModalityData
): Promise<Modality> => {
  // Se display_order não foi fornecido, calcular como próximo valor
  let displayOrder = data.display_order;
  if (displayOrder === undefined) {
    const maxResult = await query(
      `SELECT COALESCE(MAX(display_order), 0) as max_order 
       FROM modalities WHERE event_id = $1`,
      [data.event_id]
    );
    displayOrder = (maxResult.rows[0]?.max_order || 0) + 1;
  }

  const result = await query(
    `INSERT INTO modalities (event_id, name, distance, display_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.event_id, data.name, data.distance, displayOrder]
  );
  // ... resto do código
};
```

3. **updateModality**: Adicionar suporte para atualizar `display_order`
```typescript
export const updateModality = async (
  modalityId: string,
  data: UpdateModalityData
): Promise<Modality | null> => {
  // ... código existente ...
  
  if (data.display_order !== undefined) {
    fields.push(`display_order = $${paramIndex}`);
    values.push(data.display_order);
    paramIndex++;
  }
  
  // ... resto do código
};
```

4. **Adicionar função para reordenar modalidades**
```typescript
/**
 * Reorder modalities for an event
 * @param eventId Event ID
 * @param modalityOrders Array of { id, display_order } pairs
 */
export const reorderModalities = async (
  eventId: string,
  modalityOrders: Array<{ id: string; display_order: number }>
): Promise<void> => {
  // Validar que todos os IDs pertencem ao evento
  const ids = modalityOrders.map(m => m.id);
  const checkResult = await query(
    `SELECT id FROM modalities WHERE id = ANY($1::UUID[]) AND event_id = $2`,
    [ids, eventId]
  );
  
  if (checkResult.rows.length !== ids.length) {
    throw new Error('One or more modalities not found or belong to different event');
  }

  // Atualizar display_order em uma transação
  for (const { id, display_order } of modalityOrders) {
    await query(
      `UPDATE modalities SET display_order = $1, updated_at = NOW() WHERE id = $2`,
      [display_order, id]
    );
  }
};
```

### 3.2 Atualizar categoriesService.ts

**Arquivo**: `backend/src/services/categoriesService.ts`

**Mudanças similares**:

1. **getCategoriesByEvent**: Alterar `ORDER BY`
```typescript
ORDER BY c.display_order ASC, c.name ASC
```

2. **getCategoriesByModality**: Alterar `ORDER BY`
```typescript
ORDER BY c.display_order ASC, c.name ASC
```

3. **createCategory**: Calcular `display_order` automaticamente
4. **updateCategory**: Adicionar suporte para `display_order`
5. **Adicionar função `reorderCategories`** (similar à de modalidades)

### 3.3 Atualizar eventKitsService.ts

**Arquivo**: `backend/src/services/eventKitsService.ts`

**Mudanças similares**:

1. **getEventKits**: Alterar `ORDER BY`
```typescript
ORDER BY display_order ASC, price ASC, name ASC
```

2. **createEventKit**: Calcular `display_order` automaticamente
3. **updateEventKit**: Adicionar suporte para `display_order`
4. **Adicionar função `reorderEventKits`** (similar à de modalidades)

---

## ETAPA 4: Criar Controllers e Rotas (Backend)

### 4.1 Atualizar modalitiesController.ts

**Arquivo**: `backend/src/controllers/modalitiesController.ts`

**Adicionar endpoint para reordenar**:
```typescript
export const reorderModalitiesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { eventId } = req.params;
    const { modalityOrders } = req.body; // Array de { id, display_order }

    // Validar dados
    if (!Array.isArray(modalityOrders)) {
      return res.status(400).json({
        success: false,
        error: 'modalityOrders must be an array',
      });
    }

    await reorderModalities(eventId, modalityOrders);

    res.json({
      success: true,
      message: 'Modalities reordered successfully',
    });
  }
);
```

### 4.2 Atualizar categoriesController.ts

**Arquivo**: `backend/src/controllers/categoriesController.ts`

**Adicionar endpoint similar para reordenar categorias**

### 4.3 Atualizar eventKitsController.ts

**Arquivo**: `backend/src/controllers/eventKitsController.ts`

**Adicionar endpoint similar para reordenar kits**

### 4.4 Atualizar Rotas

**Arquivo**: `backend/src/routes/modalities.ts`
```typescript
router.put('/events/:eventId/reorder', authenticate, requireRole('organizer', 'admin'), reorderModalitiesController);
```

**Arquivo**: `backend/src/routes/categories.ts`
```typescript
router.put('/events/:eventId/reorder', authenticate, requireRole('organizer', 'admin'), reorderCategoriesController);
```

**Arquivo**: `backend/src/routes/eventKits.ts`
```typescript
router.put('/events/:eventId/reorder', authenticate, requireRole('organizer', 'admin'), reorderEventKitsController);
```

---

## ETAPA 5: Atualizar Types/Interfaces (Frontend)

### 5.1 Atualizar Interface Modality

**Arquivo**: `src/lib/api/modalities.ts`

```typescript
export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  display_order: number; // Adicionar
  created_at: string;
  updated_at: string;
}

export interface CreateModalityData {
  event_id: string;
  name: string;
  distance: string;
  display_order?: number; // Opcional
}

export interface UpdateModalityData {
  name?: string;
  distance?: string;
  display_order?: number; // Adicionar
}

export interface ReorderModalitiesData {
  modalityOrders: Array<{ id: string; display_order: number }>;
}

// Adicionar função API
export const reorderModalities = async (eventId: string, data: ReorderModalitiesData) => {
  return apiClient.put<void>(`/modalities/events/${eventId}/reorder`, data);
};
```

### 5.2 Atualizar Interface Category

**Arquivo**: `src/lib/api/categories.ts`

**Mudanças similares**: Adicionar `display_order` e função `reorderCategories`

### 5.3 Atualizar Interface EventKit

**Arquivo**: `src/lib/api/eventKits.ts`

**Mudanças similares**: Adicionar `display_order` e função `reorderEventKits`

---

## ETAPA 6: Implementar UI de Ordenação (Frontend)

### 6.1 Instalar Biblioteca de Drag and Drop

**Opção 1**: `@dnd-kit/core` e `@dnd-kit/sortable` (recomendado)
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Opção 2**: `react-beautiful-dnd` (alternativa)

### 6.2 Criar Componente SortableList

**Arquivo**: `src/components/ui/sortable-list.tsx`

Componente genérico para listas ordenáveis usando `@dnd-kit`.

### 6.3 Atualizar EventFormDialog - Aba Modalidades

**Arquivo**: `src/components/organizer/EventFormDialog.tsx`

**Mudanças**:

1. **Importar biblioteca de drag and drop**
2. **Envolver lista de modalidades com SortableContext**
3. **Adicionar handlers de drag and drop**
4. **Adicionar função para salvar nova ordem**
5. **Adicionar botões de seta (alternativa ao drag and drop)**

**Estrutura**:
```typescript
// Adicionar estado para controlar ordenação
const [isReordering, setIsReordering] = useState(false);

// Função para mover modalidade para cima
const moveModalityUp = (index: number) => {
  if (index === 0) return;
  const updated = [...modalities];
  [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
  setModalities(updated);
};

// Função para mover modalidade para baixo
const moveModalityDown = (index: number) => {
  if (index === modalities.length - 1) return;
  const updated = [...modalities];
  [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
  setModalities(updated);
};

// Função para salvar ordem
const saveModalitiesOrder = async () => {
  const modalityOrders = modalities.map((m, index) => ({
    id: m.id,
    display_order: index + 1,
  }));
  
  await reorderModalities(eventId, { modalityOrders });
};
```

### 6.4 Atualizar EventFormDialog - Aba Categorias

**Arquivo**: `src/components/organizer/EventFormDialog.tsx`

**Mudanças similares** para categorias

### 6.5 Atualizar EventFormDialog - Aba Kits

**Arquivo**: `src/components/organizer/EventFormDialog.tsx`

**Mudanças similares** para kits

---

## ETAPA 7: Atualizar Visualização no Fluxo de Inscrição

### 7.1 Atualizar RegistrationFlow

**Arquivo**: `src/components/event/RegistrationFlow.tsx`

**Garantir que modalidades, categorias e kits sejam exibidos na ordem correta** (já deve funcionar automaticamente se os serviços estiverem retornando ordenados por `display_order`).

---

## ETAPA 8: Testes

### 8.1 Testes de Backend

- [ ] Testar criação de modalidade/categoria/kit sem `display_order` (deve calcular automaticamente)
- [ ] Testar criação com `display_order` específico
- [ ] Testar reordenação de múltiplos itens
- [ ] Testar que a ordem é mantida após atualizações
- [ ] Testar que a ordem é única por evento

### 8.2 Testes de Frontend

- [ ] Testar drag and drop de modalidades
- [ ] Testar botões de seta para mover itens
- [ ] Testar que a ordem é salva corretamente
- [ ] Testar que a ordem é exibida corretamente no fluxo de inscrição
- [ ] Testar em diferentes navegadores

---

## ETAPA 9: Documentação e Deploy

### 9.1 Atualizar Documentação

- Documentar o novo campo `display_order` nas interfaces
- Documentar os novos endpoints de reordenação

### 9.2 Deploy

- Executar migrations em produção
- Verificar que dados existentes foram migrados corretamente
- Testar funcionalidade em produção

---

## Resumo das Etapas

1. ✅ **ETAPA 1**: Migrações do banco de dados
2. ✅ **ETAPA 2**: Atualizar types/interfaces (backend)
3. ✅ **ETAPA 3**: Atualizar services (backend)
4. ✅ **ETAPA 4**: Criar controllers e rotas (backend)
5. ✅ **ETAPA 5**: Atualizar types/interfaces (frontend)
6. ✅ **ETAPA 6**: Implementar UI de ordenação (frontend)
7. ✅ **ETAPA 7**: Atualizar visualização no fluxo de inscrição
8. ✅ **ETAPA 8**: Testes
9. ✅ **ETAPA 9**: Documentação e deploy

---

## Notas Importantes

1. **Compatibilidade**: As migrations inicializam `display_order` com base na ordem atual, garantindo que dados existentes não sejam afetados.

2. **Performance**: Os índices compostos `(event_id, display_order)` garantem consultas rápidas.

3. **Validação**: Sempre validar que os itens pertencem ao evento correto antes de reordenar.

4. **Transações**: Considerar usar transações no banco para garantir consistência ao reordenar múltiplos itens.

5. **UI/UX**: Oferecer duas opções de ordenação:
   - Drag and drop (mais intuitivo)
   - Botões de seta (mais acessível)

---

## Próximos Passos

Após aprovação deste plano, começar pela **ETAPA 1** (Migrações do Banco de Dados).

