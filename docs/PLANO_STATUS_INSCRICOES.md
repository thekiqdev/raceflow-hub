# Plano de Implementação: Status de Inscrições para Eventos

## 📋 Objetivo
Implementar um sistema de controle de status de inscrições que permita aos organizadores gerenciar quando as inscrições estão abertas, mesmo quando o evento está publicado. O sistema suportará controle manual e automático baseado em datas.

## 🎯 Status a Implementar

1. **Publicado: Inscrições em Breve**
   - Evento visível para todos
   - Inscrições ainda não estão abertas
   - Botão de inscrição mostra "Inscrições em breve"

2. **Publicado: Inscrições Abertas**
   - Evento visível para todos
   - Inscrições abertas e aceitando novos participantes
   - Botão de inscrição habilitado

3. **Publicado: Inscrições Encerradas**
   - Evento visível para todos
   - Inscrições não estão mais aceitando novos participantes
   - Botão de inscrição desabilitado ou mostra "Inscrições encerradas"

---

## 📝 Etapas de Implementação

### ✅ Etapa 1: Análise e Decisão de Arquitetura

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Definir a melhor abordagem técnica para implementar os novos status.

**Tarefas:**
- [x] Analisar estrutura atual do banco de dados (tabela `events`)
- [x] Decidir entre:
  - Opção A: Adicionar novo campo `registration_status` (TEXT) na tabela `events`
  - Opção B: Adicionar novos valores ao ENUM `event_status`
  - Opção C: Usar campos de data (`registration_start_date`, `registration_end_date`) para controle automático
- [x] Documentar decisão e justificativa

**📄 Documento de Decisão:** Ver `docs/DECISAO_ARQUITETURA_STATUS_INSCRICOES.md` para análise completa e justificativa detalhada.

**Decisão Recomendada:** Opção A + C (Híbrida) - Adicionar campo `registration_status` separado + campos de data para automação
- Mantém compatibilidade com status existente
- Permite flexibilidade futura
- Facilita migração de dados existentes
- Suporta controle automático baseado em datas
- Permite controle manual quando necessário

**Campos a adicionar:**
- `registration_status` (TEXT) - Status manual ou calculado automaticamente
- `registration_start_date` (TIMESTAMP) - Data/hora de abertura das inscrições
- `registration_end_date` (TIMESTAMP) - Data/hora de encerramento das inscrições
- `registration_auto_mode` (BOOLEAN) - Se `true`, calcula status automaticamente baseado nas datas

**Valores do campo `registration_status`:**
- `'not_open'` - Inscrições em breve
- `'open'` - Inscrições abertas
- `'closed'` - Inscrições encerradas
- `NULL` - Usar lógica padrão baseada no `status` do evento (retrocompatibilidade)

**Lógica Automática (quando `registration_auto_mode = true`):**
- Se `NOW() < registration_start_date` → `registration_status = 'not_open'`
- Se `registration_start_date <= NOW() <= registration_end_date` → `registration_status = 'open'`
- Se `NOW() > registration_end_date` → `registration_status = 'closed'`

---

### ✅ Etapa 2: Criação da Migration do Banco de Dados

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Adicionar os campos de controle de inscrições na tabela `events`.

**Tarefas:**
- [x] Criar arquivo de migration: `backend/migrations/063_add_registration_status_to_events.sql`
- [x] Adicionar coluna `registration_status TEXT` na tabela `events`
- [x] Adicionar coluna `registration_start_date TIMESTAMP WITH TIME ZONE` na tabela `events`
- [x] Adicionar coluna `registration_end_date TIMESTAMP WITH TIME ZONE` na tabela `events`
- [x] Adicionar coluna `registration_auto_mode BOOLEAN DEFAULT false` na tabela `events`
- [x] Adicionar constraint CHECK para validar valores permitidos: `'not_open'`, `'open'`, `'closed'`
- [x] Adicionar constraint CHECK para validar que `registration_end_date >= registration_start_date` (quando ambos não forem NULL)
- [x] Adicionar comentários nas colunas explicando seu uso
- [x] Criar índices se necessário para performance (especialmente em `registration_start_date` e `registration_end_date`)
- [x] Atualizar `backend/scripts/run-migrations.ts` para incluir a nova migration
- [ ] Testar a migration em ambiente de desenvolvimento (pendente execução)

