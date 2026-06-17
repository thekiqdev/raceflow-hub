# PLANO — CONTACT FORM + WHATSAPP (HÍBRIDO)

**Modo desta etapa:** auditoria read-only + plano de implementação  
**Data:** 2026-06-03  
**Objetivo:** adicionar abertura automática do WhatsApp **após** envio bem-sucedido do formulário, **sem** substituir persistência, contadores, dashboards ou notificações existentes.

**Auditoria detalhada:** [`docs/investigations/AUDIT_EVENT_CONTACT_FLOW_TO_WHATSAPP.md`](./investigations/AUDIT_EVENT_CONTACT_FLOW_TO_WHATSAPP.md)

---

## Princípios

| Manter | Adicionar |
|---|---|
| Formulário e modal atuais | Campo `whatsapp` na resposta do POST |
| `INSERT` em `contact_messages` | Resolução de telefone organizador → admin |
| Badges e `/new-count` | Deep link `wa.me` após ~800 ms |
| E-mails transacionais | Mensagem pré-preenchida no WhatsApp |
| Inbox admin / organizador | Fallback silencioso (sem WhatsApp) |

**Regra de ouro:** falha ao resolver telefone **nunca** impede o envio nem altera o `success: true`.

---

## ETAPA 1 — AUDITORIA (read-only)

### 1.1 Cadeia frontend

```mermaid
flowchart LR
  A[EventDetails.tsx] -->|setIsContactOpen| B[ContactDialog.tsx]
  B -->|GET| C[/form-configurations/public/contact]
  B -->|POST| D[/contact-messages]
  D --> E[toast + contact-messages-updated]
```

| Item | Arquivo | Linha aprox. | Detalhe |
|---|---|---|---|
| Página pública | `src/pages/EventDetails.tsx` | ~1343–1370, ~1527 | Dois botões "Entrar em Contato" + montagem do dialog |
| Estado modal | `EventDetails.tsx` | ~171 | `isContactOpen` |
| Modal | `src/components/event/ContactDialog.tsx` | todo | Único consumidor de `createContactMessage` no frontend |
| API cliente | `src/lib/api/contactMessages.ts` | ~36–37 | `POST /contact-messages`, `hasToken: false` |
| Campos dinâmicos | `src/lib/api/formConfigurations.ts` | — | `GET /form-configurations/public/contact` |

**Fluxo do modal (`ContactDialog.tsx`):**

1. **Step `select`** — usuário escolhe `contactType`: `event` ou `platform` (~L275–313).
2. **Step `form`** — formulário dinâmico de `form_configurations` (~L316–460).
3. **`handleSubmit`** (~L175–263) — monta payload e chama `createContactMessage`.
4. **Sucesso** — toast, `contact-messages-updated`, fecha modal.

**Payload POST atual:**

```json
{
  "type": "event | platform",
  "event_id": "uuid (se type=event)",
  "name": "string",
  "email": "string",
  "phone": "string (opcional)",
  "subject": "string",
  "message": "string"
}
```

**Props do dialog hoje:** `eventTitle`, `organizerEmail`, `organizerName`, `eventId` — **não** recebe telefone nem slug (necessário incluir no plano de implementação).

### 1.2 Cadeia backend

| Camada | Arquivo | Função |
|---|---|---|
| Rota | `backend/src/routes/contactMessages.ts` | `POST /` → `optionalAuth` |
| Controller | `backend/src/controllers/contactMessagesController.ts` | `createContactMessageController` ~L36–123 |
| Service | `backend/src/services/contactMessagesService.ts` | `createContactMessage` ~L38–69 |
| Evento | `backend/src/services/eventsService.ts` | `getEventById` — resolve `organizer_id` |
| Notificações | `backend/src/services/notificationService.ts` | `getAdminEmail`, `getOrganizerEmail`, `sendNotificationSafely` |

**Resposta POST atual (~L118–122):**

```json
{
  "success": true,
  "data": { "...contact_message..." },
  "message": "Mensagem enviada com sucesso! Entraremos em contato em breve."
}
```

### 1.3 Tabela `contact_messages`

Migration `052_create_contact_messages_table.sql`.

| Coluna | Uso |
|---|---|
| `type` | `event` \| `platform` |
| `name`, `email`, `phone`, `subject`, `message` | Dados do formulário |
| `event_id`, `organizer_id` | Vínculo (organizer derivado do evento) |
| `status` | `new` → alimenta contadores |

**Nenhuma alteração de schema prevista.**

### 1.4 Contadores e consumidores

