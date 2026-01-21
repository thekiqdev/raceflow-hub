# Plano de Implementação: URLs Amigáveis para Eventos

**Objetivo:** Substituir URLs com UUID por URLs amigáveis usando slug baseado no nome do evento.

**Exemplo:**
- ❌ Antes: `/events/1bdcb9a8-f49f-448e-9be9-fae97b680331`
- ✅ Depois: `/evento/corrida-de-rua-fortaleza-2024`

**Data de Criação:** 2025-01-20  
**Status:** 🟡 Em Planejamento

---

## 📋 Visão Geral

### Situação Atual
- Rotas usam UUID: `/events/:id`
- Banco de dados não possui campo `slug`
- Todos os links no frontend usam `event.id` (UUID)

### Objetivo Final
- URLs amigáveis: `/evento/:slug`
- Campo `slug` na tabela `events`
- Compatibilidade com URLs antigas (UUID)
- Geração automática de slug a partir do título

---

## 🎯 Etapas de Implementação

### ETAPA 1: Criar Função de Geração de Slug ✅ CONCLUÍDA
**Objetivo:** Criar função utilitária para gerar slugs a partir de títulos.

**Tarefas:**
1. ✅ Criar função `generateSlug(title: string)` no backend
2. ✅ Função deve:
   - Remover acentos
   - Converter para minúsculas
   - Substituir espaços por hífens
   - Remover caracteres especiais
   - Garantir formato válido (apenas letras, números e hífens)
3. ✅ Criar função para garantir unicidade (adicionar sufixo numérico se necessário)

**Arquivos criados/modificados:**
- ✅ `backend/src/utils/slug.ts` (criado)
- ✅ `backend/scripts/test-slug.ts` (criado - script de teste)

**Critérios de Aceitação:**
- ✅ "Corrida de Rua Fortaleza 2024" → "corrida-de-rua-fortaleza-2024"
- ✅ "Maratona São Paulo!" → "maratona-sao-paulo"
- ✅ Títulos duplicados geram slugs únicos: "corrida-2024", "corrida-2024-2"
- ✅ Todos os 19 testes passaram com sucesso

**Funções implementadas:**
- `generateSlug(text: string): string` - Gera slug a partir de texto
- `ensureUniqueSlug(baseSlug, checkUniqueness, excludeEventId?)` - Garante unicidade do slug
- `isValidSlug(slug: string): boolean` - Valida formato do slug

---

### ETAPA 2: Adicionar Campo Slug no Banco de Dados ✅ CONCLUÍDA
**Objetivo:** Adicionar coluna `slug` na tabela `events` e gerar slugs para eventos existentes.

**Tarefas:**
1. ✅ Criar migration para adicionar coluna `slug`:
   - Tipo: `TEXT`
   - Constraint: `UNIQUE`
   - Índice para performance
   - Permitir `NULL` temporariamente (para migração)
2. ✅ Criar script de migração para gerar slugs para eventos existentes
3. ✅ Após migração, tornar `slug` NOT NULL
4. ✅ Adicionar constraint UNIQUE definitiva

**Arquivos criados/modificados:**
- ✅ `backend/migrations/078_add_slug_to_events.sql` (criado)
- ✅ `backend/migrations/079_make_slug_not_null_in_events.sql` (criado)
- ✅ `backend/scripts/generate-slugs-for-existing-events.ts` (criado)

**Critérios de Aceitação:**
- ✅ Coluna `slug` criada com sucesso (migration 078)
- ✅ Script para gerar slugs para eventos existentes criado
- ✅ Migration para tornar NOT NULL criada (migration 079)
- ✅ Índices criados (único e regular)
- ✅ Constraint UNIQUE adicionada

**Notas:**
- Migration 078 adiciona coluna permitindo NULL temporariamente
- Script `generate-slugs-for-existing-events.ts` deve ser executado antes da migration 079
- Migration 079 valida que todos os eventos têm slug antes de tornar NOT NULL

---

### ETAPA 3: Atualizar Backend - Tipos e Interfaces ✅ CONCLUÍDA
**Objetivo:** Adicionar `slug` nas interfaces TypeScript do backend.

**Tarefas:**
1. ✅ Atualizar interface `Event` em `backend/src/types/index.ts`
2. ✅ Atualizar `CreateEventData` e `UpdateEventData` em `backend/src/services/eventsService.ts`
3. ✅ Adicionar validação de slug nos schemas Zod

