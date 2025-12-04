# Plano de Migração dos Componentes Restantes

Este documento detalha o plano para migrar os componentes que ainda usam Supabase para a nova API REST.

## Componentes Pendentes

1. ✅ `HomeCustomization.tsx` - **JÁ MIGRADO**
2. ✅ `OrganizerSidebar.tsx` - **MIGRADO** (apenas removido import não utilizado)
3. ✅ `ContactDialog.tsx` - **MIGRADO** (substituído por useAuth e getOwnProfile)
4. ✅ `OrganizerReports.tsx` - **MIGRADO** (substituído por useAuth, getEvents e getRegistrations)
5. ✅ `OrganizerEvents.tsx` - **MIGRADO** (substituído update por updateEvent API)
6. ✅ `EventDetailedReport.tsx` - **MIGRADO** (substituído por getEventById e getRegistrations)
7. ✅ `RegistrationFlow.tsx` - **MIGRADO** (substituído por useAuth, getOwnProfile e createRegistration)
8. ✅ `EventViewEditDialog.tsx` - **MIGRADO** (substituído por getEventById, updateEvent e getRegistrations)
5. ⏳ `EventDetailedReport.tsx`
6. ⏳ `RegistrationFlow.tsx`
7. ⏳ `ContactDialog.tsx`
8. ⏳ `EventViewEditDialog.tsx`

---

## 1. OrganizerSidebar.tsx

### Análise
- **Localização**: `src/components/organizer/OrganizerSidebar.tsx`
- **Uso**: Sidebar do organizador com estatísticas e navegação
- **Dependências Supabase**: 
  - `supabase.auth.getUser()` - Obter usuário atual
  - Possivelmente queries de eventos/inscrições

### Endpoints Necessários
- ✅ `GET /api/auth/me` - Já existe
- ✅ `GET /api/events?organizer_id=...` - Já existe
- ✅ `GET /api/registrations?event_id=...` - Já existe

### Tarefas
1. Substituir `supabase.auth.getUser()` por `useAuth()` hook
2. Substituir queries de eventos por `getEvents({ organizer_id })`
3. Substituir queries de inscrições por `getRegistrations({ event_id })`
4. Atualizar tratamento de erros
5. Testar funcionalidade

### Arquivos a Modificar
- `src/components/organizer/OrganizerSidebar.tsx`

### Arquivos a Usar
- `src/contexts/AuthContext.tsx` (useAuth)
- `src/lib/api/events.ts` (getEvents)
- `src/lib/api/registrations.ts` (getRegistrations)

---

## 2. OrganizerReports.tsx

### Análise
- **Localização**: `src/components/organizer/OrganizerReports.tsx`
- **Uso**: Relatórios e estatísticas dos eventos do organizador
- **Dependências Supabase**:
  - `supabase.auth.getUser()` - Obter usuário atual
  - `supabase.from('events')` - Listar eventos do organizador
  - `supabase.from('registrations')` - Listar inscrições dos eventos
  - Possivelmente agregações e estatísticas

### Endpoints Necessários
- ✅ `GET /api/auth/me` - Já existe
- ✅ `GET /api/events?organizer_id=...` - Já existe
- ✅ `GET /api/registrations?event_id=...` - Já existe
- ⚠️ Pode precisar de endpoint de estatísticas agregadas (futuro)

### Tarefas
1. Substituir `supabase.auth.getUser()` por `useAuth()` hook
2. Substituir queries de eventos por `getEvents({ organizer_id })`
3. Substituir queries de inscrições por `getRegistrations({ event_id })`
4. Calcular estatísticas no frontend (ou criar endpoint de estatísticas)
5. Atualizar gráficos e visualizações
6. Testar funcionalidade

### Arquivos a Modificar
- `src/components/organizer/OrganizerReports.tsx`

### Arquivos a Usar
- `src/contexts/AuthContext.tsx` (useAuth)
- `src/lib/api/events.ts` (getEvents)
- `src/lib/api/registrations.ts` (getRegistrations)

---

## 3. OrganizerEvents.tsx

### Análise
- **Localização**: `src/components/organizer/OrganizerEvents.tsx`
- **Uso**: Lista e gerenciamento de eventos do organizador
- **Dependências Supabase**:
  - Possivelmente `supabase.from('events')` - Listar eventos
  - Possivelmente queries de inscrições para estatísticas

