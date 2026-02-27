# Plano de Integração de Notificações

## Objetivo
Integrar 100% o sistema de notificações com todos os gatilhos existentes do sistema, garantindo que os destinatários corretos recebam as notificações nos momentos apropriados.

---

## Análise Atual

### ✅ O que já existe:
- Sistema de templates de notificação criado
- Serviço de envio de emails (SMTP) implementado
- Templates padrão criados no banco de dados
- Interface admin para gerenciar templates

### ❌ O que está faltando:
- **Nenhuma notificação está sendo enviada automaticamente**
- Não há integração nos pontos de gatilho
- Não há funções helper para obter emails dos usuários
- Não há tratamento de erros de envio

---

## Gatilhos Identificados

### 1. **ORÇAMENTOS (Quotes)**
**Local:** `backend/src/controllers/quotesController.ts` → `createQuoteController`

**Gatilho:** Quando um novo orçamento é criado

**Notificações necessárias:**
- ✅ **Admin** recebe: `new_quote_received`
  - **Destinatário:** Email do admin (systemSettings.contact_email ou support_email)
  - **Variáveis:** `quoteName`, `quoteEmail`, `quoteLocation`, `quoteDate`, `quoteDescription`

**Status:** ✅ IMPLEMENTADO

---

### 2. **MENSAGENS DE CONTATO (Contact Messages)**
**Local:** `backend/src/controllers/contactMessagesController.ts` → `createContactMessageController`

**Gatilhos:**
- Quando mensagem tipo `platform` é criada → Admin recebe
- Quando mensagem tipo `event` é criada → Organizer recebe

**Notificações necessárias:**
- ✅ **Admin** recebe (tipo `platform`): `new_contact_message_platform`
  - **Destinatário:** Email do admin
  - **Variáveis:** `senderName`, `senderEmail`, `senderPhone`, `subject`, `message`
  
- ✅ **Organizer** recebe (tipo `event`): `new_contact_message_event`
  - **Destinatário:** Email do organizador (profile.contact_email ou users.email)
  - **Variáveis:** `senderName`, `senderEmail`, `senderPhone`, `subject`, `message`, `eventTitle`

**Status:** ✅ IMPLEMENTADO

---

### 3. **INSCRIÇÕES (Registrations)**

#### 3.1. Criação de Inscrição
**Local:** `backend/src/controllers/registrationsController.ts` → `createRegistrationController`

**Gatilho:** Quando uma nova inscrição é criada

**Notificações necessárias:**
- ✅ **Runner** recebe: `registration_pending` (se pagamento pendente) ou `registration_confirmed` (se gratuito)
  - **Destinatário:** Email do runner (users.email)
  - **Variáveis:** `userName`, `eventTitle`, `registrationCode`, `eventDate`, `eventLocation`, `totalAmount`
  
- ✅ **Organizer** recebe: `new_registration`
  - **Destinatário:** Email do organizador
  - **Variáveis:** `organizerName`, `eventTitle`, `athleteName`, `registrationCode`, `totalAmount`

**Status:** ✅ IMPLEMENTADO

#### 3.2. Confirmação de Pagamento
**Local:** `backend/src/controllers/asaasWebhookController.ts` → `processWebhookEvent` (PAYMENT_CONFIRMED / PAYMENT_RECEIVED)

**Gatilho:** Quando pagamento é confirmado via webhook

**Notificações necessárias:**
- ✅ **Runner** recebe: `payment_received` + `registration_confirmed`
  - **Destinatário:** Email do runner
  - **Variáveis:** `userName`, `amount`, `eventTitle`, `paymentMethod`, `registrationCode`
  - **Variáveis (registration_confirmed):** `userName`, `eventTitle`, `registrationCode`, `eventDate`, `eventLocation`

**Status:** ✅ IMPLEMENTADO

#### 3.3. Inscrição Confirmada (Manual)
**Local:** `backend/src/controllers/registrationsController.ts` → `updateRegistrationController`

**Gatilho:** Quando status é atualizado manualmente para `confirmed` ou `paid`

**Notificações necessárias:**
- ✅ **Runner** recebe: `registration_confirmed`
  - **Destinatário:** Email do runner
  - **Variáveis:** `userName`, `eventTitle`, `registrationCode`, `eventDate`, `eventLocation`

**Status:** ✅ IMPLEMENTADO

#### 3.4. Transferência de Inscrição
**Local:** `backend/src/services/registrationsService.ts` → `transferRegistration`

**Gatilho:** Quando uma inscrição é transferida para outro runner

**Notificações necessárias:**
- ✅ **Runner que transferiu** recebe: `registration_transferred`
  - **Destinatário:** Email do runner que transferiu
  - **Variáveis:** `userName`, `eventTitle`, `registrationCode`, `newRunnerName`, `eventDate`, `eventLocation`
  