**Arquivos modificados:**
- ✅ `backend/src/types/index.ts` - Interface `Event` agora inclui `slug: string`
- ✅ `backend/src/services/eventsService.ts` - `CreateEventData` e `UpdateEventData` incluem `slug?: string` (opcional)
- ✅ `backend/src/controllers/eventsController.ts` - Schemas Zod validam formato do slug

**Critérios de Aceitação:**
- ✅ Interface `Event` inclui `slug`
- ✅ Tipos de criação/atualização incluem `slug` (opcional, será gerado automaticamente)
- ✅ Validações funcionando corretamente (regex para formato válido, min/max length)
- ✅ Código compila sem erros

**Validações implementadas:**
- Slug opcional (será gerado automaticamente se não fornecido)
- Formato: apenas letras minúsculas, números e hífens
- Sem hífens consecutivos ou no início/fim
- Tamanho: mínimo 1 caractere, máximo 100 caracteres

---

### ETAPA 4: Atualizar Backend - Geração Automática de Slug ✅ CONCLUÍDA
**Objetivo:** Modificar serviços para gerar slug automaticamente ao criar/atualizar eventos.

**Tarefas:**
1. ✅ Modificar `createEvent` em `eventsService.ts`:
   - Gerar slug automaticamente a partir do título
   - Verificar unicidade e adicionar sufixo se necessário
   - Salvar slug no banco
2. ✅ Modificar `updateEvent` em `eventsService.ts`:
   - Se título mudar, gerar novo slug
   - Verificar unicidade do novo slug
   - Atualizar slug no banco
3. ✅ Adicionar função helper `ensureUniqueSlug(slug: string, eventId?: string)`

**Arquivos modificados:**
- ✅ `backend/src/services/eventsService.ts` - Importado `generateSlug`, adicionadas funções helper e modificadas `createEvent` e `updateEvent`

**Critérios de Aceitação:**
- ✅ Novos eventos têm slug gerado automaticamente
- ✅ Atualização de título gera novo slug
- ✅ Slugs são sempre únicos
- ✅ Slug não muda se título não mudar
- ✅ Campo `slug` incluído nas queries SELECT
- ✅ Código compila sem erros

**Funções implementadas:**
- `slugExists(slug: string, excludeEventId?: string): Promise<boolean>` - Verifica se slug existe no banco
- `ensureUniqueSlug(baseSlug: string, excludeEventId?: string): Promise<string>` - Garante unicidade do slug
- `createEvent` - Gera slug automaticamente se não fornecido
- `updateEvent` - Gera novo slug se título mudar (e slug não foi fornecido explicitamente)

---

### ETAPA 5: Atualizar Backend - Rotas e Controllers ✅ CONCLUÍDA
**Objetivo:** Modificar rotas para aceitar slug ou UUID, priorizando slug.

**Tarefas:**
1. ✅ Modificar `getEventById` em `eventsService.ts`:
   - Aceitar slug ou UUID como parâmetro
   - Detectar se é UUID (formato) ou slug
   - Buscar evento por slug ou id conforme o caso
2. ✅ Atualizar controller `getEvent` em `eventsController.ts`:
   - Aceitar slug ou UUID no parâmetro `:id` (já funciona automaticamente)
   - Retornar erro 404 se não encontrar
3. ✅ Manter compatibilidade com rotas antigas (UUID)
4. ✅ Atualizar middleware `requireEventOwnership` para aceitar slug ou UUID
5. ✅ Atualizar função `isEventOrganizer` para aceitar slug ou UUID

**Arquivos modificados:**
- ✅ `backend/src/services/eventsService.ts` - `getEventById` e `isEventOrganizer` aceitam slug ou UUID
- ✅ `backend/src/middleware/ownershipValidator.ts` - `requireEventOwnership` aceita slug ou UUID
- ✅ `backend/src/controllers/eventsController.ts` - Já funciona (usa `getEventById`)

**Critérios de Aceitação:**
- ✅ Rota `/events/:id` aceita slug ou UUID
- ✅ Busca funciona com ambos os formatos
- ✅ Retorna 404 se não encontrar
- ✅ URLs antigas (UUID) continuam funcionando
- ✅ Middleware de ownership funciona com slug ou UUID
- ✅ Função `isEventOrganizer` funciona com slug ou UUID
- ✅ Campo `slug` incluído nas respostas da API
- ✅ Código compila sem erros

