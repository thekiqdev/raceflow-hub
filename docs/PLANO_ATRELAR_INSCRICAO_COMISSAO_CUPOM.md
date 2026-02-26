# Plano: Atrelar inscrição a cupom/comissão e remover comissão (admin)

## Objetivo

Quando o organizador esquece de criar o cupom por evento antes da compra, precisamos permitir:

1. **Atrelar inscrição a uma comissão por evento** (organizador ou admin): escolher uma inscrição já paga e associá-la a um cupom/comissão de líder. Ao atrelar, a comissão correspondente deve ser aplicada (reutilizando a lógica existente).
2. **Remover comissão** (somente admin): permitir que o admin remova/cancele uma comissão já gerada (ex.: atrelada por engano).

Cada etapa abaixo deve ser executada em sequência; o início de cada uma será marcado com **Ok etapa N**.

---

## Contexto técnico (o que já existe)

- **Inscrição** (`registrations`): tem `coupon_code` (opcional). Quando preenchido e a inscrição está paga, a comissão é criada com base no cupom (que indica o líder e a comissão por evento).
- **Comissão por evento** (`leader_event_commissions`): configuração líder + evento (percentual, tipo, etc.). Cada uma pode ter um **cupom** associado (código único).
- **Comissão gerada** (`leader_commissions`): registro de valor devido ao líder por uma inscrição específica (`registration_id`, `leader_id`, `event_id`, `commission_amount`, `status`: pending/paid/cancelled).
- **Serviços usados**:
  - `registrationsService.updateRegistration`: hoje aceita só `status`, `payment_status`, `payment_method`. Será estendido para aceitar `coupon_code`.
  - `commissionsService.createCommission`: lê `coupon_code` da inscrição, acha a comissão por evento pelo cupom e cria o registro em `leader_commissions`. Já evita duplicata (uma comissão por `registration_id` + `leader_id`).
  - `commissionsService.cancelCommission`: cancela comissão (não paga); para comissão já paga, hoje não permite. Para “remover” como admin, podemos usar cancelamento com ajuste de totais ou regra específica admin.

---

## Etapa 1 – Backend: permitir atualizar `coupon_code` na inscrição

**Ok etapa 1**

- **Objetivo:** Permitir que a API de atualização de inscrição aceite `coupon_code` quando for para “atrelar” a uma comissão.
- **Onde:** `backend/src/services/registrationsService.ts` e tipo `UpdateRegistrationData`.
- **Ações:**
  1. Incluir `coupon_code?: string | null` em `UpdateRegistrationData`.
  2. Em `updateRegistration`, tratar `coupon_code` nos campos dinâmicos (como já é feito com status/payment). Garantir que só seja atualizado se a inscrição pertencer ao evento do organizador (ou admin); validação de ownership pode ficar no controller.
- **Validação (controller):** Ao receber `coupon_code` no `PUT /api/registrations/:id` (ou no endpoint específico de atrelar):
  - Inscrição existe e pertence a um evento do organizador (ou usuário é admin).
  - Inscrição está com `payment_status === 'paid'`.
  - Cupom existe, está ativo e é do mesmo evento da inscrição (e do líder/comissão por evento que desejamos).
- **Nota:** Pode ser feito de duas formas: (A) estender `updateRegistration` + controller existente com regras para `coupon_code`, ou (B) criar um endpoint dedicado `POST /api/registrations/:id/attach-commission` que recebe `leader_event_commission_id`, atualiza o `coupon_code` da inscrição com o cupom dessa comissão e chama `createCommission`. A opção (B) deixa o fluxo mais claro e evita expor `coupon_code` em todo update. Recomendação: **Etapa 1** apenas garantir que o serviço permita atualizar `coupon_code`; o endpoint dedicado pode ser a **Etapa 2**.

