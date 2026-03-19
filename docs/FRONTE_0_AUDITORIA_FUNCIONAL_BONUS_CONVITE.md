# Frente 0 — Auditoria funcional da regra de bônus de convite (estado atual do código)

**Versão:** 1.0 — documentação apenas (sem implementação, sem migrations, sem correções)  
**Objetivo:** Descrever **como o sistema funciona hoje** para servir de base antes da **Frente 1** (auditoria de dados) e de qualquer script de correção, conforme `PLANO_AUDITORIA_CORRECAO_CONVITES_POS_MIGRACAO_ORGANIZADOR.md` v1.1.

**Escopo:** Backend Node/TypeScript e referências ao frontend que consomem as APIs. Trechos citados refletem o comportamento observado no repositório na data deste documento.

---

## 1. Visão geral da regra de negócio (implementada)

1. Configuração por **`leader_event_commissions`**: para cada linha com `bonus_type` **`invitation`** ou **`both`**, existe uma meta `required_purchases` (número de “compras pagas” necessárias para cada novo bônus de convite).
2. O sistema calcula quantas “compras pagas elegíveis” o líder tem **naquele evento**, para aquela comissão, via `getRegistrationsByLeaderCoupons` (com ou sem filtro de `coupon_code`).
3. **`expectedBonuses`** = `Math.floor(paidCount / required_purchases)` (com `required_purchases` mínimo 1 se inválido).
4. **`timesGranted`** = quantidade de convites já concedidos para aquela comissão, medida por linhas em **`leader_invitations`** com `commission_id` correspondente e **status em um conjunto específico** (ver §5).
5. Se `expectedBonuses > timesGranted`, o sistema cria **inscrição gratuita** (`payment_method` tipo bônus / `free_bonus`) para o **usuário do líder** e em seguida cria um registro em **`leader_invitations`** (`status = 'available'`, `commission_id` preenchido) via `createInvitationFromBonus`.
6. Funções auxiliares podem **revogar** convites `available` em excesso (`UPDATE` para `expired`) quando `timesGranted > expectedBonuses` — em fluxos específicos (ver §4).

---

## 2. O que conta e o que não conta como “compra paga” para o bônus

Fonte canônica da lista de inscrições: **`getRegistrationsByLeaderCoupons`** (`backend/src/services/leaderRegistrationsService.ts`).

### 2.1 Filtros sempre aplicáveis na query base

- Inscrição entra se **qualquer** uma das condições for verdadeira:
  - **Cupom do líder:** `r.coupon_code` não nulo e existe `coupons` com `UPPER(TRIM(code))` igual ao da inscrição e **`cp.leader_id = $1`** (líder da consulta).
  - **Referral:** existe `user_referrals` com `user_id = r.runner_id` e **`leader_id = $1`**.
- Uso de **`SELECT DISTINCT r.id`** para evitar múltiplas linhas por inscrição quando ambas as condições poderiam ser verdadeiras (uma inscrição continua contando **uma vez**).

### 2.2 Filtros opcionais (parâmetro `filters`)

| Filtro | Efeito |
|--------|--------|
| `event_id` | Restringe a `r.event_id = event_id`. **Sempre usado** no fluxo de bônus por evento. |
| `payment_status: 'paid'` | `r.payment_status = 'paid'` **e** `r.status != 'cancelled'`. |
| `coupon_code` | Exige `r.coupon_code` igual (normalizado) ao código passado. **Reduz** o conjunto às inscrições que usaram **esse** cupom; **não** inclui inscrições só por referral sem esse cupom. |

### 2.3 Interpretação por comissão (cupom vs “evento inteiro” para o líder)

- Se **`getCouponByEventCommission`** devolver um cupom e o código for passado a `getRegistrationsByLeaderCoupons`: contam-se essencialmente inscrições **pagas, não canceladas, no evento, com aquele cupom, atribuíveis ao líder** (via EXISTS do cupom do líder — e ainda podem entrar pelo OR de referral se a mesma inscrição também tiver referral; o `DISTINCT` mantém uma linha).
- Se **não** houver cupom resolvido (`couponCode` null): **`coupon_code` não é passado** → entram **todas** as inscrições do líder no evento que satisfazem o OR cupom/referral com `payment_status = paid`. Isso é equivalente a uma visão **ampla por evento**, não restrita ao cupom da comissão — **ponto crítico** quando o matching pós-migração falha.

