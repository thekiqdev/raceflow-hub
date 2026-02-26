# 📋 Plano de Reativação: Lotes de Preços nas Categorias

## 🔍 Situação Atual

### O que existe:
1. **Tabela `category_batches`** no banco de dados (relacionada a `event_categories` - sistema antigo)
2. **Funções no backend** (`eventCategoriesService.ts`):
   - `createCategoryBatch()`
   - `updateCategoryBatch()`
   - `deleteCategoryBatch()`
   - `getEventCategories()` já busca batches
3. **Código no frontend** (`RegistrationFlow.tsx`):
   - Seleção de batches durante inscrição
   - Cálculo de preço baseado no batch selecionado
4. **Interface no frontend** (`EventFormDialog.tsx`):
   - Código para batches, mas relacionado a **modalidades** (não categorias)

### O que falta:
1. **Adaptar `category_batches`** para trabalhar com a nova tabela `categories` (não `event_categories`)
2. **Interface de gerenciamento** de lotes nas categorias (criar/editar/deletar)
3. **Integração** com o sistema atual de categorias (`categoriesService.ts`)
4. **UI no EventViewEditDialog** para gerenciar lotes por categoria

## 🎯 Objetivo

Reativar e adaptar o sistema de lotes de preços para funcionar com a nova estrutura de **categorias** (não modalidades).

## 📝 Plano de Implementação

### ETAPA 1: Migração do Banco de Dados
**Objetivo**: Adaptar `category_batches` para trabalhar com `categories` ao invés de `event_categories`

**Tarefas**:
1. Criar migração para:
   - Verificar se `category_batches.category_id` ainda referencia `event_categories.id`
   - Se sim, criar nova coluna temporária ou migrar foreign key
   - Atualizar foreign key para referenciar `categories.id`
   - Migrar dados existentes (se houver)
   - Adicionar campo `valid_to` (opcional, para data de término do lote)
   - Adicionar campo `name` (opcional, para nome do lote, ex: "1º Lote", "2º Lote")

**Arquivos**:
- `backend/migrations/066_adapt_category_batches_to_categories.sql`

---

### ETAPA 2: Atualizar Backend - Services
**Objetivo**: Adaptar serviços para trabalhar com `categories` ao invés de `event_categories`

**Tarefas**:
1. Atualizar `categoriesService.ts`:
   - Adicionar interface `CategoryBatch`
   - Adicionar função `getCategoryBatches(categoryId: string)`
   - Adicionar função `createCategoryBatch()`
   - Adicionar função `updateCategoryBatch()`
   - Adicionar função `deleteCategoryBatch()`
   - Atualizar `getCategoriesByEvent()` para incluir batches
   - Atualizar `getCategoriesByModality()` para incluir batches

2. Manter `eventCategoriesService.ts` (para compatibilidade) ou deprecar

**Arquivos**:
- `backend/src/services/categoriesService.ts`
- `backend/src/types/index.ts` (atualizar interfaces)

---

### ETAPA 3: Criar Controller para Batches
**Objetivo**: Criar endpoints REST para gerenciar batches

**Tarefas**:
1. Criar `categoryBatchesController.ts`:
   - `GET /api/categories/:categoryId/batches` - Listar batches de uma categoria
   - `POST /api/categories/:categoryId/batches` - Criar novo batch
   - `PUT /api/categories/:categoryId/batches/:batchId` - Atualizar batch
   - `DELETE /api/categories/:categoryId/batches/:batchId` - Deletar batch

2. Adicionar rotas em `categoriesRoutes.ts` ou criar `categoryBatchesRoutes.ts`

**Arquivos**:
- `backend/src/controllers/categoryBatchesController.ts` (novo)
- `backend/src/routes/categoriesRoutes.ts` ou `categoryBatchesRoutes.ts`

---

### ETAPA 4: Atualizar Frontend - API Client
**Objetivo**: Criar funções no frontend para gerenciar batches

**Tarefas**:
1. Criar/atualizar `src/lib/api/categoryBatches.ts`:
   - `getCategoryBatches(categoryId: string)`
   - `createCategoryBatch(categoryId: string, data: CreateBatchData)`
   - `updateCategoryBatch(categoryId: string, batchId: string, data: UpdateBatchData)`
   - `deleteCategoryBatch(categoryId: string, batchId: string)`

2. Atualizar `src/lib/api/categories.ts`:
   - Adicionar `batches?: CategoryBatch[]` na interface `Category`