**Checklist Etapa 1:**
- [x] `UpdateRegistrationData` com `coupon_code?: string | null`
- [x] `updateRegistration` persiste `coupon_code` quando enviado (já usa `Object.entries(data)` dinamicamente)
- [ ] Testes manuais ou unitários: atualizar inscrição com `coupon_code` e verificar no banco

---

## Etapa 2 – Backend: endpoint “Atrelar inscrição à comissão por evento”

**Ok etapa 2**

- **Objetivo:** Endpoint que recebe uma inscrição (já paga) e um identificador da comissão por evento (ou do cupom), atualiza a inscrição com o cupom e dispara a criação da comissão.
- **Onde:** Novo controller + rota (organizer e admin). Ex.: `POST /api/organizer/registrations/:registrationId/attach-commission` e equivalente em admin.
- **Payload sugerido:** `{ "leader_event_commission_id": "uuid" }`. O backend resolve o cupom dessa comissão (já existe lógica que associa cupom ↔ comissão por evento).
- **Fluxo:**
  1. Buscar inscrição por ID; verificar se está paga e se o evento pertence ao organizador (ou se é admin).
  2. Buscar `leader_event_commission` por ID; verificar se é do mesmo evento da inscrição e se o organizador é dono do evento (ou admin).
  3. Obter o cupom associado a essa comissão (ex.: por `getCouponsByLeader` + match por `event_id` e código que contém o ID da comissão, ou novo helper `getCouponByLeaderEventCommissionId`).
  4. Verificar se já existe comissão para essa inscrição + líder (evitar duplicata). Se existir, retornar erro amigável.
  5. Atualizar inscrição: `updateRegistration(registrationId, { coupon_code: coupon.code })`.
  6. Chamar `createCommission({ leader_id, registration_id, referred_user_id: registration.runner_id, event_id, registration_amount })` (reutilizando o que já existe).
  7. Se a comissão por evento tiver bônus de convite, `createCommission` já chama a lógica de convites quando aplicável.
- **Respostas:** 200 com dados da inscrição e da comissão criada; 400 se já atrelada, evento não confere, etc.; 403 se não for organizador/admin do evento.

**Checklist Etapa 2:**
- [x] Helper ou uso existente para obter cupom a partir de `leader_event_commission_id` (usa `getCouponByEventCommission`)
- [x] Controller `attachRegistrationToCommissionController`
- [x] Rota `POST /api/registrations/:id/attach-commission` (organizador do evento ou admin; um endpoint serve ambos)
- [ ] Testes: atrelar inscrição paga → comissão criada; tentar atrelar de novo → erro

---

## Etapa 3 – Backend: endpoint “Remover comissão” (somente admin)

**Ok etapa 3**

- **Objetivo:** Permitir que apenas admin remova (cancele) uma comissão já gerada.
- **Onde:** Novo endpoint admin, ex.: `POST /api/admin/commissions/:commissionId/remove` ou `DELETE /api/admin/commissions/:commissionId`.
- **Comportamento:**
  - Se a comissão estiver `pending`: usar `cancelCommission` existente (já desconta do total do líder).
  - Se a comissão estiver `paid`: definir política: (a) não permitir remover, ou (b) permitir para admin e: cancelar + descontar do total do líder (e eventualmente ajustar saldo já pago). Recomendação inicial: permitir cancelar mesmo “paid” apenas para admin e descontar do total do líder (`addToTotalEarnings(leader_id, -amount)`); manter status `cancelled`. Opcional: limpar `coupon_code` da inscrição para refletir que não está mais atrelada a esse cupom.
- **Permissão:** Apenas role `admin`.
- **Respostas:** 200 com comissão cancelada; 403 se não for admin; 404 se comissão não existir.

**Checklist Etapa 3:**
- [x] Rota `DELETE /api/admin/commissions/:commissionId` em `adminRoutes`
- [x] Controller `removeCommissionController` em `adminCommissionsController.ts` que chama `adminCancelCommission`
- [x] Nova função `adminCancelCommission` em `commissionsService`: cancela pending ou paid, desconta do total do líder, limpa `coupon_code` da inscrição
- [ ] Testes: admin remove pending; admin remove paid