### 2.4 O que tipicamente **não** entra

- Pagamento não `paid`.
- Inscrição com `status = 'cancelled'` (quando o filtro é `payment_status: 'paid'`).
- Inscrições sem vínculo com o líder via cupom (daquele líder) nem via `user_referrals`.

### 2.5 Observação: `registrationBonusService` e escolha do líder

Em **`checkInvitationBonusesOnPaymentConfirmation`**, o `leaderId` é definido assim:

1. Se existir **`user_referrals`** para `runner_id` da inscrição → usa esse `leader_id`.
2. Senão, se houver `coupon_code`, busca **`coupons` por `code` apenas** (`WHERE code = $1 AND leader_id IS NOT NULL`) — **sem** filtrar por organizador ou unicidade global do código.

Isso pode, em teoria, associar a inscrição ao “primeiro” líder retornado se houver ambiguidade de código no banco — relevante para auditorias de dados.

---

## 3. Separação: evento, comissão, cupom, referral

| Dimensão | Onde está no código | Observação |
|----------|---------------------|------------|
| **Evento** | `event_id` em `leader_event_commissions`, filtros em `getRegistrationsByLeaderCoupons`, `leader_invitations.event_id` | Todo o fluxo de bônus é por par **(leader_id, event_id)** ao iterar comissões. |
| **Comissão** | `leader_event_commissions.id` → `commission_id` em `leader_invitations` | Cada configuração `invitation`/`both` com sua `required_purchases`. |
| **Cupom** | Resolução via `getCouponByEventCommission(leaderId, eventId, commissionId)` | Se falhar, a contagem de pagas **perde** o filtro de cupom (§2.3). |
| **Referral** | Inclusão via cláusula `user_referrals` em `getRegistrationsByLeaderCoupons` | Conta junto com cupom; uma inscrição pode qualificar por ambos, mas `DISTINCT` evita dobrar a linha. |

**“Comissão” no sentido financeiro** (`leader_commissions`) é outro fluxo: ao criar comissão monetária, se a config for `both` ou `invitation`, pode chamar `checkAllInvitationBonuses` (ver §4).

---

## 4. Pontos que disparam verificação / geração de convites

Abaixo, **todos os gatilhos identificados** que levam a `checkAndGrantInvitationBonus`, `checkAllInvitationBonuses`, `checkInvitationBonusForCommission` ou `triggerInvitationBonusAfterPaidWithCoupon`.

| # | Origem | Arquivo | Comportamento resumido |
|---|--------|---------|------------------------|
| 1 | Confirmação genérica de pagamento (por `registration_id`) | `registrationBonusService.ts` | `checkInvitationBonusesOnPaymentConfirmation` → resolve líder (referral ou cupom) → **`checkAllInvitationBonuses(leaderId, event_id)`**. |
| 2 | Atualização de inscrição / fluxo de registro | `registrationsService.ts` | Import dinâmico → **`triggerInvitationBonusAfterPaidWithCoupon(leaderId, event_id, coupon_code)`**. |
| 3 | Webhook Asaas (pagamento confirmado) | `asaasWebhookController.ts` | Várias ramificações → **`triggerInvitationBonusAfterPaidWithCoupon`** (com cupom da inscrição quando aplicável). |
| 4 | Criação de comissão monetária | `commissionsService.ts` (`createCommission`) | Se tipo `both`/`invitation` e registro pago → **`checkAllInvitationBonuses`**. Casos só `invitation` sem valor monetário → **`triggerInvitationBonusAfterPaidWithCoupon`** antes de lançar erro controlado. |
| 5 | Controller de inscrições (múltiplos fluxos: criação, atualização, atrelamento) | `registrationsController.ts` | Várias chamadas a **`checkAllInvitationBonuses`** e **`checkInvitationBonusForCommission`** / **`recalculateAndRevokeExcessInvitations`** em cenários de comissão e pagamento. |
| 6 | Reativação / expiração de inscrições | `expiredRegistrationsService.ts` | **`checkAllInvitationBonuses`** após mudanças de estado. |
| 7 | **Listagem de comissões por evento** (organizer/admin) | `leaderEventCommissionsService.ts` (`getLeaderEventCommissions`) | Para cada `event_id` distinto que tenha comissão `invitation`/`both`, em loop: **`checkAndGrantInvitationBonus(leaderId, eventId)`**. **Efeito colateral em leitura.** |
| 8 | **Progresso de bônus de convite** (API do líder) | `leaderBonusService.ts` (`getLeaderInvitationProgress`) | Antes de montar o progresso, para cada `event_id` distinto: **`checkAndGrantInvitationBonus`**. **Efeito colateral em leitura.** |
| 9 | Fluxo “cupom usado na compra” | `leaderBonusService.ts` (`triggerInvitationBonusAfterPaidWithCoupon`) | Se cupom bater com uma comissão: **`checkInvitationBonusForCommission`**; **em seguida sempre** **`checkAllInvitationBonuses`** (processa **todas** as comissões de convite daquele líder/evento de novo). |