**SQL Sugerido:**
```sql
-- Adicionar coluna de status de inscrições
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_status TEXT 
CHECK (registration_status IS NULL OR registration_status IN ('not_open', 'open', 'closed'));

-- Adicionar colunas de data para controle automático
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_start_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_end_date TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna para modo automático
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_auto_mode BOOLEAN DEFAULT false;

-- Adicionar constraint para validar que data fim >= data início
ALTER TABLE public.events
ADD CONSTRAINT chk_registration_dates 
CHECK (
  registration_start_date IS NULL OR 
  registration_end_date IS NULL OR 
  registration_end_date >= registration_start_date
);

-- Comentários
COMMENT ON COLUMN public.events.registration_status IS 
'Status das inscrições: not_open (em breve), open (abertas), closed (encerradas). NULL usa lógica padrão baseada no status do evento.';

COMMENT ON COLUMN public.events.registration_start_date IS 
'Data/hora de abertura das inscrições. Usado para cálculo automático do status quando registration_auto_mode = true.';

COMMENT ON COLUMN public.events.registration_end_date IS 
'Data/hora de encerramento das inscrições. Usado para cálculo automático do status quando registration_auto_mode = true.';

COMMENT ON COLUMN public.events.registration_auto_mode IS 
'Se true, o status de inscrições é calculado automaticamente baseado nas datas. Se false, usa o valor manual de registration_status.';

-- Criar índices para performance em queries de eventos com inscrições abertas
CREATE INDEX IF NOT EXISTS idx_events_registration_dates 
ON public.events(registration_start_date, registration_end_date) 
WHERE registration_auto_mode = true;

CREATE INDEX IF NOT EXISTS idx_events_registration_status 
ON public.events(registration_status) 
WHERE registration_status IS NOT NULL;
```

---

### ✅ Etapa 3: Atualização dos Tipos TypeScript no Backend

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Atualizar interfaces e tipos para incluir os novos campos.

**Tarefas:**
- [x] Atualizar `backend/src/types/index.ts`:
  - Adicionar tipo `EventRegistrationStatus = 'not_open' | 'open' | 'closed'`
  - Atualizar interface `Event` para incluir:
    - `registration_status?: EventRegistrationStatus | null`
    - `registration_start_date?: Date | null`
    - `registration_end_date?: Date | null`
    - `registration_auto_mode?: boolean | null`
- [x] Atualizar `backend/src/services/eventsService.ts`:
  - Adicionar os novos campos nas interfaces `CreateEventData` e `UpdateEventData`
  - Atualizar funções `createEvent` e `updateEvent` para salvar os novos campos
  - Criar função auxiliar `calculateRegistrationStatus(event: Partial<Event>): EventRegistrationStatus | null` que calcula o status baseado nas datas quando `registration_auto_mode = true`
  - Atualizar `getEventById` e `getEvents` para calcular automaticamente o status quando necessário e incluir os novos campos nas queries
- [ ] Verificar e atualizar outros arquivos que usam a interface `Event` (será feito conforme necessário nas próximas etapas)

---

### ✅ Etapa 4: Atualização dos Controllers e Validações no Backend

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Atualizar validações e lógica de negócio para usar os novos campos.