---

## Etapa 4 – Frontend (organizador): atrelar inscrição à comissão

**Ok etapa 4**

- **Objetivo:** Na tela de inscrições do organizador, permitir escolher uma inscrição (paga, sem cupom ou com outro cupom) e abrir ação “Atrelar a comissão por evento”.
- **Onde:** `OrganizerRegistrations.tsx` (lista/detalhe de inscrições).
- **Ações:**
  1. Na lista ou no detalhe da inscrição, exibir botão/ação “Atrelar a comissão” (visível apenas para inscrições pagas; opcional: esconder ou desabilitar se já tiver comissão para esse evento/líder).
  2. Ao clicar, abrir um modal/dialog onde o organizador escolhe:
     - A **comissão por evento** (lista: líder + nome da comissão + evento, filtrada pelo evento da inscrição). Dados podem vir de `GET /api/organizer/group-leaders/:id/event-commissions` ou de um endpoint que liste comissões por evento (ex.: evento da inscrição).
  3. Ao confirmar, chamar `POST /api/organizer/registrations/:registrationId/attach-commission` com `leader_event_commission_id`. Sucesso: fechar modal, atualizar lista/detalhe e mostrar toast. Erro: exibir mensagem (ex.: “Inscrição já atrelada a uma comissão”).
- **Reutilizar:** Componentes de select, dialog e API de comissões por evento já existentes onde fizer sentido.

**Checklist Etapa 4:**
- [ ] Botão/ação “Atrelar a comissão” na UI do organizador
- [x] Modal com lista de comissões por evento do evento da inscrição (GET /organizer/events/:eventId/event-commissions)
- [x] Chamada à API de attach e tratamento de sucesso/erro
- [x] Atualização da lista após atrelar (loadRegistrations)

---

## Etapa 5 – Frontend (admin): atrelar inscrição e remover comissão

**Ok etapa 5**

- **Objetivo:** Na tela de inscrições do admin, oferecer a mesma ação “Atrelar a comissão” (reutilizando lógica da Etapa 4) e, onde for exibida a comissão gerada (ex.: detalhe da inscrição ou tela de comissões), permitir “Remover comissão” (somente admin).
- **Onde:** `AdminRegistrations.tsx` e, se houver, tela/detalhe de comissões por líder.
- **Ações:**
  1. **Atrelar:** Igual ao organizador, mas chamando rota admin (ex.: `POST /api/admin/registrations/:registrationId/attach-commission`) com mesmo payload. Lista de comissões por evento pode considerar qualquer organizador (evento da inscrição).
  2. **Remover comissão:** No detalhe da inscrição (ou na lista de comissões do líder), exibir comissão gerada (leader_id, valor, status) e botão “Remover comissão”. Ao confirmar, chamar `POST /api/admin/commissions/:commissionId/remove` (ou DELETE). Sucesso: atualizar dados e toast; erro: exibir mensagem.
- **Permissão:** Botão “Remover comissão” só aparece para admin.

**Checklist Etapa 5:**
- [ ] Ação “Atrelar a comissão” na lista/detalhe de inscrições (admin)
- [x] Exibição da comissão gerada no detalhe da inscrição (seção "Comissão gerada" com valor e status)
- [ ] Botão “Remover comissão” (só admin) e chamada ao endpoint de remoção
- [x] Confirmação antes de remover e atualização da UI

---

## Etapa 6 – Ajustes e testes end-to-end

**Ok etapa 6**