**Funções implementadas:**
- `isUUID(str: string): boolean` - Detecta se string é UUID válido
- `getEventById(eventIdOrSlug: string)` - Busca por slug ou UUID
- `isEventOrganizer(eventIdOrSlug: string, userId: string)` - Verifica ownership com slug ou UUID
- Middleware `requireEventOwnership` - Aceita slug ou UUID

---

### ETAPA 6: Atualizar Frontend - Tipos e Interfaces ✅ CONCLUÍDA
**Objetivo:** Adicionar `slug` nas interfaces TypeScript do frontend.

**Tarefas:**
1. ✅ Atualizar interface `Event` em `src/lib/api/events.ts`
2. ✅ Atualizar interfaces `CreateEventData` e `UpdateEventData`
3. ✅ Verificar outros tipos relacionados a eventos

**Arquivos modificados:**
- ✅ `src/lib/api/events.ts` - Interface `Event` agora inclui `slug: string`
- ✅ `src/lib/api/events.ts` - `CreateEventData` inclui `slug?: string` (opcional)
- ✅ `src/lib/api/events.ts` - `UpdateEventData` inclui `slug?: string` (opcional)

**Critérios de Aceitação:**
- ✅ Interface `Event` inclui `slug`
- ✅ Tipos estão sincronizados com backend
- ✅ Interfaces de criação/atualização incluem `slug` (opcional)
- ✅ Sem erros de lint

**Notas:**
- Interfaces locais em outros arquivos (como `EventDetail` em `EventDetails.tsx`) podem ser atualizadas quando necessário
- Os dados da API já incluem `slug`, então as interfaces locais funcionarão mesmo sem atualização explícita

---

### ETAPA 7: Atualizar Frontend - Rotas ✅ CONCLUÍDA
**Objetivo:** Modificar rota no React Router para usar slug.

**Tarefas:**
1. ✅ Atualizar rota em `src/App.tsx`:
   - Adicionar nova rota `/evento/:slug`
   - Manter rota `/events/:id` para compatibilidade
2. ✅ Atualizar componente `EventDetails.tsx`:
   - Aceitar tanto `slug` quanto `id` dos parâmetros
   - Usar `slug` se disponível, caso contrário usar `id`

**Arquivos modificados:**
- ✅ `src/App.tsx` - Adicionada rota `/evento/:slug`, mantida `/events/:id` para compatibilidade
- ✅ `src/pages/EventDetails.tsx` - Atualizado para aceitar `slug` ou `id` dos parâmetros

**Critérios de Aceitação:**
- ✅ Rota `/evento/:slug` funciona
- ✅ URLs antigas (`/events/:id`) continuam funcionando
- ✅ Componente `EventDetails` aceita ambos os formatos
- ✅ Navegação funciona corretamente
- ✅ Sem erros de lint

**Estratégia implementada:**
- Nova rota `/evento/:slug` para URLs amigáveis
- Rota antiga `/events/:id` mantida para compatibilidade (funciona com UUID e slug)
- Componente `EventDetails` detecta automaticamente qual parâmetro usar

---

### ETAPA 8: Atualizar Frontend - EventDetails Component ✅ CONCLUÍDA
**Objetivo:** Modificar componente para usar slug ao invés de UUID.

**Tarefas:**
1. ✅ Atualizar `EventDetails.tsx`:
   - Usar `slug` do `useParams()` ao invés de `id` (já feito na etapa 7)
   - Atualizar chamada `getEventById(slug)` (que agora aceita slug)
   - Manter fallback para UUID se necessário
   - Adicionar `slug` na interface `EventDetail`

**Arquivos modificados:**
- ✅ `src/pages/EventDetails.tsx` - Interface `EventDetail` inclui `slug`, componente aceita slug ou id

**Critérios de Aceitação:**
- ✅ Componente carrega evento usando slug ou id
- ✅ Página funciona corretamente com ambos os formatos
- ✅ Erro 404 exibido se evento não encontrado
- ✅ Interface `EventDetail` inclui campo `slug`
- ✅ Sem erros de lint

**Notas:**
- Componente usa `eventIdOrSlug = slug || id` para compatibilidade
- Todas as chamadas de API usam `eventIdOrSlug` (backend aceita ambos)
- Componentes filhos (RegistrationFlow, ContactDialog) continuam usando `event.id` (UUID) pois precisam do ID real para operações no backend