### Endpoints Necessários
- ✅ `GET /api/events?organizer_id=...` - Já existe
- ✅ `GET /api/registrations?event_id=...` - Já existe
- ✅ `POST /api/events` - Já existe
- ✅ `PUT /api/events/:id` - Já existe
- ✅ `DELETE /api/events/:id` - Já existe

### Tarefas
1. Verificar se já está usando a nova API (pode já estar migrado)
2. Se não, substituir queries do Supabase
3. Atualizar criação/edição de eventos
4. Atualizar estatísticas de inscrições
5. Testar funcionalidade

### Arquivos a Modificar
- `src/components/organizer/OrganizerEvents.tsx`

### Arquivos a Usar
- `src/lib/api/events.ts`
- `src/lib/api/registrations.ts`

---

## 4. EventDetailedReport.tsx

### Análise
- **Localização**: `src/components/organizer/EventDetailedReport.tsx`
- **Uso**: Relatório detalhado de um evento específico
- **Dependências Supabase**:
  - `supabase.from('events')` - Obter evento
  - `supabase.from('registrations')` - Listar inscrições do evento
  - Possivelmente agregações e estatísticas

### Endpoints Necessários
- ✅ `GET /api/events/:id` - Já existe
- ✅ `GET /api/registrations?event_id=...` - Já existe

### Tarefas
1. Substituir `supabase.from('events')` por `getEventById()`
2. Substituir queries de inscrições por `getRegistrations({ event_id })`
3. Calcular estatísticas no frontend
4. Atualizar visualizações e gráficos
5. Testar funcionalidade

### Arquivos a Modificar
- `src/components/organizer/EventDetailedReport.tsx`

### Arquivos a Usar
- `src/lib/api/events.ts` (getEventById)
- `src/lib/api/registrations.ts` (getRegistrations)

---

## 5. RegistrationFlow.tsx

### Análise
- **Localização**: `src/components/event/RegistrationFlow.tsx`
- **Uso**: Fluxo completo de inscrição em eventos
- **Dependências Supabase**:
  - `supabase.auth.getUser()` - Verificar usuário autenticado
  - `supabase.from('events')` - Obter evento
  - `supabase.from('event_categories')` - Obter categorias
  - `supabase.from('event_kits')` - Obter kits
  - `supabase.from('registrations')` - Criar inscrição

### Endpoints Necessários
- ✅ `GET /api/auth/me` - Já existe
- ✅ `GET /api/events/:id` - Já existe
- ⚠️ `GET /api/event-categories?event_id=...` - **PRECISA SER CRIADO**
- ⚠️ `GET /api/event-kits?event_id=...` - **PRECISA SER CRIADO**
- ✅ `POST /api/registrations` - Já existe

### Tarefas
1. Substituir `supabase.auth.getUser()` por `useAuth()` hook
2. Substituir `getEventById()` por API
3. **CRIAR** endpoints para event_categories e event_kits
4. Substituir queries de categorias e kits
5. Atualizar criação de inscrição
6. Testar fluxo completo

### Arquivos a Modificar
- `src/components/event/RegistrationFlow.tsx`

### Arquivos a Criar
- `backend/src/services/eventCategoriesService.ts`
- `backend/src/controllers/eventCategoriesController.ts`
- `backend/src/routes/eventCategories.ts`
- `src/lib/api/eventCategories.ts`

### Arquivos a Usar
- `src/contexts/AuthContext.tsx` (useAuth)
- `src/lib/api/events.ts` (getEventById)
- `src/lib/api/registrations.ts` (createRegistration)

---

## 6. ContactDialog.tsx

### Análise
- **Localização**: `src/components/event/ContactDialog.tsx`
- **Uso**: Diálogo de contato para eventos
- **Dependências Supabase**:
  - `supabase.auth.getUser()` - Verificar usuário autenticado
  - Possivelmente queries relacionadas ao evento

### Endpoints Necessários
- ✅ `GET /api/auth/me` - Já existe
- ✅ `GET /api/events/:id` - Já existe (se necessário)

### Tarefas
1. Substituir `supabase.auth.getUser()` por `useAuth()` hook
2. Verificar se há outras queries do Supabase
3. Atualizar lógica de contato
4. Testar funcionalidade

### Arquivos a Modificar
- `src/components/event/ContactDialog.tsx`

### Arquivos a Usar
- `src/contexts/AuthContext.tsx` (useAuth)

---