**Criação física do convite:** `createInvitationFromBonus` (`leaderInvitationsService.ts`) após `createRegistration` (inscrição `free_bonus`). Idempotência parcial: verifica convite existente por **`bonus_registration_id`** e trata erro de unicidade `23505`.

---

## 5. Como o sistema considera convites já concedidos

### 5.1 Na concessão principal (`checkAndGrantInvitationBonus` e `checkInvitationBonusForCommission`)

- Contagem **`timesGranted`**:  
  `SELECT COUNT(*) FROM leader_invitations WHERE leader_id = ? AND event_id = ? AND commission_id = ? AND status IN ('available', 'sent', 'used')`.
- **`expired`** (e eventualmente outros status) **não entram** — comentário no código: convites expirados não bloqueiam novo bônus quando a meta continua válida.

### 5.2 Na exibição de progresso (`getLeaderInvitationProgress`)

- Mesma regra para **`invitations_granted`**: apenas `available`, `sent`, `used`.

### 5.3 Inconsistência importante: `recalculateAndRevokeExcessInvitations`

- Para decidir excesso, usa **`COUNT(*)` de `leader_invitations` por comissão sem filtrar por status** (inclui **todos** os status, p.ex. `expired`).
- Compara com `expectedBonuses` derivado só de inscrições pagas.
- Pode **divergir** do comportamento de `checkAndGrantInvitationBonus` (que ignora `expired` no `timesGranted`). Documentar como **risco de lógica desalinhada** entre conceder e revogar.

### 5.4 Inconsistência entre painel de comissões e a regra de concessão

Em **`getLeaderEventCommissions`** (enriquecimento de stats para a UI):

- Para “convites ganhos” usa-se **`invitations_earned`** = COUNT só com **`status = 'available'`** (não inclui `sent` nem `used`).
- Já a **concessão** e o **progresso** usam `available + sent + used`.

Isso pode fazer o **painel mostrar um número menor** que o “crédito já concedido” real usado internamente para não gerar duplicata.

---

## 6. Riscos de reprocessamento e dupla concessão

| Risco | Descrição |
|-------|-----------|
| **Múltiplos disparos no mesmo pagamento** | `triggerInvitationBonusAfterPaidWithCoupon` chama comissão específica **e** depois `checkAllInvitationBonuses` (todas as comissões). Redundante; depende de `timesGranted` e do loop `while` para não explodir — se `paidCount` estiver inflado, concede mais. |
| **Leitura que altera dados** | Abrir comissões no painel do organizador ou carregar progresso no painel do líder executa `checkAndGrantInvitationBonus` — qualquer bug de contagem ou corrida pode criar convites **sem** novo pagamento. |
| **Cupom não resolvido** | `paidCount` grande (evento inteiro para o líder) → `expectedBonuses` grande → muitos convites. |
| **Paralelismo** | Duas requisições simultâneas podem passar ambas com o mesmo `timesGranted` antes do INSERT; mitigação parcial pelo re-fetch do count no `while` e por `unique_bonus_registration`. |
| **Ambiguidade de `leaderId` no `registrationBonusService`** | Resolução de líder por cupom sem garantir unicidade do código. |
| **Revogação vs concessão** | Regras de COUNT diferentes em `recalculateAndRevokeExcessInvitations` vs concessão (§5.3). |

