# Plano de Alteração: Modalidade e Categoria

## Visão Geral

Este documento descreve o plano para separar o cadastro de **Modalidade** e **Categoria** em etapas distintas, melhorando a organização e permitindo que uma categoria possa estar associada a múltiplas modalidades.

## Estrutura Atual vs Nova Estrutura

### Estrutura Atual
- Modalidade e Categoria estão juntas
- Uma categoria pertence a apenas uma modalidade
- Cadastro em uma única etapa

### Nova Estrutura
- **Modalidade**: Etapa 1 (independente)
  - Nome
  - Distância
  
- **Categoria**: Etapa 2 (dependente de modalidades)
  - Nome da categoria
  - Modalidade (seleção múltipla)
  - Valor
  - Tipo (visitante, local, geral, PCD, militar, civil, etc)
  - Sexo (Ambos | Masculino | Feminino)
  - Idade mínima

## Mudanças no Banco de Dados

### ETAPA 1: Criar Migration para Nova Estrutura

**Arquivo**: `backend/migrations/036_separate_modalities_categories.sql`

```sql
-- 1. Criar tabela de modalidades (se não existir separadamente)
CREATE TABLE IF NOT EXISTS public.modalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    distance VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_modalities_event FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE
);

-- 2. Criar tabela de categorias (se não existir separadamente)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    category_type VARCHAR(50) NOT NULL DEFAULT 'geral', -- visitante, local, geral, PCD, militar, civil, etc
    gender VARCHAR(20) NOT NULL DEFAULT 'ambos', -- ambos, masculino, feminino
    min_age INTEGER NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_categories_event FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
    CONSTRAINT chk_category_type CHECK (category_type IN ('visitante', 'local', 'geral', 'PCD', 'militar', 'civil', 'outro')),
    CONSTRAINT chk_gender CHECK (gender IN ('ambos', 'masculino', 'feminino'))
);

-- 3. Criar tabela de relacionamento muitos-para-muitos entre categorias e modalidades
CREATE TABLE IF NOT EXISTS public.category_modalities (
    category_id UUID NOT NULL,
    modality_id UUID NOT NULL,
    PRIMARY KEY (category_id, modality_id),
    CONSTRAINT fk_category_modalities_category FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
    CONSTRAINT fk_category_modalities_modality FOREIGN KEY (modality_id) REFERENCES public.modalities(id) ON DELETE CASCADE
);

-- 4. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_modalities_event_id ON public.modalities(event_id);
CREATE INDEX IF NOT EXISTS idx_categories_event_id ON public.categories(event_id);
CREATE INDEX IF NOT EXISTS idx_category_modalities_category_id ON public.category_modalities(category_id);
CREATE INDEX IF NOT EXISTS idx_category_modalities_modality_id ON public.category_modalities(modality_id);

-- 5. Migrar dados existentes (se houver tabela antiga)
-- TODO: Script de migração de dados antigos para nova estrutura
```

## Mudanças no Backend

### ETAPA 2: Atualizar Types/Interfaces

**Arquivo**: `backend/src/types/index.ts`

```typescript
export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  event_id: string;
  name: string;
  price: number;
  category_type: 'visitante' | 'local' | 'geral' | 'PCD' | 'militar' | 'civil' | 'outro';
  gender: 'ambos' | 'masculino' | 'feminino';
  min_age: number | null;
  created_at: string;
  updated_at: string;
  modality_ids?: string[]; // Para relacionamento
}

export interface CategoryModality {
  category_id: string;
  modality_id: string;
}
```

### ETAPA 3: Criar/Atualizar Services

**Arquivo**: `backend/src/services/modalitiesService.ts`

- `createModality(eventId, data)`
- `getModalitiesByEvent(eventId)`
- `updateModality(modalityId, data)`
- `deleteModality(modalityId)`

**Arquivo**: `backend/src/services/categoriesService.ts`