| Consumidor | Arquivo | Endpoint / ação |
|---|---|---|
| Badge admin (Suporte) | `src/components/admin/AdminSidebar.tsx` | `GET /contact-messages/new-count` |
| Badge admin (aba Contatos) | `src/components/admin/CommunicationSupport.tsx` | idem |
| Inbox admin | `src/components/admin/ContactMessagesManagement.tsx` | `GET/PUT /contact-messages` |
| Badge organizador | `src/components/organizer/OrganizerSidebar.tsx` | `GET /contact-messages/new-count` |
| Inbox organizador | `src/components/organizer/OrganizerContactMessages.tsx` | `GET/PUT /contact-messages` |
| Evento pós-envio | `ContactDialog.tsx` | `window.dispatchEvent('contact-messages-updated')` |

**Contagem backend:**

- Admin: `type='platform' AND status='new'` (`getNewPlatformMessagesCount`)
- Organizador: `type='event' AND organizer_id=$1 AND status='new'` (`getNewEventMessagesCount`)

**Conclusão da auditoria:** o híbrido deve atuar **somente** na resposta do POST e no pós-sucesso do `ContactDialog`. Contadores e dashboards continuam iguais porque o insert permanece inalterado.

---

## ETAPA 2 — ORIGEM DO WHATSAPP

### 2.1 Organizador

| Campo pesquisado | Existe? | Uso |
|---|---|---|
| `whatsapp` | **Não** | — |
| `mobile_phone` | **Não** | — |
| `phone` | Sim (`profiles.phone`) | Telefone pessoal de cadastro — **não usar** para WhatsApp comercial |
| **`contact_phone`** | **Sim** | **Campo canônico** — "Telefone de Contato" nas configurações do organizador |

| Item | Valor |
|---|---|
| **Tabela** | `profiles` |
| **Coluna** | `contact_phone` |
| **Migration** | `012_organizer_settings.sql` |
| **Exposto na API do evento** | `organizer_contact_phone` (`eventsService.ts` ~L518) |
| **Edição** | `OrganizerSettings.tsx` — placeholder `(00) 00000-0000` |
| **Formato persistido** | Texto livre (com ou sem máscara) |
| **Normalização existente** | Apenas no `tel:` do `EventDetails` (`replace(/\D/g,'')`) |

### 2.2 Admin / plataforma

Não há coluna `whatsapp` em `system_settings`. Fontes disponíveis:

| Prioridade sugerida | Tabela | Coluna | Configurado em |
|---|---|---|---|
| 1 | `home_page_settings` | `whatsapp_number` | Admin → Personalizar → aba WhatsApp (`HomeCustomization.tsx`) |
| 2 | `system_settings` | `support_phone` | Admin → Configurações (`SystemSettings.tsx`) |
| 3 | `system_settings` | `contact_phone` | idem |

**Observação:** `whatsapp_number` é o número já usado na homepage como contato WhatsApp da marca; `support_phone` / `contact_phone` são telefones gerais do sistema.

**E-mails (inalterados):** `support_email` → `contact_email` — usados só para notificação, não para WhatsApp.

---

## ETAPA 3 — PRIORIDADE DE RESOLUÇÃO

### 3.1 Regras

```text
Após INSERT bem-sucedido em contact_messages:

SE type === 'event' E organizer_id presente:
  1. profiles.contact_phone do organizador (normalizado)
  2. Se inválido/ausente → telefone admin (cadeia abaixo)
  3. Se admin também inválido → whatsapp: null

SE type === 'platform' OU sem organizer_id:
  1. Telefone admin (cadeia abaixo)
  2. Se inválido → whatsapp: null

Cadeia admin:
  home_page_settings.whatsapp_number
  → system_settings.support_phone
  → system_settings.contact_phone
```

### 3.2 Validação de telefone (normalização)

Função compartilhada (backend; espelho opcional no frontend):

```text
Entrada: string qualquer
Saída: null | string só com dígitos (DDI incluso)

1. digits = remover não-dígitos
2. Se length < 10 → null (inválido)
3. Se length 10 ou 11 → prefixar "55" (Brasil)
4. Se já começa com "55" e length >= 12 → aceitar
5. Caso contrário com length >= 12 → aceitar como internacional
```

**Não bloquear envio** em nenhum caso — apenas retornar `whatsapp: null`.

### 3.3 Matriz tipo × fonte

| `type` | Fonte primária | `source` na resposta |
|---|---|---|
| `event` | `profiles.contact_phone` | `"organizer"` |
| `event` (fallback) | admin chain | `"admin"` |
| `platform` | admin chain | `"admin"` |

---

## ETAPA 4 — BACKEND (plano de implementação)

### 4.1 Escopo

| Alterar | Não alterar |
|---|---|
| Resposta do `POST /api/contact-messages` | Schema `contact_messages` |
| Novo helper de resolução WhatsApp | GET/PUT `/contact-messages` |
| | Contadores, notificações, webhooks |

### 4.2 Novo módulo sugerido

**Arquivo:** `backend/src/services/contactWhatsAppService.ts`