---

## 7. Telas / APIs: contagem global vs por evento

### 7.1 Contagem **global** (todos os eventos do líder)

| Uso | API / service | Filtro `event_id` |
|-----|---------------|-------------------|
| Lista completa de convites | `getMyInvitations` → `getLeaderInvitations` | **Não** — só `leader_id`. |
| Convites disponíveis para enviar | `getMyAvailableInvitations` → `getAvailableInvitations` | **Não** — só `leader_id` e `status = 'available'`. |

**Frontend:** `LeaderDashboard.tsx` chama `getMyInvitations()` entre outros — o usuário vê convites de **todos** os eventos na mesma lista.

### 7.2 Contagem **por evento / por comissão**

| Uso | API / service | Filtro |
|-----|---------------|--------|
| Comissões por evento (cards, stats, link) | `getMyEventCommissions` / rota organizer-admin equivalente → `getLeaderEventCommissions` | Comissões já filtradas por query (e por `organizer_id` quando organizador); stats calculados **por linha de comissão** (`event_id` + `commission_id`). |
| Progresso textual de metas de convite | `getLeaderInvitationProgress` (ex.: `GroupLeaderDetails`) | Uma linha por `leader_event_commissions` com `invitation`/`both`; cada linha tem `event_id`, `commission_id`, `paid_count`, `invitations_granted`. |

### 7.3 Organizador — evento > inscrições

- Fluxo em **`OrganizerRegistrations.tsx`**: foco em inscrições do **evento** selecionado; atrelamento a `leader_event_commission_id`. **Não** é a mesma query que lista todos os convites do líder.
- A sensação de “100+ convites” ao comparar com um número no card do evento muitas vezes é **mistura de escopo global (lista de convites do líder) vs escopo do evento/comissão**.

---

## 8. Tabelas e funções principais (referência rápida)

| Tabela / objeto | Papel |
|-----------------|--------|
| `leader_event_commissions` | Meta `required_purchases`, `bonus_type`, vínculo `leader_id` + `event_id`. |
| `registrations` | Fonte de `paidCount` (via `getRegistrationsByLeaderCoupons`). |
| `coupons` | Atribuição por código ao líder; matching com comissão. |
| `user_referrals` | Segunda via de atribuição de inscrição ao líder. |
| `leader_invitations` | Convites gerados; `commission_id`, `bonus_registration_id`, `status`. |
| `leader_commissions` | Comissão monetária; gatilho de `checkAllInvitationBonuses` quando aplicável. |

**Funções centrais:**

- `checkAndGrantInvitationBonus` — loop por comissões `invitation`/`both` do líder no evento.
- `checkAllInvitationBonuses` — wrapper que chama a anterior.
- `checkInvitationBonusForCommission` — uma comissão; pode conceder e **revogar** `available` em excesso.
- `triggerInvitationBonusAfterPaidWithCoupon` — comissão alinhada ao cupom da compra + `checkAllInvitationBonuses`.
- `getRegistrationsByLeaderCoupons` — definição do conjunto de inscrições que contam.
- `getCouponByEventCommission` — determina se o filtro por cupom será aplicado.
- `createInvitationFromBonus` — INSERT em `leader_invitations`.
- `recalculateAndRevokeExcessInvitations` — revoga excedentes (lógica de COUNT diferente — ver §5.3).

---

## 9. Relação com o plano principal (Frentes 0–3)

- Esta **Frente 0** responde: “**o que o código faz hoje**” e “**onde olhar**”.
- A **Frente 1 / Fase 1** (`PLANO_AUDITORIA_CORRECAO_CONVITES_POS_MIGRACAO_ORGANIZADOR.md` v1.2+) inclui **auditoria somente leitura** e um **simulador técnico** que reproduz o cálculo atual vs canônico **sem escrita**; deve cruzar estas regras com dados reais (`event_id`, opcional `leader_id`).
- A **Frente 2** (correção de dados) não deve contradizer esta especificação sem decisão explícita (ex.: alterar o que “deveria” contar).
- A **Frente 3** (causa raiz no código) deve atacar bugs e efeitos colaterais em leitura (§6) **para o problema não voltar** após corrigir dados.

---

**Fim do documento Frente 0.**