**Arquivos**:
- `src/lib/api/categoryBatches.ts` (novo)
- `src/lib/api/categories.ts`

---

### ETAPA 5: Atualizar UI - EventViewEditDialog
**Objetivo**: Adicionar interface para gerenciar lotes nas categorias

**Tarefas**:
1. Na aba "Categorias" do `EventViewEditDialog.tsx`:
   - Adicionar seção "Lotes de Preço" em cada categoria
   - Botão "Adicionar Lote" por categoria
   - Lista de lotes com:
     - Nome do lote (opcional)
     - Preço
     - Data de início (`valid_from`)
     - Data de término (`valid_to`, opcional)
     - Botões de editar/deletar
   - Validação: data de término >= data de início

2. Salvar batches ao salvar categorias

**Arquivos**:
- `src/components/admin/EventViewEditDialog.tsx`

---

### ETAPA 6: Atualizar UI - EventFormDialog (Organizador)
**Objetivo**: Adicionar interface para gerenciar lotes nas categorias (organizador)

**Tarefas**:
1. Na aba "Categorias" do `EventFormDialog.tsx`:
   - Mesma funcionalidade do `EventViewEditDialog.tsx`
   - Adicionar seção de lotes em cada categoria

**Arquivos**:
- `src/components/organizer/EventFormDialog.tsx`

---

### ETAPA 7: Atualizar RegistrationFlow
**Objetivo**: Garantir que o fluxo de inscrição funcione com batches das novas categorias

**Tarefas**:
1. Verificar se `RegistrationFlow.tsx` já funciona com batches
2. Atualizar para buscar batches da nova estrutura (`categories` ao invés de `event_categories`)
3. Testar seleção de batch e cálculo de preço

**Arquivos**:
- `src/components/event/RegistrationFlow.tsx`

---

### ETAPA 8: Testes e Validação
**Objetivo**: Garantir que tudo funciona corretamente

**Tarefas**:
1. Testar criação de lotes em categorias
2. Testar edição de lotes
3. Testar deleção de lotes
4. Testar seleção de lote durante inscrição
5. Testar cálculo de preço baseado no lote selecionado
6. Testar validação de datas (não permitir lote futuro)
7. Testar ordenação de lotes por data

---

## 📊 Estrutura de Dados