**Tarefas:**
- [x] Atualizar `backend/src/controllers/eventsController.ts`:
  - Adicionar campos no schema Zod de criação/atualização de eventos:
    - `registration_status` (opcional, enum: `'not_open' | 'open' | 'closed' | null`)
    - `registration_start_date` (opcional, datetime)
    - `registration_end_date` (opcional, datetime)
    - `registration_auto_mode` (opcional, boolean)
  - Adicionar validação: se `registration_auto_mode = true`, então `registration_start_date` e `registration_end_date` são obrigatórios
  - Adicionar validação: `registration_end_date >= registration_start_date`
  - Ao salvar evento, se `registration_auto_mode = true`, calcular e atualizar `registration_status` automaticamente (já implementado no service)
- [x] Atualizar `backend/src/controllers/registrationsController.ts`:
  - Criar função auxiliar `getEffectiveRegistrationStatus(event: Event): EventRegistrationStatus | null` que:
    - Se `registration_auto_mode = true` → calcula status baseado nas datas
    - Se `registration_auto_mode = false` → retorna `registration_status` manual
    - Se ambos NULL → retorna NULL (usa lógica antiga)
  - Modificar função `createRegistrationController` para usar `getEffectiveRegistrationStatus`
  - Lógica de validação:
    - Se status efetivo = `'not_open'` → bloqueia com mensagem "Inscrições em breve" (incluindo data quando modo automático)
    - Se status efetivo = `'closed'` → bloqueia com mensagem "Inscrições encerradas" (incluindo data quando modo automático)
    - Se status efetivo = `'open'` → permite inscrição (se evento publicado)
    - Se status efetivo = `NULL` → usa lógica antiga (retrocompatibilidade)
  - Atualizar `createRegistrationByOrganizerController` e `createRegistrationByLeaderController` com mesma lógica
- [x] Atualizar mensagens de erro para serem mais específicas, incluindo informações sobre datas quando aplicável

**Lógica de Validação Sugerida:**
```typescript
// Função auxiliar para calcular status efetivo
function getEffectiveRegistrationStatus(event: Event): RegistrationStatus | null {
  // Se modo automático está ativado, calcular baseado nas datas
  if (event.registration_auto_mode && event.registration_start_date && event.registration_end_date) {
    const now = new Date();
    const startDate = new Date(event.registration_start_date);
    const endDate = new Date(event.registration_end_date);
    
    if (now < startDate) {
      return 'not_open';
    } else if (now >= startDate && now <= endDate) {
      return 'open';
    } else {
      return 'closed';
    }
  }
  
  // Caso contrário, usar status manual
  return event.registration_status || null;
}

// Verificar status de inscrições
const effectiveStatus = getEffectiveRegistrationStatus(event);

if (effectiveStatus === 'not_open') {
  return res.status(400).json({
    success: false,
    error: 'Registrations not open yet',
    message: event.registration_auto_mode && event.registration_start_date
      ? `As inscrições abrem em ${formatDate(event.registration_start_date)}.`
      : 'As inscrições ainda não estão abertas. Aguarde o anúncio oficial.',
  });
}

if (effectiveStatus === 'closed') {
  return res.status(400).json({
    success: false,
    error: 'Registrations closed',
    message: event.registration_auto_mode && event.registration_end_date
      ? `As inscrições foram encerradas em ${formatDate(event.registration_end_date)}.`
      : 'As inscrições para este evento foram encerradas.',
  });
}

// Se effectiveStatus for NULL, usar lógica antiga
if (effectiveStatus === null) {
  // Lógica atual baseada em event.status
}
```

---

### ✅ Etapa 5: Atualização das Interfaces TypeScript no Frontend

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Atualizar tipos e interfaces no frontend para incluir os novos campos.

**Tarefas:**
- [x] Atualizar `src/lib/api/events.ts`:
  - Adicionar tipo `EventRegistrationStatus = 'not_open' | 'open' | 'closed'`
  - Adicionar na interface `Event`:
    - `registration_status?: EventRegistrationStatus | null`
    - `registration_start_date?: string | null` (ISO datetime string)
    - `registration_end_date?: string | null` (ISO datetime string)
    - `registration_auto_mode?: boolean`
  - Adicionar os novos campos nas interfaces `CreateEventData` e `UpdateEventData`
  - Criar função `getEffectiveRegistrationStatus(event: Event)` que calcula status baseado em modo automático ou manual