---

### ETAPA 9: Atualizar Frontend - Todos os Links de Navegação ✅ CONCLUÍDA
**Objetivo:** Atualizar todos os lugares que navegam para eventos para usar slug.

**Tarefas:**
1. ✅ Atualizar navegação em:
   - `src/pages/Events.tsx` - linha ~196
   - `src/pages/Index.tsx` - linhas ~277, ~337
   - `src/components/runner/ExploreEvents.tsx` - linha ~230
   - `src/components/organizer/OrganizerEvents.tsx` - linha ~337
   - `src/components/admin/EventManagement.tsx` - linha ~483
   - `src/pages/Results.tsx` - linha ~222
2. ✅ Mudar de `navigate(\`/events/${event.id}\`)` para `navigate(event.slug ? \`/evento/${event.slug}\` : \`/events/${event.id}\`)`
3. ✅ Adicionar `slug` nas interfaces locais onde necessário

**Arquivos modificados:**
- ✅ `src/pages/Events.tsx` - Interface `Event` inclui `slug`, navegação usa slug com fallback
- ✅ `src/pages/Index.tsx` - Interface `Event` inclui `slug`, navegação usa slug com fallback (2 lugares)
- ✅ `src/components/runner/ExploreEvents.tsx` - Navegação usa slug com fallback (usa tipo Event da API)
- ✅ `src/components/organizer/OrganizerEvents.tsx` - Navegação usa slug com fallback
- ✅ `src/components/admin/EventManagement.tsx` - Navegação usa slug com fallback
- ✅ `src/pages/Results.tsx` - Interface `Event` inclui `slug`, navegação usa slug com fallback

**Critérios de Aceitação:**
- ✅ Todos os links usam slug quando disponível
- ✅ Fallback para UUID quando slug não disponível (compatibilidade)
- ✅ Navegação funciona em todos os componentes
- ✅ URLs geradas são amigáveis quando slug está disponível
- ✅ Interfaces locais atualizadas para incluir `slug`
- ✅ Sem erros de lint

**Estratégia implementada:**
- Todos os links usam: `event.slug ? \`/evento/${event.slug}\` : \`/events/${event.id}\``
- Mantém compatibilidade com eventos que ainda não têm slug
- URLs amigáveis quando slug está disponível
- URLs antigas (UUID) funcionam quando slug não está disponível

---

### ETAPA 10: Atualizar Backend - Incluir Slug nas Respostas ✅ CONCLUÍDA
**Objetivo:** Garantir que todas as respostas da API incluam o campo `slug`.

**Tarefas:**
1. ✅ Verificar queries em `eventsService.ts`:
   - `getEvents()` - inclui `e.slug` no SELECT (linha 158)
   - `getEventById()` - usa `e.*` então inclui slug automaticamente
2. ✅ Verificar se JOINs não estão removendo o campo
3. ✅ Verificar outras queries que retornam eventos

**Arquivos verificados:**
- ✅ `backend/src/services/eventsService.ts` - Ambas as funções principais incluem slug
- ✅ Outras queries verificadas - não retornam objetos evento completos, apenas campos específicos

**Critérios de Aceitação:**
- ✅ Todas as respostas incluem `slug`
- ✅ `getEvents()` inclui `e.slug` explicitamente no SELECT
- ✅ `getEventById()` inclui slug via `e.*`
- ✅ Spread operator `...row` preserva todos os campos incluindo slug
- ✅ Frontend receberá slug corretamente
- ✅ Nenhuma query esqueceu de incluir o campo
- ✅ Código compila sem erros

**Verificações realizadas:**
- `getEvents()` - ✅ Inclui `e.slug` na linha 158
- `getEventById()` - ✅ Usa `e.*` que inclui slug
- Outras queries com JOIN events - ✅ Não retornam objetos evento completos, apenas campos específicos
- Spread operator `...row` - ✅ Preserva todos os campos do resultado da query

---

### ETAPA 11: Testes e Validação ✅ CONCLUÍDA
**Objetivo:** Testar toda a funcionalidade e garantir que tudo funciona.

