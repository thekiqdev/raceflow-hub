# Plano de Implementação: Associação de Kits a Categorias

## Objetivo
Permitir que kits sejam associados a categorias específicas, fazendo com que cada kit apareça apenas nas categorias selecionadas durante a inscrição no evento. Um kit pode estar associado a múltiplas categorias.

---

## Fase 1: Backend - Estrutura de Dados

### 1.1 Migração do Banco de Dados
**Arquivo:** `backend/migrations/073_create_kit_categories.sql`

**Ações:**
- Criar tabela `kit_categories` com relacionamento many-to-many:
  - `kit_id` (UUID, FK para event_kits)
  - `category_id` (UUID, FK para categories)
  - `created_at` (TIMESTAMP)
  - Primary Key composta: (kit_id, category_id)
  - Foreign Keys com CASCADE DELETE
  - Índices para performance

**Estrutura:**
```sql
CREATE TABLE IF NOT EXISTS public.kit_categories (
  kit_id UUID NOT NULL,
  category_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (kit_id, category_id),
  CONSTRAINT fk_kit_categories_kit FOREIGN KEY (kit_id) 
    REFERENCES public.event_kits(id) ON DELETE CASCADE,
  CONSTRAINT fk_kit_categories_category FOREIGN KEY (category_id) 
    REFERENCES public.categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_kit_categories_kit_id ON public.kit_categories(kit_id);
CREATE INDEX IF NOT EXISTS idx_kit_categories_category_id ON public.kit_categories(category_id);
```

**Comportamento:**
- Se um kit não tiver associações, ele aparece em todas as categorias (compatibilidade retroativa)
- Se um kit tiver associações, ele aparece apenas nas categorias associadas

---

## Fase 2: Backend - Tipos e Interfaces

### 2.1 Atualizar Tipos TypeScript
**Arquivo:** `backend/src/types/index.ts`

**Alterações:**
- Adicionar `category_ids?: string[]` na interface `EventKit` (opcional para compatibilidade)

**Arquivo:** `backend/src/services/eventKitsService.ts`

**Alterações:**
- Adicionar `category_ids?: string[]` na interface `EventKit`
- Adicionar `category_ids?: string[]` na interface `SyncKitData`

---

## Fase 3: Backend - Serviços

### 3.1 Criar Serviço de Associação Kit-Categoria
**Arquivo:** `backend/src/services/kitCategoriesService.ts` (NOVO)

**Funções:**
1. `getKitCategories(kitId: string): Promise<string[]>` - Retorna IDs das categorias associadas ao kit
2. `getCategoryKits(categoryId: string): Promise<string[]>` - Retorna IDs dos kits associados à categoria
3. `associateKitToCategories(kitId: string, categoryIds: string[]): Promise<void>` - Associa kit a categorias (substitui associações existentes)
4. `removeKitCategoryAssociation(kitId: string, categoryId: string): Promise<void>` - Remove associação específica
5. `getKitsByCategory(categoryId: string, eventId: string): Promise<EventKit[]>` - Retorna kits disponíveis para uma categoria

**Lógica:**
- Se `categoryIds` estiver vazio ou `null`, remove todas as associações (kit fica disponível para todas as categorias)
- Se `categoryIds` tiver valores, substitui todas as associações existentes

### 3.2 Atualizar `eventKitsService.ts`
**Arquivo:** `backend/src/services/eventKitsService.ts`

**Alterações:**
1. `getEventKits(eventId: string, categoryId?: string): Promise<EventKit[]>`
   - Adicionar parâmetro opcional `categoryId`
   - Se `categoryId` fornecido, filtrar kits que estão associados à categoria OU não têm associações
   - Buscar `category_ids` de cada kit da tabela `kit_categories`

2. `syncEventKits(eventId: string, kits: SyncKitData[]): Promise<EventKit[]>`
   - Após criar/atualizar kits, processar `category_ids` de cada kit
   - Chamar `associateKitToCategories` para cada kit

3. `getEventKitById(kitId: string): Promise<EventKit | null>`
   - Incluir `category_ids` no retorno

---

## Fase 4: Backend - Controllers

### 4.1 Atualizar `eventKitsController.ts`
**Arquivo:** `backend/src/controllers/eventKitsController.ts`