- [x] Criar arquivo utilitário `src/lib/utils/eventRegistration.ts`:
  - Re-exportar `getEffectiveRegistrationStatus`
  - Criar funções auxiliares:
    - `isRegistrationOpen(event)` - verifica se inscrições estão abertas
    - `isRegistrationNotOpen(event)` - verifica se inscrições estão em breve
    - `isRegistrationClosed(event)` - verifica se inscrições estão encerradas
    - `getRegistrationStatusMessage(event)` - obtém mensagem para exibição
    - `getRegistrationStatusLabel(event)` - obtém label do status
    - `getRegistrationStatusVariant(event)` - obtém variante de cor para badge
- [ ] Verificar e atualizar outros arquivos que usam a interface `Event` no frontend (será feito nas próximas etapas conforme necessário)

---

### OK Etapa 6: Atualização dos Componentes de Criação/Edição de Eventos

**Objetivo:** Adicionar campos para controle de inscrições nos formulários (manual e automático).

**📍 Localização Exata dos Campos:**

#### 1. EventFormDialog.tsx (Organizador)
- **Arquivo:** `src/components/organizer/EventFormDialog.tsx`
- **Aba:** "Publicação" (Tab 6, `TabsContent value="publish"`)
- **Posição:** Logo após o `FormField` de "Status do Evento" (após linha ~3096), antes do `Card` "Resumo do Evento"
- **Estrutura:** Será adicionado um novo `Card` com título "Controle de Inscrições"

#### 2. EventViewEditDialog.tsx (Admin)
- **Arquivo:** `src/components/admin/EventViewEditDialog.tsx`
- **Seção:** "Informações Básicas"
- **Posição:** Logo após o grid com campos "Data" e "Status" (após linha ~966), antes do campo "Local"
- **Estrutura:** Será adicionada uma nova seção com `border-t pt-4` para separação visual

**📋 Tarefas Detalhadas:**

- [ ] Atualizar `src/components/organizer/EventFormDialog.tsx`:
  - **Localização:** Aba "Publicação", após campo "Status do Evento"
  - Adicionar novo `Card` com título "Controle de Inscrições" e descrição explicativa
  - Adicionar Checkbox "Modo Automático" (`registration_auto_mode`) no `CardContent`
  - Implementar lógica condicional com `useState` para controlar exibição:
    - Quando modo automático estiver ativado:
      - Mostrar campos de data/hora em grid de 2 colunas:
        - "Data/Hora de Abertura" (`registration_start_date`) - Input type="datetime-local"
        - "Data/Hora de Encerramento" (`registration_end_date`) - Input type="datetime-local"
      - Ocultar campo de seleção manual de status
      - Adicionar validação: data fim >= data início (usar Zod ou validação customizada)
      - Mostrar preview do status calculado baseado nas datas (opcional, usando Badge)
      - Adicionar mensagem informativa: "O status será atualizado automaticamente baseado nas datas"
    - Quando modo automático estiver desativado:
      - Mostrar `FormField` com `Select` contendo opções:
        - "Inscrições em Breve" (valor: `'not_open'`)
        - "Inscrições Abertas" (valor: `'open'`)
        - "Inscrições Encerradas" (valor: `'closed'`)
        - "Usar Status Padrão" (valor: `null` ou vazio)
      - Ocultar campos de data
      - Adicionar mensagem informativa: "Controle manual do status de inscrições"
  - Adicionar campos ao schema Zod (`eventFormSchema`)
  - Adicionar validação e lógica de salvamento no `onSubmit`
  - Incluir os novos campos no payload ao criar/atualizar evento