```ts
export type WhatsAppSource = 'organizer' | 'admin';

export interface ResolvedWhatsApp {
  phone: string;       // somente dígitos, pronto para wa.me
  source: WhatsAppSource;
}

export async function resolveWhatsAppForContactMessage(params: {
  type: 'event' | 'platform';
  organizerId?: string | null;
}): Promise<ResolvedWhatsApp | null>;
```

**Dependências internas:**

- `query` → `profiles.contact_phone` por `organizerId`
- `getHomePageSettings()` ou query direta → `whatsapp_number`
- `getSystemSettings()` → `support_phone`, `contact_phone`
- `normalizeWhatsAppDigits(raw: string): string | null`

### 4.3 Alteração no controller

**Arquivo:** `backend/src/controllers/contactMessagesController.ts`  
**Função:** `createContactMessageController` — **após** `createContactMessage` e **antes** do `res.json` (notificações podem permanecer onde estão).

```ts
const whatsapp = await resolveWhatsAppForContactMessage({
  type: data.type,
  organizerId: message.organizer_id,
});

res.json({
  success: true,
  data: message,
  message: 'Mensagem enviada com sucesso! Entraremos em contato em breve.',
  whatsapp: whatsapp
    ? { phone: whatsapp.phone, source: whatsapp.source }
    : null,
});
```

### 4.4 Contrato da API (extensão backward-compatible)

**Antes:**

```json
{ "success": true, "data": { ... }, "message": "..." }
```

**Depois:**

```json
{
  "success": true,
  "data": { "id": "...", "type": "event", ... },
  "message": "Mensagem enviada com sucesso! Entraremos em contato em breve.",
  "whatsapp": {
    "phone": "5585991084183",
    "source": "organizer"
  }
}
```

ou

```json
{
  "success": true,
  "data": { ... },
  "message": "...",
  "whatsapp": null
}
```

Clientes antigos ignoram `whatsapp`. Nenhum breaking change.

### 4.5 Tratamento de erros na resolução

`resolveWhatsAppForContactMessage` deve ser envolvido em try/catch no controller: em caso de exceção, log + `whatsapp: null` — **nunca** falhar o POST.

---

## ETAPA 5 — FRONTEND (plano de implementação)

### 5.1 Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/api/contactMessages.ts` | Tipar resposta com `whatsapp?: { phone: string; source: 'organizer' \| 'admin' } \| null` |
| `src/components/event/ContactDialog.tsx` | Pós-sucesso: toast + delay + `window.open` |
| `src/lib/utils/whatsapp.ts` *(novo)* | `buildWhatsAppUrl(phone, text)` |
| `src/pages/EventDetails.tsx` | Passar `eventSlug` (ou URL completa) ao dialog |

### 5.2 Fluxo pós-sucesso (`ContactDialog.handleSubmit`)

```text
1. POST /contact-messages (inalterado)
2. Se !response.success → toast erro (inalterado)
3. Se success:
   a. toast title: "Mensagem enviada com sucesso."
   b. dispatch contact-messages-updated (inalterado)
   c. fechar modal + reset form (inalterado)
   d. SE response.whatsapp?.phone:
        - montar text (ETAPA 6)
        - setTimeout 800ms
        - window.open(buildWhatsAppUrl(phone, text), '_blank', 'noopener,noreferrer')
```

### 5.3 Toast

| Situação | Título | Descrição |
|---|---|---|
| Sucesso (com ou sem WhatsApp) | `Mensagem enviada com sucesso.` | Pode omitir descrição ou manter texto curto |
| Com WhatsApp abrindo | idem | Opcional: "Abrindo WhatsApp..." (não obrigatório no escopo) |

**Remover** do toast atual a frase longa "Entraremos em contato em breve" se quiser alinhar ao spec; o backend pode manter a `message` string legada.

### 5.4 Props adicionais do `ContactDialog`

```tsx
interface ContactDialogProps {
  // existentes...
  eventSlug?: string;      // para montar link do evento
  eventCity?: string;      // opcional — não usado no template pedido
  eventState?: string;     // opcional
}
```

URL do evento: `` `${window.location.origin}/evento/${eventSlug}` `` (preferir slug; fallback `eventId`).

---

## ETAPA 6 — TEXTO AUTOMÁTICO (WhatsApp)

### 6.1 Template

```
Olá!

Acabei de enviar uma mensagem através do site.

Evento:
{event_name}

Nome:
{name}

E-mail:
{email}

Mensagem:
{message}

Link do evento:
{event_url}
```

### 6.2 Regras de preenchimento

| Placeholder | `type=event` | `type=platform` |
|---|---|---|
| `{event_name}` | `eventTitle` prop | `"Plataforma Cronoteam"` ou texto fixo |
| `{event_url}` | URL canônica do evento | URL da home ou omitir linha |
| `{name}`, `{email}`, `{message}` | Do `formData` / `apiData` | idem |