- ✅ **Runner que recebeu** recebe: `registration_received`
  - **Destinatário:** Email do runner que recebeu
  - **Variáveis:** `userName`, `eventTitle`, `registrationCode`, `oldRunnerName`, `eventDate`, `eventLocation`

**Status:** ✅ IMPLEMENTADO

#### 3.5. Convite Recebido do Líder
**Local:** `backend/src/services/leaderInvitationsService.ts` → `sendInvitationByCpf` (e reenvio em `resendInvitationEmail`)

**Gatilho:** Quando um líder envia um convite para um runner (ou reenvia o email do convite)

**Notificações necessárias:**
- ✅ **Runner já cadastrado** recebe: `invitation_received`
  - **Destinatário:** Email do runner
  - **Variáveis:** `userName`, `leaderName`, `eventTitle`, `eventDate`, `eventLocation`
- ✅ **Runner pré-cadastrado (sem conta)** recebe: `invitation_received_no_account`
  - **Destinatário:** Email do runner (se informado no pré-cadastro)
  - **Variáveis:** `userName`, `leaderName`, `eventTitle`, `eventDate`, `eventLocation`, `completeRegistrationLink`

**Log quando email/nome ausente:** Em `sendInvitationByCpf`, quando `runner_email` ou `runner_name` estão vazios, é registrado `console.warn('⚠️ [sendInvitationByCpf] Convite enviado mas email não enviado: runner_email ou runner_name ausente', { invitationId, runner_id, has_email, has_name })`.

**Status:** ✅ IMPLEMENTADO

#### 3.6. Completar cadastro (convite sem conta) – validação de token e definição de senha
**Locais:** `backend/src/controllers/invitationCompletionController.ts`, `backend/src/controllers/authController.ts`, `backend/src/routes/invitations.ts`, `backend/src/routes/auth.ts`

**Endpoints (públicos):**
- **GET** `/api/invitations/complete-registration/validate?token=xxx` – Valida o JWT do link de completar cadastro. Retorna `{ valid, runnerName?, eventTitle?, error? }`.
- **POST** `/api/auth/set-password-invitation` – Body: `{ token, newPassword }`. Atualiza a senha do runner e retorna token de login (`{ user, token }`) para o front autenticar.

**Status:** ✅ IMPLEMENTADO

---

## Templates Necessários

### Templates já criados (padrão):
1. ✅ `registration_confirmed` - Inscrição Confirmada (runner)
2. ✅ `registration_pending` - Inscrição Pendente (runner)
3. ✅ `new_registration` - Nova Inscrição Recebida (organizer)
4. ✅ `payment_received` - Pagamento Recebido (runner)
5. ✅ `new_quote_received` - Novo Orçamento Recebido (admin)

### Templates que precisam ser criados:
1. ✅ `new_contact_message_platform` - Nova Mensagem de Contato (Plataforma) (admin)
2. ✅ `new_contact_message_event` - Nova Mensagem de Contato (Evento) (organizer)
3. ✅ `registration_transferred` - Inscrição Transferida (runner que transferiu)
4. ✅ `registration_received` - Inscrição Recebida por Transferência (runner que recebeu)
5. ✅ `invitation_received` - Convite Recebido do Líder (runner já cadastrado)
6. ✅ `invitation_received_no_account` - Convite Recebido (Sem Cadastro – Completar) (runner pré-cadastrado)

---

## Funções Helper Necessárias

### 1. ✅ Obter Email do Usuário
```typescript
// backend/src/services/notificationService.ts
export const getUserEmail = async (userId: string): Promise<string | null>
```
**Status:** ✅ IMPLEMENTADO

### 2. ✅ Obter Email do Admin
```typescript
// backend/src/services/notificationService.ts
export const getAdminEmail = async (): Promise<string | null>
```
**Status:** ✅ IMPLEMENTADO

### 3. ✅ Obter Email do Organizador
```typescript
// backend/src/services/notificationService.ts
export const getOrganizerEmail = async (organizerId: string): Promise<string | null>
```
**Status:** ✅ IMPLEMENTADO

### 4. ✅ Obter Nome do Usuário (Bônus)
```typescript
// backend/src/services/notificationService.ts
export const getUserName = async (userId: string): Promise<string | null>
```
**Status:** ✅ IMPLEMENTADO

### 5. ✅ Enviar Notificação com Tratamento de Erros
```typescript
// Wrapper que tenta enviar e loga erros sem quebrar o fluxo principal
export const sendNotificationSafely = async (options: SendNotificationOptions): Promise<void>
```
**Status:** ✅ IMPLEMENTADO

---