- [ ] Atualizar `src/components/admin/EventViewEditDialog.tsx`:
  - **Localização:** Seção "Informações Básicas", após grid com "Data" e "Status"
  - Adicionar mesma estrutura e lógica do EventFormDialog
  - Usar `formData` state existente para gerenciar os campos
  - Permitir edição de todos os campos de controle de inscrições
  - Garantir que campos sejam salvos no `handleSave`

- [ ] Adicionar labels e descrições claras para cada opção:
  - Tooltip no checkbox "Modo Automático" explicando o funcionamento
  - Labels descritivos nos campos de data
  - Placeholders informativos nos inputs
  - Mensagens de ajuda abaixo dos campos

- [ ] Adicionar validações:
  - Se `registration_auto_mode = true`, então `registration_start_date` e `registration_end_date` são obrigatórios
  - `registration_end_date >= registration_start_date`
  - Exibir mensagens de erro claras quando validação falhar

- [ ] Adicionar estilos e feedback visual:
  - Usar cores consistentes com o design system
  - Adicionar ícones apropriados (Calendar, Clock, etc.)
  - Mostrar estado de loading durante salvamento
  - Feedback visual ao alternar entre modos

**📄 Referência:** Ver documento detalhado em `docs/LOCALIZACAO_CAMPOS_INSCRICOES.md` para código de exemplo completo.

---

### OK Etapa 7: Atualização da Lógica de Inscrição no Frontend

**Objetivo:** Atualizar o fluxo de inscrição para verificar o status efetivo (calculado ou manual).

**Tarefas:**
- [ ] Atualizar `src/components/event/RegistrationFlow.tsx`:
  - Importar ou criar função `getEffectiveRegistrationStatus(event)` 
  - Adicionar verificação do status efetivo antes de permitir inscrição
  - Exibir mensagens apropriadas:
    - `'not_open'` → 
      - Se modo automático: "Inscrições abrem em [data/hora]"
      - Se modo manual: "Inscrições em breve. Aguarde o anúncio oficial."
    - `'closed'` → 
      - Se modo automático: "As inscrições foram encerradas em [data/hora]"
      - Se modo manual: "As inscrições para este evento foram encerradas."
    - `'open'` ou `null` → permite inscrição (se outras condições forem atendidas)
  - Desabilitar botão de inscrição quando status não permitir
  - Mostrar contador regressivo quando `registration_status === 'not_open'` e modo automático (opcional)
- [ ] Atualizar validação no `handleSubmit` para incluir verificação do status efetivo

---

### OK Etapa 8: Atualização da Visualização Pública do Evento

**Objetivo:** Atualizar a página de detalhes do evento para mostrar o status de inscrições (calculado ou manual).

**Tarefas:**
- [ ] Atualizar `src/pages/EventDetails.tsx`:
  - Usar função `getEffectiveRegistrationStatus(event)` para obter status efetivo
  - Adicionar badge ou indicador visual do status de inscrições
  - Exibir mensagem apropriada:
    - `'not_open'` → Badge "Inscrições em Breve" (cor: amarelo/laranja)
      - Se modo automático: mostrar "Abre em [data/hora]" abaixo do badge
    - `'open'` → Badge "Inscrições Abertas" (cor: verde)
      - Se modo automático: mostrar "Encerra em [data/hora]" abaixo do badge
    - `'closed'` → Badge "Inscrições Encerradas" (cor: cinza)
      - Se modo automático: mostrar "Encerradas em [data/hora]" abaixo do badge
  - Atualizar botão de inscrição:
    - Desabilitar quando status efetivo = `'not_open'` ou `'closed'`
    - Mostrar tooltip explicativo quando desabilitado (incluindo data quando aplicável)
    - Texto do botão pode variar: "Inscrever-se", "Inscrições em Breve", "Inscrições Encerradas"
  - Adicionar seção informativa mostrando datas de abertura/encerramento quando modo automático estiver ativado
- [ ] Adicionar estilos visuais para cada status (cores, ícones)

---