- `createCategory(eventId, data)` - inclui relacionamento com modalidades
- `getCategoriesByEvent(eventId)`
- `getCategoriesByModality(modalityId)`
- `updateCategory(categoryId, data)`
- `deleteCategory(categoryId)`
- `setCategoryModalities(categoryId, modalityIds[])`

### ETAPA 4: Criar/Atualizar Controllers

**Arquivo**: `backend/src/controllers/modalitiesController.ts`

- `createModalityController`
- `getModalitiesController`
- `updateModalityController`
- `deleteModalityController`

**Arquivo**: `backend/src/controllers/categoriesController.ts`

- `createCategoryController`
- `getCategoriesController`
- `getCategoriesByModalityController`
- `updateCategoryController`
- `deleteCategoryController`

### ETAPA 5: Criar/Atualizar Routes

**Arquivo**: `backend/src/routes/modalities.ts`

```typescript
router.post('/', authenticate, requireRole('organizer'), createModalityController);
router.get('/event/:eventId', getModalitiesController);
router.put('/:id', authenticate, requireRole('organizer'), updateModalityController);
router.delete('/:id', authenticate, requireRole('organizer'), deleteModalityController);
```

**Arquivo**: `backend/src/routes/categories.ts`

```typescript
router.post('/', authenticate, requireRole('organizer'), createCategoryController);
router.get('/event/:eventId', getCategoriesController);
router.get('/modality/:modalityId', getCategoriesByModalityController);
router.put('/:id', authenticate, requireRole('organizer'), updateCategoryController);
router.delete('/:id', authenticate, requireRole('organizer'), deleteCategoryController);
```

### ETAPA 6: Atualizar RegistrationsService

**Arquivo**: `backend/src/services/registrationsService.ts`

- Atualizar lógica de validação de categoria por modalidade
- Verificar idade mínima
- Verificar gênero
- Verificar tipo de categoria

## Mudanças no Frontend

### ETAPA 7: Atualizar API Clients

**Arquivo**: `src/lib/api/modalities.ts`

```typescript
export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
}

export const getModalities = async (eventId: string) => {
  return apiClient.get<Modality[]>(`/modalities/event/${eventId}`);
};

export const createModality = async (eventId: string, data: CreateModalityData) => {
  return apiClient.post<Modality>(`/modalities`, { ...data, event_id: eventId });
};
```

**Arquivo**: `src/lib/api/categories.ts`

```typescript
export interface Category {
  id: string;
  event_id: string;
  name: string;
  price: number;
  category_type: 'visitante' | 'local' | 'geral' | 'PCD' | 'militar' | 'civil' | 'outro';
  gender: 'ambos' | 'masculino' | 'feminino';
  min_age: number | null;
  modality_ids?: string[];
}

export const getCategories = async (eventId: string) => {
  return apiClient.get<Category[]>(`/categories/event/${eventId}`);
};

export const getCategoriesByModality = async (modalityId: string) => {
  return apiClient.get<Category[]>(`/categories/modality/${modalityId}`);
};
```

### ETAPA 8: Atualizar EventFormDialog - Aba Modalidades

**Arquivo**: `src/components/organizer/EventFormDialog.tsx`

- Remover campos de categoria da aba de modalidades
- Manter apenas:
  - Nome da modalidade
  - Distância
- Adicionar botão "Adicionar Modalidade"
- Lista de modalidades cadastradas

### ETAPA 9: Criar Nova Aba de Categorias no EventFormDialog

**Arquivo**: `src/components/organizer/EventFormDialog.tsx`

- Nova aba "Categorias" após "Modalidades"
- Formulário com campos:
  - Nome da categoria
  - Modalidade (Checkbox múltipla seleção)
  - Valor (Input numérico)
  - Tipo (Select: visitante, local, geral, PCD, militar, civil, outro)
  - Sexo (Select: Ambos, Masculino, Feminino)
  - Idade mínima (Input numérico, opcional)