### Tabela `category_batches` (após migração):
```sql
CREATE TABLE category_batches (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE, -- NOVO: referencia categories
  name TEXT, -- NOVO: nome do lote (opcional)
  price NUMERIC NOT NULL,
  valid_from TIMESTAMP WITH TIME ZONE, -- Pode ser NULL
  valid_to TIMESTAMP WITH TIME ZONE, -- NOVO: data de término (opcional)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Interface TypeScript:
```typescript
interface CategoryBatch {
  id: string;
  category_id: string;
  name?: string | null;
  price: number;
  valid_from: string | null;
  valid_to?: string | null;
  created_at?: string;
}
```

---

## 🔄 Ordem de Execução

1. ✅ **ETAPA 1**: Migração do banco de dados - **CONCLUÍDA**
   - ✅ Criada migração `066_adapt_category_batches_to_categories.sql`
   - ✅ Adiciona colunas `name` e `valid_to`
   - ✅ Remove foreign key antiga (event_categories)
   - ✅ Adiciona foreign key nova (categories)
   - ✅ Adiciona constraints e índices
   - ✅ Adicionada à lista de migrações
2. ✅ **ETAPA 2**: Atualizar services do backend - **CONCLUÍDA**
   - ✅ Adicionada interface `CategoryBatch` em `types/index.ts` (com `name` e `valid_to`)
   - ✅ Adicionado campo `batches?: CategoryBatch[]` à interface `Category`
   - ✅ Criada função auxiliar `loadBatchesForCategories()` para carregar batches em lote
   - ✅ Adicionadas funções: `getCategoryBatches()`, `getActiveBatches()`, `createCategoryBatch()`, `updateCategoryBatch()`, `deleteCategoryBatch()`
   - ✅ Atualizadas funções de busca: `getCategoriesByEvent()`, `getCategoriesByModality()`, `getCategoryById()` para incluir batches
3. ✅ **ETAPA 3**: Criar controllers e rotas - **CONCLUÍDA**
   - ✅ Criado `categoryBatchesController.ts` com todos os endpoints
   - ✅ Adicionadas rotas em `categories.ts`:
     - `GET /api/categories/:categoryId/batches` - Listar batches
     - `GET /api/categories/:categoryId/batches/active` - Listar batches ativos
     - `POST /api/categories/:categoryId/batches` - Criar batch
     - `PUT /api/categories/:categoryId/batches/:batchId` - Atualizar batch
     - `DELETE /api/categories/:categoryId/batches/:batchId` - Deletar batch
   - ✅ Validação com Zod para criação e atualização
   - ✅ Verificação de permissões (organizador do evento ou admin)
4. ✅ **ETAPA 4**: Atualizar API client do frontend - **CONCLUÍDA**
   - ✅ Criado `src/lib/api/categoryBatches.ts` com todas as funções
   - ✅ Adicionada interface `CategoryBatch` em `categories.ts`
   - ✅ Adicionado campo `batches?: CategoryBatch[]` à interface `Category`
   - ✅ Funções implementadas:
     - `getCategoryBatches(categoryId)` - Listar batches
     - `getActiveBatches(categoryId, date?)` - Listar batches ativos
     - `createCategoryBatch(categoryId, data)` - Criar batch
     - `updateCategoryBatch(categoryId, batchId, data)` - Atualizar batch
     - `deleteCategoryBatch(categoryId, batchId)` - Deletar batch
5. ✅ **ETAPA 5**: Atualizar UI do admin - **CONCLUÍDA**
   - ✅ Adicionada seção "Lotes de Preço" em cada categoria no `EventViewEditDialog.tsx`
   - ✅ Botão "Adicionar Lote" por categoria
   - ✅ Interface para gerenciar lotes com:
     - Nome do lote (opcional)
     - Preço
     - Data de início (valid_from, opcional)
     - Data de término (valid_to, opcional)
     - Botão de remover
   - ✅ Funções para gerenciar batches localmente: `addBatchToCategory`, `removeBatchFromCategory`, `updateBatchLocal`
   - ✅ Lógica para salvar batches ao salvar categorias (criar, atualizar, deletar)
   - ✅ Carregamento de batches ao carregar categorias
6. ✅ **ETAPA 6**: Atualizar UI do organizador - **CONCLUÍDA**
   - ✅ Adicionada seção "Lotes de Preço" em cada categoria no `EventFormDialog.tsx`
   - ✅ Botão "Adicionar Lote" por categoria
   - ✅ Interface para gerenciar lotes (mesma funcionalidade do admin)
   - ✅ Funções para gerenciar batches localmente: `addBatchToCategory`, `removeBatchFromCategory`, `updateBatchLocal`
   - ✅ Lógica para salvar batches ao salvar categorias (criar, atualizar, deletar)
   - ✅ Carregamento de batches ao carregar categorias
   - ✅ Interface `Category` local atualizada para incluir `batches?: CategoryBatch[]`
7. ✅ **ETAPA 7**: Verificar/atualizar RegistrationFlow - **CONCLUÍDA**
   - ✅ Atualizado import para usar `CategoryBatch` de `@/lib/api/categories` (nova estrutura)
   - ✅ Atualizada lógica de filtro de batches ativos para considerar `valid_to`
   - ✅ Adicionada seção de seleção de batches na UI após seleção de categoria
   - ✅ Interface para exibir batches disponíveis com:
     - Nome do lote (ou "Lote Padrão" se não tiver nome)
     - Preço
     - Datas de início e término (quando disponíveis)
     - Badges de status (Ativo, Em breve, Encerrado)
     - Indicação visual do lote selecionado
   - ✅ Atualizada exibição do preço no resumo para mostrar nome do lote quando disponível
   - ✅ Lógica de auto-seleção do lote mais recente ativo mantida
8. ⏳ **ETAPA 8**: Testes completos

---

## 📝 Notas Importantes

1. **Compatibilidade**: Manter compatibilidade com sistema antigo durante transição
2. **Migração de dados**: Se houver dados em `category_batches` relacionados a `event_categories`, precisará migrar
3. **Validação**: Garantir que `valid_to >= valid_from` quando ambos estão definidos
4. **Ordenação**: Lotes devem ser ordenados por `valid_from` (mais antigo primeiro)
5. **Preço padrão**: Se categoria não tiver lotes, usar `price` da categoria
6. **Lote ativo**: Durante inscrição, mostrar apenas lotes onde `valid_from <= now` e (`valid_to IS NULL` ou `valid_to >= now`)

---

## 🚀 Próximos Passos

Após aprovação deste plano, iniciar pela **ETAPA 1** (Migração do Banco de Dados).