### OK Etapa 9: Atualização das Listagens de Eventos

**Objetivo:** Mostrar o status de inscrições nas listagens de eventos.

**Tarefas:**
- [ ] Atualizar `src/pages/Events.tsx` (página pública de listagem):
  - Adicionar badge de status de inscrições em cada card de evento
  - Usar cores e ícones consistentes
- [ ] Atualizar `src/components/admin/EventManagement.tsx`:
  - Adicionar coluna ou badge mostrando `registration_status`
  - Permitir filtro por status de inscrições (opcional)
- [ ] Atualizar `src/components/organizer/OrganizerEvents.tsx`:
  - Adicionar indicador visual do status de inscrições
  - Mostrar informações relevantes na tabela

---

### OK Etapa 10: Implementação de Job/Tarefa Agendada para Atualização Automática

**Objetivo:** Criar sistema que atualiza automaticamente o status de inscrições baseado nas datas.

**Tarefas:**
- [ ] Criar serviço `backend/src/services/registrationStatusService.ts`:
  - Função `updateRegistrationStatuses()` que:
    - Busca todos os eventos com `registration_auto_mode = true`
    - Calcula status baseado nas datas atuais
    - Atualiza `registration_status` no banco quando necessário
    - Registra logs de mudanças
  - Função `updateEventRegistrationStatus(eventId: string)` para atualizar um evento específico
- [ ] Criar endpoint administrativo (opcional) `POST /api/admin/update-registration-statuses` para execução manual
- [ ] Implementar job agendado usando uma das opções:
  - **Opção A:** Cron job usando biblioteca `node-cron` ou similar
  - **Opção B:** Verificação em cada requisição de evento (menos eficiente, mas mais simples)
  - **Opção C:** Webhook ou tarefa externa (ex: GitHub Actions, AWS Lambda)
- [ ] Configurar frequência de execução (sugestão: a cada 1-5 minutos)
- [ ] Adicionar logs e monitoramento
- [ ] Testar atualização automática em diferentes cenários

**Código Sugerido para Serviço:**
```typescript
// backend/src/services/registrationStatusService.ts
export async function updateRegistrationStatuses() {
  const now = new Date();
  
  // Buscar eventos com modo automático ativado
  const events = await query(`
    SELECT id, registration_start_date, registration_end_date, registration_status
    FROM events
    WHERE registration_auto_mode = true
    AND status = 'published'
  `);
  
  for (const event of events.rows) {
    let newStatus: 'not_open' | 'open' | 'closed' | null = null;
    
    if (event.registration_start_date && event.registration_end_date) {
      const startDate = new Date(event.registration_start_date);
      const endDate = new Date(event.registration_end_date);
      
      if (now < startDate) {
        newStatus = 'not_open';
      } else if (now >= startDate && now <= endDate) {
        newStatus = 'open';
      } else {
        newStatus = 'closed';
      }
      
      // Atualizar apenas se status mudou
      if (event.registration_status !== newStatus) {
        await query(
          `UPDATE events SET registration_status = $1, updated_at = NOW() WHERE id = $2`,
          [newStatus, event.id]
        );
        console.log(`✅ Evento ${event.id}: status atualizado de ${event.registration_status} para ${newStatus}`);
      }
    }
  }
}
```

---

### OK Etapa 11: Migração de Dados Existentes

**Objetivo:** Garantir que eventos existentes funcionem corretamente após a implementação.

**Tarefas:**
- [ ] Criar script de migração de dados (opcional):
  - Eventos com `status = 'published'` → `registration_status = 'open'` (padrão)
  - Eventos com `status = 'draft'` → `registration_status = NULL` (mantém comportamento atual)
  - Eventos com `status = 'finished'` ou `'cancelled'` → `registration_status = 'closed'`
- [ ] Testar retrocompatibilidade:
  - Eventos com `registration_status = NULL` devem usar lógica antiga
  - Eventos existentes devem continuar funcionando normalmente