## 7. EventViewEditDialog.tsx

### Análise
- **Localização**: `src/components/admin/EventViewEditDialog.tsx`
- **Uso**: Visualizar e editar eventos (admin)
- **Dependências Supabase**:
  - `supabase.from('events')` - Obter/atualizar evento
  - `supabase.from('event_categories')` - Listar categorias
  - `supabase.from('event_kits')` - Listar kits
  - `supabase.from('registrations')` - Listar inscrições

### Endpoints Necessários
- ✅ `GET /api/events/:id` - Já existe
- ✅ `PUT /api/events/:id` - Já existe
- ⚠️ `GET /api/event-categories?event_id=...` - **PRECISA SER CRIADO**
- ⚠️ `GET /api/event-kits?event_id=...` - **PRECISA SER CRIADO**
- ✅ `GET /api/registrations?event_id=...` - Já existe

### Tarefas
1. Substituir queries de eventos por API
2. **CRIAR** endpoints para event_categories e event_kits (se ainda não criados)
3. Substituir queries de categorias e kits
4. Substituir queries de inscrições
5. Atualizar formulário de edição
6. Testar funcionalidade

### Arquivos a Modificar
- `src/components/admin/EventViewEditDialog.tsx`

### Arquivos a Criar (se necessário)
- Endpoints de event_categories e event_kits (verificar se já foram criados no RegistrationFlow)

### Arquivos a Usar
- `src/lib/api/events.ts`
- `src/lib/api/registrations.ts`
- `src/lib/api/eventCategories.ts` (a criar)
- `src/lib/api/eventKits.ts` (a criar)

---

## Ordem de Migração Recomendada

### Fase 1: Componentes Simples (Sem novos endpoints)
1. ✅ **OrganizerSidebar.tsx** - Apenas substituir queries existentes
2. ✅ **ContactDialog.tsx** - Apenas autenticação
3. ✅ **OrganizerReports.tsx** - Queries existentes + cálculos no frontend
4. ✅ **EventDetailedReport.tsx** - Queries existentes + cálculos no frontend
5. ✅ **OrganizerEvents.tsx** - Verificar se já está migrado

### Fase 2: Componentes que Requerem Novos Endpoints
6. ✅ **RegistrationFlow.tsx** - Requer endpoints de categorias e kits
7. ✅ **EventViewEditDialog.tsx** - Requer endpoints de categorias e kits

---

## Estratégia de Migração

### Para Cada Componente:

1. **Análise**
   - Ler o arquivo completo
   - Identificar todas as chamadas do Supabase
   - Listar endpoints necessários

2. **Preparação**
   - Verificar se endpoints existem
   - Criar endpoints faltantes (se necessário)
   - Criar serviços de API no frontend (se necessário)

3. **Migração**
   - Substituir imports do Supabase
   - Substituir chamadas por API REST
   - Atualizar tratamento de erros
   - Atualizar tipos TypeScript

4. **Teste**
   - Testar funcionalidade
   - Verificar erros de compilação
   - Validar comportamento

5. **Documentação**
   - Atualizar este documento
   - Marcar componente como migrado

---

## Endpoints a Criar (Futuro)

### Event Categories
- `GET /api/event-categories?event_id=...` - Listar categorias de um evento
- `POST /api/event-categories` - Criar categoria
- `PUT /api/event-categories/:id` - Atualizar categoria
- `DELETE /api/event-categories/:id` - Deletar categoria

### Event Kits
- `GET /api/event-kits?event_id=...` - Listar kits de um evento
- `POST /api/event-kits` - Criar kit
- `PUT /api/event-kits/:id` - Atualizar kit
- `DELETE /api/event-kits/:id` - Deletar kit

---

## Checklist de Migração

Para cada componente:

- [ ] Análise completa realizada
- [ ] Endpoints verificados/criados
- [ ] Imports do Supabase removidos
- [ ] Chamadas substituídas por API REST
- [ ] Tratamento de erros atualizado
- [ ] Tipos TypeScript atualizados
- [ ] Testes realizados
- [ ] Erros de compilação corrigidos
- [ ] Funcionalidade validada
- [ ] Documentação atualizada

---

## Próximo Passo

Quando você disser **"OK"**, vamos começar a migrar o primeiro componente da lista:

**1. OrganizerSidebar.tsx**

Este componente é relativamente simples e não requer novos endpoints, sendo ideal para começar.