**Alterações:**
1. `getEventKitsController`
   - Aceitar query parameter `category_id` (opcional)
   - Passar `category_id` para `getEventKits`

2. `syncEventKitsController`
   - Validar `category_ids` no schema Zod (array de UUIDs opcional)
   - Processar associações após criar/atualizar kits

3. `getEventKitByIdController`
   - Incluir `category_ids` na resposta

### 4.2 Criar Controller para Associações
**Arquivo:** `backend/src/controllers/kitCategoriesController.ts` (NOVO)

**Endpoints:**
- `GET /kits/:kitId/categories` - Listar categorias associadas ao kit
- `PUT /kits/:kitId/categories` - Atualizar associações do kit
- `GET /categories/:categoryId/kits` - Listar kits associados à categoria

---

## Fase 5: Backend - Rotas

### 5.1 Atualizar Rotas de Kits
**Arquivo:** `backend/src/routes/eventKits.ts`

**Alterações:**
- Atualizar rota GET `/events/:eventId/kits` para aceitar query `?category_id=xxx`

### 5.2 Criar Rotas de Associações
**Arquivo:** `backend/src/routes/kitCategories.ts` (NOVO)

**Rotas:**
- `GET /kits/:kitId/categories` - Listar categorias do kit
- `PUT /kits/:kitId/categories` - Atualizar categorias do kit
- `GET /categories/:categoryId/kits` - Listar kits da categoria

---

## Fase 6: Frontend - API Client

### 6.1 Atualizar API de Kits
**Arquivo:** `src/lib/api/eventKits.ts`

**Alterações:**
1. Adicionar `category_ids?: string[]` na interface `EventKit`
2. Adicionar `category_ids?: string[]` na interface `SyncKitData`
3. Atualizar `getEventKits` para aceitar parâmetro opcional `categoryId`:
   ```typescript
   export const getEventKits = async (eventId: string, categoryId?: string) => {
     const query = categoryId ? `?category_id=${categoryId}` : '';
     return apiClient.get<EventKit[]>(`/events/${eventId}/kits${query}`);
   };
   ```

### 6.2 Criar API de Associações Kit-Categoria
**Arquivo:** `src/lib/api/kitCategories.ts` (NOVO)

**Funções:**
- `getKitCategories(kitId: string)` - Listar categorias do kit
- `updateKitCategories(kitId: string, categoryIds: string[])` - Atualizar categorias do kit
- `getCategoryKits(categoryId: string)` - Listar kits da categoria

---

## Fase 7: Frontend - Componentes de Administração

### 7.1 Atualizar Formulário de Kits (Admin)
**Arquivo:** `src/components/admin/EventViewEditDialog.tsx`

**Alterações:**
1. Adicionar campo de seleção múltipla de categorias no formulário de kit
2. Componente: `MultiSelect` ou `CheckboxGroup` para selecionar categorias
3. Carregar categorias do evento ao abrir formulário de kit
4. Salvar `category_ids` ao criar/atualizar kit
5. Carregar `category_ids` ao editar kit existente

**UI:**
- Checkbox "Disponível para todas as categorias" (se não selecionar nenhuma)
- Lista de checkboxes com todas as categorias do evento
- Mostrar quantas categorias estão selecionadas

### 7.2 Atualizar Formulário de Kits (Organizador)
**Arquivo:** `src/components/organizer/EventFormDialog.tsx`

**Alterações:**
- Mesmas alterações do componente Admin
- Permitir que organizador associe kits a categorias específicas

---

## Fase 8: Frontend - Fluxo de Inscrição

### 8.1 Atualizar RegistrationFlow
**Arquivo:** `src/components/event/RegistrationFlow.tsx`

**Alterações:**
1. Ao selecionar categoria (step 3), filtrar kits disponíveis:
   - Chamar `getEventKits(eventId, selectedCategory.id)` ao invés de `getEventKits(eventId)`
   - Atualizar estado `kits` com kits filtrados

2. Lógica de filtro:
   - Se kit não tem `category_ids` ou `category_ids` está vazio → aparece em todas
   - Se kit tem `category_ids` → aparece apenas se categoria selecionada estiver na lista

