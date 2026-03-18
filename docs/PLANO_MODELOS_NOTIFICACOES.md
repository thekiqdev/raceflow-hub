# Plano de Implementação - Modelos de Notificações

## Objetivo
Criar um sistema completo de modelos de notificações que permita ao administrador gerenciar templates de emails e notificações para diferentes eventos do sistema, enviados para admin, organizadores e runners.

## Estrutura Atual Analisada
- ✅ Sistema de configurações SMTP em `system_settings`
- ✅ Sistema de announcements para notificações internas
- ✅ Estrutura de roles (admin, organizer, runner)
- ✅ Sistema de configurações de formulários (referência para estrutura similar)

## Etapas de Implementação

---

## ETAPA 1: Estrutura de Banco de Dados
**Objetivo:** Criar tabela para armazenar modelos de notificações

### Tarefas:
1. Criar migration `056_create_notification_templates_table.sql`
2. Campos da tabela:
   - `id` (UUID, PK)
   - `template_key` (TEXT, UNIQUE) - Chave única do template (ex: 'registration_confirmed', 'payment_received')
   - `template_name` (TEXT) - Nome amigável do template
   - `template_type` (TEXT) - Tipo: 'email', 'sms', 'push', 'in_app'
   - `target_audience` (TEXT) - Público-alvo: 'admin', 'organizer', 'runner', 'all'
   - `subject` (TEXT) - Assunto do email (se aplicável)
   - `body_html` (TEXT) - Corpo HTML do template
   - `body_text` (TEXT) - Corpo texto simples (fallback)
   - `variables` (JSONB) - Variáveis disponíveis no template (ex: {userName, eventTitle, etc})
   - `is_active` (BOOLEAN) - Se o template está ativo
   - `is_system` (BOOLEAN) - Se é um template do sistema (não pode ser deletado)
   - `created_at`, `updated_at` (TIMESTAMP)

3. Criar índices:
   - `idx_notification_templates_template_key`
   - `idx_notification_templates_target_audience`
   - `idx_notification_templates_template_type`
   - `idx_notification_templates_is_active`

4. Adicionar migration ao `run-migrations.ts`

**Marcação:** ✅ ETAPA 1

---

## ETAPA 2: Backend - Service Layer
**Objetivo:** Criar serviços para gerenciar templates e enviar notificações

### Tarefas:
1. Criar `backend/src/services/notificationTemplatesService.ts`
   - `getNotificationTemplates(filters?)` - Listar templates
   - `getNotificationTemplateById(id)` - Buscar por ID
   - `getNotificationTemplateByKey(templateKey)` - Buscar por chave
   - `createNotificationTemplate(data)` - Criar template
   - `updateNotificationTemplate(id, data)` - Atualizar template
   - `deleteNotificationTemplate(id)` - Deletar template (verificar is_system)
   - `initializeDefaultTemplates()` - Criar templates padrão do sistema

2. Criar `backend/src/services/notificationService.ts`
   - `sendNotification(templateKey, recipient, variables, options?)` - Enviar notificação
   - `sendEmail(templateKey, recipient, variables)` - Enviar email usando template
   - `sendSMS(templateKey, recipient, variables)` - Enviar SMS (futuro)
   - `sendPushNotification(templateKey, recipient, variables)` - Enviar push (futuro)
   - `renderTemplate(template, variables)` - Renderizar template com variáveis
   - `validateVariables(template, variables)` - Validar variáveis fornecidas

3. Integrar com configurações SMTP existentes em `systemSettingsService`

**Marcação:** ✅ ETAPA 2 - CONCLUÍDA

---

## ETAPA 3: Backend - Controller Layer
**Objetivo:** Criar endpoints REST para gerenciar templates

### Tarefas:
1. Criar `backend/src/controllers/notificationTemplatesController.ts`
   - `getNotificationTemplatesController` - GET /api/notification-templates
   - `getNotificationTemplateByIdController` - GET /api/notification-templates/:id
   - `getNotificationTemplateByKeyController` - GET /api/notification-templates/key/:key
   - `createNotificationTemplateController` - POST /api/notification-templates
   - `updateNotificationTemplateController` - PUT /api/notification-templates/:id
   - `deleteNotificationTemplateController` - DELETE /api/notification-templates/:id
   - `sendTestNotificationController` - POST /api/notification-templates/:id/test

2. Validação com Zod:
   - Schema para criar template
   - Schema para atualizar template
   - Schema para enviar teste

3. Proteção de rotas (apenas admin)

**Marcação:** ✅ ETAPA 3 - CONCLUÍDA

---

## ETAPA 4: Backend - Routes
**Objetivo:** Registrar rotas no servidor

### Tarefas:
1. Criar `backend/src/routes/notificationTemplates.ts`
2. Registrar rotas em `backend/src/server.ts`
3. Aplicar middleware de autenticação

**Marcação:** ✅ ETAPA 4 - CONCLUÍDA

---

## ETAPA 5: Frontend - API Client
**Objetivo:** Criar cliente API para comunicação com backend

### Tarefas:
1. Criar `src/lib/api/notificationTemplates.ts`
   - Interfaces TypeScript para templates
   - Funções para CRUD de templates
   - `getNotificationTemplates(filters?)` - Listar templates
   - `getNotificationTemplateById(id)` - Buscar por ID
   - `getNotificationTemplateByKey(templateKey)` - Buscar por chave
   - `createNotificationTemplate(data)` - Criar template
   - `updateNotificationTemplate(id, data)` - Atualizar template
   - `deleteNotificationTemplate(id)` - Deletar template
   - `initializeDefaultTemplates()` - Inicializar templates padrão

**Marcação:** ✅ ETAPA 5 - CONCLUÍDA