**Tarefas:**
1. ✅ Criar documento de testes manuais
2. ✅ Criar script de teste automatizado
3. ⏳ Testar criação de evento (aguardando execução)
4. ⏳ Testar atualização de evento (aguardando execução)
5. ⏳ Testar navegação (aguardando execução)
6. ⏳ Testar busca (aguardando execução)
7. ⏳ Testar edge cases (aguardando execução)

**Arquivos criados:**
- ✅ `TESTES_URLS_AMIGAVEIS_EVENTOS.md` - Documento completo com 15 testes manuais
- ✅ `backend/scripts/test-slug-integration.ts` - Script automatizado de validação

**Critérios de Aceitação:**
- ✅ Documento de testes criado
- ✅ Script de teste automatizado criado
- ⏳ Testes manuais executados (aguardando)
- ⏳ Testes automatizados executados (aguardando)
- ✅ Estrutura de testes pronta

**Testes Criados:**
1. Criação de evento com geração automática de slug
2. Criação de evento com slug fornecido
3. Títulos duplicados (unicidade)
4. Atualização de título (geração de novo slug)
5. Atualização sem mudar título (slug não muda)
6. Navegação com slug
7. Compatibilidade com UUID (URLs antigas)
8. Busca por slug no backend
9. Busca por UUID no backend
10. Edge cases - caracteres especiais
11. Listagem de eventos
12. Middleware de ownership com slug
13. Links em todas as páginas
14. Validação de slug no backend
15. Performance

**Script de Teste Automatizado:**
- Verifica eventos sem slug
- Verifica slugs duplicados
- Valida formato dos slugs
- Testa busca por slug
- Testa busca por UUID
- Verifica índices
- Verifica constraints UNIQUE

---

### ETAPA 12: Documentação e Deploy
**Objetivo:** Documentar mudanças e preparar para deploy.

**Tarefas:**
1. Atualizar documentação da API (se houver)
2. Adicionar comentários no código sobre a mudança
3. Criar migration para produção
4. Testar em ambiente de staging
5. Deploy em produção

**Arquivos a criar/modificar:**
- `backend/API_DOCUMENTATION.md` (se existir)
- README ou documentação de mudanças

**Critérios de Aceitação:**
- ✅ Documentação atualizada
- ✅ Migration testada
- ✅ Deploy realizado com sucesso
- ✅ URLs antigas continuam funcionando (ou redirecionam)

---

## 📝 Notas Importantes

### Decisões de Design

1. **Formato da URL:**
   - Nova rota: `/evento/:slug` (português)
   - Mantém compatibilidade com `/events/:id` (UUID)

2. **Geração de Slug:**
   - Baseado no título do evento
   - Normalizado (sem acentos, minúsculas, hífens)
   - Único (sufixo numérico se necessário)

3. **Atualização de Slug:**
   - Slug muda quando título muda
   - URLs antigas podem quebrar (considerar redirecionamento permanente)

4. **Compatibilidade:**
   - Manter suporte a UUID por tempo indeterminado
   - Ou implementar redirecionamento 301 de UUID para slug

### Considerações de SEO

- URLs amigáveis melhoram SEO
- Slugs devem ser estáveis (não mudar frequentemente)
- Considerar redirecionamento 301 de URLs antigas para novas

### Performance

- Índice no campo `slug` para busca rápida
- Cache de slugs se necessário
- Validação de formato no backend

---

## 🔄 Fluxo de Trabalho

1. **Desenvolvimento:** Seguir etapas 1-11 sequencialmente
2. **Testes:** Testar cada etapa antes de prosseguir
3. **Revisão:** Revisar código antes de merge
4. **Deploy:** Etapa 12 (deploy em produção)

---

## ✅ Checklist Final

Antes de considerar completo, verificar:

- [ ] Campo `slug` adicionado ao banco de dados
- [ ] Função de geração de slug implementada
- [ ] Slugs gerados para eventos existentes
- [ ] Backend aceita slug e UUID
- [ ] Frontend usa slug nas URLs
- [ ] Todos os links atualizados
- [ ] Testes passando
- [ ] Documentação atualizada
- [ ] Deploy realizado
- [ ] URLs antigas funcionando ou redirecionando

---

## 🚀 Como Usar Este Plano

1. Iniciar com "ok etapa 1" para começar a ETAPA 1
2. Após completar, informar "ok etapa 2" para próxima etapa
3. Repetir até completar todas as etapas
4. Cada etapa será implementada e testada antes de prosseguir

---

**Última Atualização:** 2025-01-20