## Plano de Implementação

### ETAPA 1: Criar Funções Helper
**Arquivo:** `backend/src/services/notificationService.ts`

**Tarefas:**
1. ✅ Criar `getUserEmail(userId)` - Busca email na tabela users
2. ✅ Criar `getAdminEmail()` - Busca email nas systemSettings
3. ✅ Criar `getOrganizerEmail(organizerId)` - Busca email do perfil ou users
4. ✅ Criar `getUserName(userId)` - Busca nome do usuário (bônus)
5. ✅ Criar `sendNotificationSafely()` - Wrapper com try/catch para não quebrar fluxo

**Estimativa:** 30 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 2: Criar Templates Faltantes
**Arquivo:** `backend/src/services/notificationTemplatesService.ts`

**Tarefas:**
1. ✅ Adicionar `new_contact_message_platform` aos templates padrão
2. ✅ Adicionar `new_contact_message_event` aos templates padrão
3. ✅ Atualizar `initializeDefaultTemplates()`

**Estimativa:** 15 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 3: Integrar Notificações - Orçamentos
**Arquivo:** `backend/src/controllers/quotesController.ts`

**Tarefas:**
1. ✅ Importar `sendNotificationSafely` e `getAdminEmail`
2. ✅ Após `createQuote()`, enviar notificação para admin
3. ✅ Usar template `new_quote_received`
4. ✅ Mapear variáveis: `quoteName`, `quoteEmail`, `quoteLocation`, `quoteDate`, `quoteDescription`

**Estimativa:** 20 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 4: Integrar Notificações - Mensagens de Contato
**Arquivo:** `backend/src/controllers/contactMessagesController.ts`

**Tarefas:**
1. ✅ Importar funções de notificação
2. ✅ Após `createContactMessage()`:
   - Se `type === 'platform'`: enviar para admin com `new_contact_message_platform`
   - Se `type === 'event'`: enviar para organizer com `new_contact_message_event`
3. ✅ Mapear variáveis corretamente

**Estimativa:** 30 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 5: Integrar Notificações - Criação de Inscrição
**Arquivo:** `backend/src/controllers/registrationsController.ts`

**Tarefas:**
1. ✅ Importar funções de notificação
2. ✅ Criar função helper `sendRegistrationNotifications()` para evitar duplicação
3. ✅ Após `createRegistration()`:
   - Enviar para runner: `registration_pending` ou `registration_confirmed` (dependendo do status)
   - Enviar para organizer: `new_registration`
4. ✅ Adicionar notificações em `createRegistrationByOrganizerController`
5. ✅ Adicionar notificações em `createRegistrationByLeaderController`
6. ✅ Obter dados do evento, runner e organizer
7. ✅ Mapear todas as variáveis necessárias

**Estimativa:** 45 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 6: Integrar Notificações - Confirmação de Pagamento
**Arquivo:** `backend/src/controllers/asaasWebhookController.ts`

**Tarefas:**
1. ✅ Importar funções de notificação
2. ✅ No case `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`:
   - Enviar para runner: `payment_received` e `registration_confirmed`
3. ✅ Obter dados completos da inscrição (com evento) usando `getRegistrationById()`
4. ✅ Mapear variáveis de pagamento
5. ✅ Formatação de valores (R$ X,XX)
6. ✅ Formatação de datas e localização

**Estimativa:** 30 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 7: Integrar Notificações - Atualização Manual de Inscrição
**Arquivo:** `backend/src/controllers/registrationsController.ts`

**Tarefas:**
1. ✅ No `updateRegistrationController`, detectar quando status muda para `confirmed` ou `paid`
2. ✅ Enviar `registration_confirmed` para runner usando função helper `sendRegistrationNotifications()`
3. ✅ Mapear variáveis
4. ✅ Detectar mudanças tanto em `payment_status` quanto em `status`

**Estimativa:** 20 minutos

**Status:** ✅ CONCLUÍDA

---

### ETAPA 8: Testes e Validação
**Tarefas:**
1. Testar cada gatilho individualmente
2. Verificar se emails chegam corretamente
3. Validar variáveis nos templates
4. Testar tratamento de erros (SMTP não configurado, etc.)

**Estimativa:** 1 hora

---

## Resumo de Destinatários