**SQL de Migração Sugerido:**
```sql
-- Atualizar eventos existentes com valores padrão
-- Eventos publicados ficam com inscrições abertas por padrão
-- Eventos finalizados/cancelados ficam com inscrições encerradas
UPDATE public.events
SET 
  registration_status = CASE
    WHEN status = 'published' THEN 'open'
    WHEN status = 'finished' OR status = 'cancelled' THEN 'closed'
    ELSE NULL
  END,
  registration_auto_mode = false  -- Modo manual por padrão para eventos existentes
WHERE registration_status IS NULL;

-- Opcional: Para eventos futuros publicados, pode-se definir datas automáticas
-- baseadas na data do evento (ex: abrir 30 dias antes, fechar 1 dia antes)
-- UPDATE public.events
-- SET 
--   registration_start_date = event_date - INTERVAL '30 days',
--   registration_end_date = event_date - INTERVAL '1 day',
--   registration_auto_mode = true
-- WHERE status = 'published' 
--   AND event_date > NOW()
--   AND registration_auto_mode = false;
```

---

### ✅ Etapa 12: Atualização de Documentação e Testes

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Documentar as mudanças e garantir que tudo funciona corretamente.

**Tarefas:**
- [x] Atualizar documentação da API (`API_DOCUMENTATION.md`):
  - Documentar novo campo `registration_status`
  - Explicar valores possíveis e comportamento
  - Documentar endpoints administrativos
- [x] Criar documento de resumo da implementação (`RESUMO_IMPLEMENTACAO_STATUS_INSCRICOES.md`)
- [ ] Criar testes manuais (recomendado):
  - Criar evento com cada status de inscrição
  - Verificar bloqueio/permissão de inscrições
  - Verificar mensagens exibidas
  - Verificar retrocompatibilidade
- [ ] Testar fluxo completo (recomendado):
  - Admin/Organizador cria evento com status de inscrições
  - Corredor tenta se inscrever
  - Verificar comportamento em diferentes cenários

---

### ✅ Etapa 13: Revisão e Ajustes Finais

**Status:** ✅ **CONCLUÍDA**

**Objetivo:** Revisar implementação e fazer ajustes necessários.

**Tarefas:**
- [x] Revisar código para garantir consistência
- [x] Verificar se todas as validações estão corretas
- [x] Verificar se mensagens de erro são claras e amigáveis
- [x] Verificar performance (índices, queries)
- [x] Criar documento de revisão final
- [ ] Testar em diferentes navegadores e dispositivos (recomendado)
- [ ] Fazer ajustes finais baseados em feedback (conforme necessário)

---

## 🔄 Fluxo de Trabalho Sugerido

1. **Backend primeiro:** Implementar migration, tipos, controllers e validações
2. **Serviço de automação:** Criar serviço e job agendado para atualização automática
3. **Frontend depois:** Atualizar interfaces, componentes e visualizações
4. **Testes:** Validar cada etapa antes de prosseguir
5. **Migração:** Executar migration e script de dados existentes
6. **Validação final:** Testar fluxo completo end-to-end (manual e automático)

---

## 📍 Localização dos Componentes

### Componentes de Criação/Edição:

1. **EventFormDialog.tsx** (Organizador)
   - **Arquivo:** `src/components/organizer/EventFormDialog.tsx`
   - **Aba:** "Publicação" (Tab 6)
   - **Posição:** Após campo "Status do Evento", antes do "Resumo do Evento"
   - **Linha aproximada:** ~3097

2. **EventViewEditDialog.tsx** (Admin)
   - **Arquivo:** `src/components/admin/EventViewEditDialog.tsx`
   - **Seção:** "Informações Básicas"
   - **Posição:** Após grid com "Data" e "Status", antes do campo "Local"
   - **Linha aproximada:** ~967

### Componentes de Visualização:

3. **EventDetails.tsx** (Página Pública)
   - **Arquivo:** `src/pages/EventDetails.tsx`
   - **Posição:** Próximo ao botão de inscrição, na seção de informações do evento

4. **RegistrationFlow.tsx** (Fluxo de Inscrição)
   - **Arquivo:** `src/components/event/RegistrationFlow.tsx`
   - **Posição:** Validação no início do fluxo, antes de permitir seleção de categoria

5. **Events.tsx** (Listagem Pública)
   - **Arquivo:** `src/pages/Events.tsx`
   - **Posição:** Badge no card de cada evento

6. **EventManagement.tsx** (Admin)
   - **Arquivo:** `src/components/admin/EventManagement.tsx`
   - **Posição:** Coluna adicional na tabela de eventos

7. **OrganizerEvents.tsx** (Organizador)
   - **Arquivo:** `src/components/organizer/OrganizerEvents.tsx`
   - **Posição:** Indicador visual na tabela de eventos

**📄 Documentação Detalhada:** Consulte `docs/LOCALIZACAO_CAMPOS_INSCRICOES.md` para diagramas visuais, código de exemplo e especificações completas de implementação.

---

## 🆕 Principais Mudanças com Automação

### Campos Adicionados:
- `registration_start_date` - Data/hora de abertura das inscrições
- `registration_end_date` - Data/hora de encerramento das inscrições  
- `registration_auto_mode` - Flag para ativar/desativar modo automático

### Funcionalidades:
1. **Modo Automático (`registration_auto_mode = true`):**
   - Status calculado automaticamente baseado nas datas
   - Atualização periódica via job agendado
   - Organizador define apenas as datas, sistema gerencia o status

2. **Modo Manual (`registration_auto_mode = false`):**
   - Organizador define status diretamente
   - Controle total sobre quando abrir/fechar inscrições
   - Útil para casos especiais ou mudanças de última hora

3. **Híbrido:**
   - Sistema permite alternar entre modos
   - Retrocompatibilidade mantida para eventos existentes

---

## 📌 Notas Importantes

- **Retrocompatibilidade:** Eventos existentes com `registration_status = NULL` e `registration_auto_mode = false` devem continuar funcionando com a lógica antiga
- **Validação:** Sempre validar `registration_status` junto com `status` do evento
- **Modo Automático:** Quando `registration_auto_mode = true`, o `registration_status` é calculado dinamicamente baseado nas datas. O valor salvo no banco é atualizado pelo job agendado.
- **Modo Manual:** Quando `registration_auto_mode = false`, o `registration_status` é usado diretamente (controle manual)
- **UX:** Mensagens devem ser claras e informativas para o usuário, incluindo datas quando aplicável
- **Performance:** 
  - Índices criados em `registration_start_date`, `registration_end_date` e `registration_status`
  - Job agendado deve ser executado com frequência adequada (1-5 minutos)
  - Considerar cache do status calculado se necessário
- **Fusos Horários:** Garantir que todas as comparações de data usem o mesmo fuso horário (UTC recomendado)

---

## ✅ Checklist Final

Antes de considerar a implementação completa:

- [ ] Migration criada e testada
- [ ] Backend atualizado (tipos, services, controllers)
- [ ] Frontend atualizado (interfaces, componentes, visualizações)
- [ ] Validações funcionando corretamente
- [ ] Mensagens de erro claras e amigáveis
- [ ] Retrocompatibilidade garantida
- [ ] Testes manuais realizados
- [ ] Documentação atualizada
- [ ] Código revisado e aprovado

---

**Data de Criação:** 2025-01-27  
**Última Atualização:** 2025-01-27  
**Versão:** 2.1 (com automação baseada em datas e localização detalhada)

---

## 📚 Documentos Relacionados

- **Localização Detalhada:** `docs/LOCALIZACAO_CAMPOS_INSCRICOES.md` - Especificações exatas de onde implementar os campos, com código de exemplo e diagramas visuais