### 6.3 Implementação sugerida

**Arquivo:** `src/lib/utils/whatsapp.ts`

```ts
export function buildContactWhatsAppMessage(params: {
  eventName: string;
  name: string;
  email: string;
  message: string;
  eventUrl?: string;
}): string { ... }

export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
```

Usar `encodeURIComponent` — obrigatório para quebras de linha e acentos.

---

## ETAPA 7 — FALLBACK

| Condição | Comportamento |
|---|---|
| Organizador sem `contact_phone` válido | Tentar admin; se falhar → só toast sucesso |
| Admin sem nenhum telefone válido | `whatsapp: null` — só toast sucesso |
| Popup bloqueado pelo browser | Envio já salvo; usuário vê toast (considerar `noopener` no `window.open`) |
| Erro na resolução backend | `whatsapp: null`; POST continua `success: true` |
| Usuário escolhe "Plataforma" | Pular organizador; usar cadeia admin |

**Mensagem ao usuário sem WhatsApp:** apenas **"Mensagem enviada com sucesso."** — sem erro, sem aviso de telefone ausente.

---

## NÃO ALTERAR (checklist)

- [ ] Tabela e inserts em `contact_messages`
- [ ] `GET /contact-messages`, `GET /new-count`, `PUT /:id`
- [ ] `ContactMessagesManagement`, `OrganizerContactMessages`
- [ ] Badges em sidebars e `CommunicationSupport`
- [ ] Templates e envio `new_contact_message_platform` / `_event`
- [ ] `form_configurations` e `FormConfigurations.tsx`
- [ ] Migração de organizador (`contact_messages.organizer_id`)
- [ ] Webhooks

---

## ORDEM DE IMPLEMENTAÇÃO SUGERIDA

| # | Tarefa | Camada |
|---|---|---|
| 1 | `normalizeWhatsAppDigits` + testes unitários | backend |
| 2 | `contactWhatsAppService.resolveWhatsAppForContactMessage` | backend |
| 3 | Enriquecer resposta `createContactMessageController` | backend |
| 4 | Tipos em `contactMessages.ts` | frontend |
| 5 | `buildWhatsAppUrl` + `buildContactWhatsAppMessage` | frontend |
| 6 | Props `eventSlug` em `EventDetails` → `ContactDialog` | frontend |
| 7 | Pós-sucesso com delay 800 ms + `window.open` | frontend |
| 8 | Teste manual: evento com tel. org., sem tel., só admin, type platform | QA |

---

## TESTES MANUAIS

| Cenário | Esperado |
|---|---|
| Organizador com `(85) 99108-4183`, type `event` | POST success + `whatsapp.source=organizer` + abre wa.me após 800 ms |
| Organizador sem telefone, admin com `whatsapp_number` | `source=admin` + abre wa.me |
| Nenhum telefone válido | POST success + `whatsapp: null` + só toast |
| type `platform` | `source=admin` (nunca organizer) |
| Envio com popup bloqueado | Lead salvo + contador incrementa + toast OK |
| Inbox admin/organizador | Nova mensagem `status=new` como hoje |

---

## RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|---|---|
| `contact_phone` não é WhatsApp | Mesmo risco do link `tel:` já exibido; orientar organizador na UI de settings |
| Formatos mistos na base | Normalização centralizada no backend |
| Dupla notificação (e-mail + WhatsApp) | Esperado no modelo híbrido |
| Usuário fecha modal antes dos 800 ms | `setTimeout` deve usar refs estáveis; abrir WhatsApp mesmo após fechar modal |
| type `event` sem `event_id` | Comportamento atual do backend mantido; WhatsApp cai no admin |

---

## ESTIMATIVA DE DIFF

| Arquivo | Tipo |
|---|---|
| `backend/src/services/contactWhatsAppService.ts` | novo (~80 linhas) |
| `backend/src/controllers/contactMessagesController.ts` | +15 linhas |
| `src/lib/utils/whatsapp.ts` | novo (~40 linhas) |
| `src/lib/api/contactMessages.ts` | +10 linhas (tipos) |
| `src/components/event/ContactDialog.tsx` | +30 linhas |
| `src/pages/EventDetails.tsx` | +2 linhas (prop slug) |

**Sem migrations. Sem mudança em rotas.**

---

## REFERÊNCIAS

- Auditoria completa: [`AUDIT_EVENT_CONTACT_FLOW_TO_WHATSAPP.md`](./investigations/AUDIT_EVENT_CONTACT_FLOW_TO_WHATSAPP.md)
- Controller atual: `backend/src/controllers/contactMessagesController.ts`
- Dialog: `src/components/event/ContactDialog.tsx`

---

*Plano gerado em modo read-only. Implementação aguarda autorização explícita.*