- Lista de categorias cadastradas
- Edição e exclusão de categorias

### ETAPA 10: Atualizar RegistrationFlow - Fluxo de Inscrição

**Arquivo**: `src/components/event/RegistrationFlow.tsx`

**Mudanças no fluxo:**

1. **Step 1 - Seleção de Modalidade:**
   - Exibir lista de modalidades disponíveis
   - Ao selecionar, avançar para Step 2

2. **Step 2 - Seleção de Categoria:**
   - Filtrar categorias pela modalidade selecionada
   - Aplicar filtros:
     - Gênero (se não for "ambos")
     - Idade mínima (verificar data de nascimento)
     - Tipo de categoria
   - Exibir apenas categorias compatíveis
   - Ao selecionar categoria, avançar para Step 3

3. **Step 3+ - Continuar fluxo normal:**
   - Kits, dados pessoais, pagamento, etc.

### ETAPA 11: Atualizar Validações no Frontend

**Arquivo**: `src/lib/utils/validators.ts`

- Adicionar validação de idade mínima
- Adicionar validação de gênero
- Adicionar validação de tipo de categoria

## Testes

### ETAPA 12: Testes de Backend

- [ ] Testar criação de modalidade
- [ ] Testar criação de categoria com múltiplas modalidades
- [ ] Testar busca de categorias por modalidade
- [ ] Testar validações de idade e gênero
- [ ] Testar exclusão em cascata

### ETAPA 13: Testes de Frontend

- [ ] Testar cadastro de modalidade
- [ ] Testar cadastro de categoria
- [ ] Testar seleção múltipla de modalidades em categoria
- [ ] Testar fluxo de inscrição com nova estrutura
- [ ] Testar filtros de categoria por modalidade
- [ ] Testar validações de idade e gênero no fluxo

### ETAPA 14: Testes de Integração

- [ ] Testar inscrição completa com nova estrutura
- [ ] Testar edição de evento com modalidades e categorias
- [ ] Testar exclusão de modalidade (deve verificar categorias associadas)
- [ ] Testar exclusão de categoria

## Migração de Dados

### ETAPA 15: Script de Migração

**Arquivo**: `backend/scripts/migrate-modalities-categories.ts`

- Ler dados da estrutura antiga
- Separar em modalidades e categorias
- Criar relacionamentos
- Validar integridade dos dados

## Checklist de Implementação

### Backend
- [ ] ETAPA 1: Criar migration
- [ ] ETAPA 2: Atualizar types/interfaces
- [ ] ETAPA 3: Criar/atualizar services
- [ ] ETAPA 4: Criar/atualizar controllers
- [ ] ETAPA 5: Criar/atualizar routes
- [ ] ETAPA 6: Atualizar registrationsService

### Frontend
- [ ] ETAPA 7: Atualizar API clients
- [ ] ETAPA 8: Atualizar EventFormDialog - Aba Modalidades
- [ ] ETAPA 9: Criar nova aba de Categorias
- [ ] ETAPA 10: Atualizar RegistrationFlow
- [ ] ETAPA 11: Atualizar validações

### Testes e Migração
- [ ] ETAPA 12: Testes de backend
- [ ] ETAPA 13: Testes de frontend
- [ ] ETAPA 14: Testes de integração
- [ ] ETAPA 15: Script de migração de dados

## Observações Importantes

1. **Compatibilidade**: Garantir que eventos existentes continuem funcionando durante a migração
2. **Validações**: Implementar validações tanto no backend quanto no frontend
3. **Performance**: Considerar índices e otimizações para consultas de categorias por modalidade
4. **UX**: Interface clara mostrando a relação entre modalidades e categorias
5. **Documentação**: Atualizar documentação da API após implementação

## Próximos Passos

Após aprovação deste plano, iniciar pela **ETAPA 1** e seguir sequencialmente até a **ETAPA 15**.