- **Objetivo:** Revisar fluxos, mensagens e edge cases.
- **Ações:**
  1. Cenário: organizador cria cupom/comissão por evento **depois** de uma compra já paga → abrir inscrições → “Atrelar a comissão” → selecionar a comissão → verificar que a comissão aparece no líder e que valores batem.
  2. Cenário: admin atrela uma inscrição a uma comissão por evento de outro organizador (se permitido) ou do mesmo evento.
  3. Cenário: admin remove comissão (pending e, se implementado, paid) e verificar que totais do líder são atualizados e que a inscrição pode ser atrelada de novo (se limparmos `coupon_code`) ou que não gera duplicata.
  4. Revisar mensagens de erro (já atrelada, evento não confere, cupom inválido, etc.).
  5. Documentar no próprio plano ou em README: quem pode atrelar (organizador/admin), quem pode remover (só admin), e que “remover” significa cancelar a comissão e ajustar totais.

**Checklist Etapa 6:**
- [ ] Teste E2E: atrelar após compra já feita (validar manualmente)
- [ ] Teste E2E: remover comissão (admin) (validar manualmente)
- [x] Mensagens de erro e sucesso revisadas (backend e frontend consistentes)
- [x] Documentação breve atualizada (seção "Documentação / Resumo de uso" no plano)

---

## Resumo das etapas

| Etapa | Descrição |
|-------|-----------|
| 1 | Backend: permitir atualizar `coupon_code` na inscrição |
| 2 | Backend: endpoint “Atrelar inscrição à comissão por evento” |
| 3 | Backend: endpoint “Remover comissão” (somente admin) |
| 4 | Frontend organizador: UI para atrelar inscrição à comissão |
| 5 | Frontend admin: atrelar inscrição + botão remover comissão |
| 6 | Ajustes e testes end-to-end |

---

## Ordem de execução

Cada etapa começa com **Ok etapa N**. Implementar na ordem 1 → 2 → 3 → 4 → 5 → 6, validando o checklist de cada uma antes de seguir.

---

## Documentação / Resumo de uso

### Quem pode fazer o quê

- **Atrelar inscrição a uma comissão por evento:** organizador do evento **ou** administrador.  
  Usado quando o cupom foi criado **depois** da compra: o organizador/admin escolhe a inscrição (já paga) e a comissão por evento; o sistema atualiza o `coupon_code` da inscrição e gera a comissão (valor e bônus de convite, se houver).

- **Remover comissão:** **somente administrador.**  
  O admin pode cancelar uma comissão já gerada (pending ou paid). O valor é descontado do total do líder e o `coupon_code` da inscrição é limpo, permitindo atrelar de novo a outra comissão se necessário.

### O que significa “Remover comissão”

- A comissão é **cancelada** (status `cancelled`).
- O valor da comissão é **descontado** do total de ganhos do líder.
- O cupom da inscrição é **desvinculado** (`coupon_code` = null), de modo que a inscrição pode ser atrelada novamente a outra comissão por evento.

### Mensagens de erro (atrelar)

- Inscrição não paga: *"Só é possível atrelar comissão em inscrições já pagas"*
- Comissão de outro evento: *"A comissão não é do mesmo evento da inscrição"*
- Comissão só de convite: *"Não é possível atrelar a uma comissão apenas de convite; escolha uma comissão com percentual"*
- Comissão sem cupom: *"Esta comissão não possui cupom associado"*
- Já atrelada: *"Esta inscrição já está atrelada a uma comissão"*

### Cenários de teste sugeridos (validação manual)

1. **Atrelar (organizador):** Inscrição paga sem cupom → Inscrições (organizador) → Ações → "Atrelar a comissão" → escolher comissão por evento → Atrelar. Verificar que a comissão aparece no líder e que o valor está correto.
2. **Atrelar (admin):** Mesmo fluxo na tela de inscrições do admin; verificar que a lista de comissões considera o evento da inscrição.
3. **Já atrelada:** Tentar atrelar de novo a mesma inscrição → deve exibir "Esta inscrição já está atrelada a uma comissão".
4. **Remover comissão (admin):** Detalhes da inscrição → seção "Comissão gerada" → "Remover comissão" → confirmar. Verificar que a comissão some, que o total do líder é atualizado e que a inscrição pode ser atrelada de novo.