| Tipo de Notificação | Destinatário | Como Obter Email |
|---------------------|--------------|------------------|
| `new_quote_received` | Admin | `systemSettings.contact_email` ou `support_email` |
| `new_contact_message_platform` | Admin | `systemSettings.contact_email` ou `support_email` |
| `new_contact_message_event` | Organizer | `profile.contact_email` ou `users.email` (via organizer_id) |
| `registration_pending` | Runner | `users.email` (via runner_id) |
| `registration_confirmed` | Runner | `users.email` (via runner_id) |
| `new_registration` | Organizer | `profile.contact_email` ou `users.email` (via event.organizer_id) |
| `payment_received` | Runner | `users.email` (via runner_id) |
| `registration_transferred` | Runner (que transferiu) | `users.email` (via old runner_id) |
| `registration_received` | Runner (que recebeu) | `users.email` (via new runner_id) |
| `invitation_received` | Runner (já cadastrado) | `users.email` (via runner_id do convite) |
| `invitation_received_no_account` | Runner (pré-cadastro) | Email informado no pré-cadastro ou `users.email` |

---

## Variáveis Necessárias por Template

### `new_quote_received` (admin)
- `quoteName` - Nome do solicitante
- `quoteEmail` - Email do solicitante
- `quoteLocation` - Local do evento
- `quoteDate` - Data do evento
- `quoteDescription` - Descrição

### `new_contact_message_platform` (admin)
- `senderName` - Nome do remetente
- `senderEmail` - Email do remetente
- `senderPhone` - Telefone do remetente
- `subject` - Assunto
- `message` - Mensagem

### `new_contact_message_event` (organizer)
- `senderName` - Nome do remetente
- `senderEmail` - Email do remetente
- `senderPhone` - Telefone do remetente
- `subject` - Assunto
- `message` - Mensagem
- `eventTitle` - Título do evento

### `registration_pending` (runner)
- `userName` - Nome do corredor
- `eventTitle` - Título do evento
- `registrationCode` - Código da inscrição
- `totalAmount` - Valor total

### `registration_confirmed` (runner)
- `userName` - Nome do corredor
- `eventTitle` - Título do evento
- `registrationCode` - Código da inscrição
- `eventDate` - Data do evento
- `eventLocation` - Local do evento

### `new_registration` (organizer)
- `organizerName` - Nome do organizador
- `eventTitle` - Título do evento
- `athleteName` - Nome do atleta
- `registrationCode` - Código da inscrição
- `totalAmount` - Valor total

### `payment_received` (runner)
- `userName` - Nome do corredor
- `amount` - Valor pago
- `eventTitle` - Título do evento
- `paymentMethod` - Método de pagamento
- `registrationCode` - Código da inscrição

### `registration_transferred` (runner que transferiu)
- `userName` - Nome do corredor que transferiu
- `eventTitle` - Título do evento
- `registrationCode` - Código da inscrição
- `newRunnerName` - Nome do novo titular
- `eventDate` - Data do evento
- `eventLocation` - Local do evento

### `registration_received` (runner que recebeu)
- `userName` - Nome do corredor que recebeu
- `eventTitle` - Título do evento
- `registrationCode` - Código da inscrição
- `oldRunnerName` - Nome de quem transferiu
- `eventDate` - Data do evento
- `eventLocation` - Local do evento

### `invitation_received` (runner já cadastrado)
- `userName` - Nome do runner
- `leaderName` - Nome do líder de grupo
- `eventTitle` - Título do evento
- `eventDate` - Data do evento
- `eventLocation` - Local do evento

### `invitation_received_no_account` (runner pré-cadastrado)
- `userName` - Nome do runner
- `leaderName` - Nome do líder de grupo
- `eventTitle` - Título do evento
- `eventDate` - Data do evento
- `eventLocation` - Local do evento
- `completeRegistrationLink` - URL para completar cadastro (definir senha), com token JWT (válido 7 dias)

---

## Observações Importantes

1. **Não quebrar o fluxo principal:** Todas as notificações devem usar `sendNotificationSafely()` para não interromper operações principais se o envio falhar.

2. **Logs detalhados:** Registrar todos os envios (sucesso e falha) para debugging.

3. **SMTP não configurado:** Se SMTP não estiver configurado, apenas logar e continuar (não quebrar).

4. **Templates inativos:** Verificar se template está ativo antes de enviar.

5. **Email não encontrado:** Se email não for encontrado, logar warning e continuar.

6. **Convites do líder:** Dois templates conforme tipo de runner: `invitation_received` (já cadastrado) e `invitation_received_no_account` (pré-cadastro, com link de completar cadastro). Para checklist de verificação manual (staging, templates no admin), ver **Etapa 8** em `docs/PLANO_CONVITE_NOTIFICACOES_POS_CADASTRO.md`.

---

## Próximos Passos

1. ✅ Criar este plano
2. ⏳ Implementar ETAPA 1 (Funções Helper)
3. ⏳ Implementar ETAPA 2 (Templates Faltantes)
4. ⏳ Implementar ETAPA 3-7 (Integrações)
5. ⏳ Implementar ETAPA 8 (Testes)

**Tempo Total Estimado:** ~3-4 horas