---

## ETAPA 6: Frontend - Componente de Gerenciamento
**Objetivo:** Criar interface admin para gerenciar templates

### Tarefas:
1. Criar `src/components/admin/NotificationTemplates.tsx`
   - Lista de templates com filtros (tipo, público-alvo, status)
   - Visualização/edição de template
   - Editor de HTML/texto para corpo do template
   - Preview do template com variáveis de exemplo
   - Lista de variáveis disponíveis
   - Botão para enviar teste
   - Validação de variáveis

2. Adicionar ao menu admin em `AdminSidebar.tsx`
3. Adicionar rota em `AdminDashboard.tsx`

**Marcação:** ✅ ETAPA 6 - CONCLUÍDA

---

## ETAPA 7: Templates Padrão do Sistema
**Objetivo:** Criar templates padrão para eventos principais

### Templates a criar:
1. **Registrations:**
   - `registration_confirmed` - Inscrição confirmada (runner)
   - `registration_pending` - Inscrição pendente (runner)
   - `registration_cancelled` - Inscrição cancelada (runner)
   - `new_registration` - Nova inscrição recebida (organizer)

2. **Payments:**
   - `payment_received` - Pagamento recebido (runner, organizer)
   - `payment_pending` - Pagamento pendente (runner)
   - `payment_failed` - Pagamento falhou (runner, organizer)

3. **Events:**
   - `event_created` - Evento criado (organizer)
   - `event_published` - Evento publicado (organizer)
   - `event_reminder` - Lembrete de evento (runner)

4. **Transfers:**
   - `transfer_requested` - Solicitação de transferência (runner)
   - `transfer_approved` - Transferência aprovada (runner)
   - `transfer_rejected` - Transferência rejeitada (runner)

5. **Commissions:**
   - `commission_earned` - Comissão ganha (leader)
   - `commission_paid` - Comissão paga (leader)

6. **Invitations:**
   - `invitation_earned` - Convite ganho (leader)
   - `invitation_sent` - Convite enviado (runner)

7. **Admin/System:**
   - `new_quote_received` - Novo orçamento (admin)
   - `new_contact_message` - Nova mensagem de contato (admin/organizer)
   - `user_registered` - Novo usuário registrado (admin)

**Marcação:** ✅ ETAPA 7

---

## ETAPA 8: Integração com Sistema Existente
**Objetivo:** Substituir notificações hardcoded por templates

### Tarefas:
1. Identificar pontos no código onde notificações são criadas
2. Substituir por chamadas ao `notificationService.sendNotification()`
3. Locais principais:
   - `asaasWebhookController.ts` - Transferências
   - `transferRequestController.ts` - Transferências
   - `registrationsController.ts` - Confirmações de inscrição
   - `quotesController.ts` - Novos orçamentos
   - `contactMessagesController.ts` - Novas mensagens

**Marcação:** ✅ ETAPA 8

---

## ETAPA 9: Sistema de Variáveis
**Objetivo:** Definir e documentar variáveis disponíveis por tipo de template

### Variáveis Comuns:
- `{{userName}}` - Nome do usuário
- `{{userEmail}}` - Email do usuário
- `{{eventTitle}}` - Título do evento
- `{{eventDate}}` - Data do evento
- `{{eventLocation}}` - Local do evento
- `{{registrationCode}}` - Código da inscrição
- `{{amount}}` - Valor (formatação de moeda)
- `{{paymentMethod}}` - Método de pagamento
- `{{platformName}}` - Nome da plataforma
- `{{supportEmail}}` - Email de suporte
- `{{contactPhone}}` - Telefone de contato

### Variáveis Específicas:
- Registrations: `{{categoryName}}`, `{{kitName}}`, `{{distance}}`
- Payments: `{{transactionId}}`, `{{paymentDate}}`
- Transfers: `{{oldRunnerName}}`, `{{newRunnerName}}`, `{{transferFee}}`
- Commissions: `{{commissionAmount}}`, `{{eventTitle}}`, `{{athleteName}}`

**Marcação:** ✅ ETAPA 9

---

## ETAPA 10: Editor de Templates
**Objetivo:** Criar editor rico para templates HTML

### Tarefas:
1. Integrar editor WYSIWYG (ex: TinyMCE, Quill, ou React Quill)
2. Suporte para:
   - Formatação de texto (negrito, itálico, etc)
   - Inserção de variáveis via botão
   - Preview em tempo real
   - Templates HTML pré-formatados

**Marcação:** ✅ ETAPA 10

---

## ETAPA 11: Testes e Validação
**Objetivo:** Garantir que o sistema funciona corretamente

### Tarefas:
1. Testar criação/edição de templates
2. Testar envio de notificações
3. Testar renderização de variáveis
4. Testar templates padrão
5. Validar integração com SMTP

**Marcação:** ✅ ETAPA 11

---

## Estrutura de Arquivos a Criar

### Backend:
- `backend/migrations/056_create_notification_templates_table.sql`
- `backend/src/services/notificationTemplatesService.ts`
- `backend/src/services/notificationService.ts`
- `backend/src/controllers/notificationTemplatesController.ts`
- `backend/src/routes/notificationTemplates.ts`

### Frontend:
- `src/lib/api/notificationTemplates.ts`
- `src/components/admin/NotificationTemplates.tsx`

### Documentação:
- `docs/VARIAVEIS_TEMPLATES_NOTIFICACAO.md` (variáveis disponíveis)

---

## Próximos Passos
Após implementação completa, considerar:
- Histórico de notificações enviadas
- Estatísticas de abertura/clique (se email tracking)
- A/B testing de templates
- Agendamento de notificações
- Notificações em lote