3. Atualizar useEffect que carrega kits:
   ```typescript
   useEffect(() => {
     if (selectedCategory) {
       loadKitsForCategory(selectedCategory.id);
     }
   }, [selectedCategory]);
   ```

### 8.2 Atualizar Inscrição Manual do Organizador
**Arquivo:** `src/components/organizer/OrganizerRegistrations.tsx`

**Alterações:**
- Ao selecionar categoria no dialog de inscrição manual, filtrar kits disponíveis
- Usar `getEventKits(selectedEventId, selectedCategoryId)` quando categoria for selecionada

---

## Fase 9: Backend - Compatibilidade Retroativa

### 9.1 Lógica de Compatibilidade
**Regra:**
- Se `kit_categories` não tem registros para um kit → kit aparece em todas as categorias
- Se `kit_categories` tem registros para um kit → kit aparece apenas nas categorias associadas

**Implementação:**
- Na query `getEventKits`, usar LEFT JOIN com `kit_categories`
- Filtrar por: `WHERE kit_categories.category_id = $categoryId OR kit_categories.kit_id IS NULL`

---

## Fase 10: Testes e Validação

### 10.1 Testes Backend
- [ ] Criar kit sem associações → deve aparecer em todas as categorias
- [ ] Criar kit com associações → deve aparecer apenas nas categorias associadas
- [ ] Atualizar associações de kit → deve refletir mudanças
- [ ] Deletar kit → deve remover associações (CASCADE)
- [ ] Deletar categoria → deve remover associações (CASCADE)

### 10.2 Testes Frontend
- [ ] Criar kit e associar a categorias → deve salvar corretamente
- [ ] Editar kit e alterar categorias → deve atualizar corretamente
- [ ] No fluxo de inscrição, selecionar categoria → deve mostrar apenas kits associados
- [ ] Inscrição manual do organizador → deve filtrar kits por categoria

---

## Ordem de Implementação Recomendada

1. ✅ **Fase 1**: Migração do banco de dados
2. ✅ **Fase 2**: Atualizar tipos TypeScript
3. ✅ **Fase 3**: Criar serviço de associações
4. ✅ **Fase 4**: Atualizar controllers
5. ✅ **Fase 5**: Criar/atualizar rotas
6. ✅ **Fase 6**: Atualizar API client frontend
7. ✅ **Fase 7**: Atualizar formulários de admin/organizador
8. ✅ **Fase 8**: Atualizar fluxo de inscrição
9. ✅ **Fase 9**: Garantir compatibilidade retroativa
10. ✅ **Fase 10**: Testes

---

## Considerações Importantes

### Compatibilidade Retroativa
- Kits existentes sem associações devem continuar funcionando (aparecem em todas as categorias)
- Não quebrar funcionalidades existentes

### Performance
- Usar índices adequados na tabela `kit_categories`
- Considerar cache se necessário para consultas frequentes

### UX
- Interface clara para associar kits a categorias
- Feedback visual quando kit não está disponível para categoria selecionada
- Mensagem informativa quando não há kits disponíveis para categoria

### Validações
- Validar que categoria pertence ao mesmo evento do kit
- Validar que `category_ids` são UUIDs válidos
- Validar que categorias existem antes de associar

---

## Arquivos que Serão Criados/Modificados

### Novos Arquivos:
- `backend/migrations/073_create_kit_categories.sql`
- `backend/src/services/kitCategoriesService.ts`
- `backend/src/controllers/kitCategoriesController.ts`
- `backend/src/routes/kitCategories.ts`
- `src/lib/api/kitCategories.ts`

### Arquivos Modificados:
- `backend/src/types/index.ts`
- `backend/src/services/eventKitsService.ts`
- `backend/src/controllers/eventKitsController.ts`
- `backend/src/routes/eventKits.ts`
- `src/lib/api/eventKits.ts`
- `src/components/admin/EventViewEditDialog.tsx`
- `src/components/organizer/EventFormDialog.tsx`
- `src/components/event/RegistrationFlow.tsx`
- `src/components/organizer/OrganizerRegistrations.tsx`

---

## Próximos Passos

1. Revisar e aprovar o plano
2. Começar pela Fase 1 (Migração)
3. Implementar fase por fase, testando cada uma
4. Validar compatibilidade retroativa
5. Fazer deploy gradual
