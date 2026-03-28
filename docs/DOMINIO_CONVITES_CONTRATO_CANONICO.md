# Contrato canônico — Domínio de convites (referência obrigatória)

**Versão:** 1.0 (Etapa 1 — CORE)  
**Escopo:** regras fixas para concessão, cálculo e classificação semântica. Não substitui planos de saneamento histórico (Etapa posterior).

---

## 1. Fonte de verdade

| Conceito | Fonte de verdade |
|----------|------------------|
| Convite concedido **válido** | Tabela `leader_invitations` em status `available`, `sent` ou `used` |
| Lastro da inscrição bônus | `leader_invitations.bonus_registration_id = registrations.id` |

Não contar convites válidos apenas por `registrations.payment_method = 'free_bonus'`.

---

## 2. Vínculo canônico obrigatório

```
leader_invitations.bonus_registration_id → registrations.id
```

Toda concessão **nova** de convite por meta deve criar o par **na mesma transação** (`grantInvitationBonusSlotAtomic` / `grantInvitationBonusSlotWithClient`).

---

## 3. Venda elegível (canônica)

Para uma comissão de bônus de convite (`leader_event_commissions` com `bonus_type` ∈ `invitation` | `both`):

- Inscrições com `payment_status = 'paid'`, não canceladas, no **mesmo evento**;
- Com `coupon_code` igual ao cupom **resolvido** para aquela comissão (`getCouponByEventCommission`);
- E existência de cupom do **mesmo líder** (`coupons.leader_id`) para aquele código.

**Sem cupom resolvido:** não há vendas elegíveis canônicas para essa comissão (lista vazia).

**Sem fallback por referral** no cálculo canônico (diferente do legado “produção” em `getRegistrationsByLeaderCoupons` sem `coupon_code`).

Implementação: `getCanonicalPaidRegistrationIds` e `calculateCanonicalInvitationBonusStateForCommission` em `backend/src/services/invitationBonusCanonicalCore.ts`.

---

## 4. expectedBonuses (canônico)

Para uma comissão:

```
expectedBonuses_canonical = floor(paidCount_canonical / required_purchases)
```

`required_purchases` ≥ 1; se inválido, tratar como 1.

---

## 5. Contagem de convites concedidos (DB)

Para comparar com a meta:

```
times_granted_db = COUNT(leader_invitations)
  WHERE leader_id, event_id, commission_id
  AND status IN ('available', 'sent', 'used')
```

Convites `expired` **não** entram no teto (permitem nova concessão se a meta justificar).

---

## 6. Definições semânticas

| Termo | Definição |
|-------|-----------|
| **Convite concedido válido** | Linha em `leader_invitations` (status válido) com `bonus_registration_id` apontando para a registration lastro |
| **Registration free_bonus válida (lastro)** | `payment_method = 'free_bonus'` **e** existe `leader_invitations.bonus_registration_id = id` |
| **Registration free_bonus administrativa** | `payment_method = 'free_bonus'` sem lastro de convite, tipicamente `registered_by ≠ runner_id` (ex.: organizador criou inscrição) — heurística em código até migração opcional |
| **Registration free_bonus inválida / lixo** | `payment_method = 'free_bonus'` sem lastro canônico e não classificável como administrativa de forma segura |
| **Faltante** | `expectedBonuses_canonical > times_granted_db` (por comissão), avaliado com política de operações (ex.: missing delivery) — **lixo não implica faltante** |
| **Excedente** | `times_granted_db > expectedBonuses_canonical` (por comissão) |

Classificador TypeScript (heurística, sem coluna obrigatória): `backend/src/services/freeBonusRegistrationSemantic.ts`.

---

## 7. Funções autorizadas a **escrever** no domínio (criação / vínculo / ajuste controlado)

| Função / fluxo | O que faz |
|----------------|-----------|
| `grantInvitationBonusSlotAtomic` / `grantInvitationBonusSlotWithClient` | Único caminho **oficial** para **novo** par registration + convite |
| `createInvitationFromBonus` | **Só** `leader_invitations` quando o lastro já existe; backfill/repair; idempotente |
| `checkAndGrantInvitationBonus` / `checkInvitationBonusForCommission` | Orquestra meta e chama o slot atômico; revoga excesso (`expire`) |
| `recalculateAndRevokeExcessInvitations` | Revoga excesso canônico (expire) |
| `runInvitationBonusReconciliation` (modo `apply` + guardas) | Reconciliação controlada |
| `runMissingInvitationDelivery` (modo `apply` + guardas) | Entrega de faltantes assistida |
| Scripts operacionais explícitos | Somente os já existentes e documentados; não ampliar sem revisão |

**Proibido:** criar `free_bonus` “de convite” fora do par atômico; disparar concessão a partir de leitura/dashboard.

---

## 8. Funções de **leitura** (não escrevem no domínio)

Incluem: `getLeaderInvitationProgress`, `getLeaderEventCommissions` (enriquecimento), `runInvitationBonusAudit`, consultas em `leaderInvitationsService` que apenas listam.

**Exceção de produto (não é domínio de convites):** endpoints que sincronizam pagamento (ex.: `syncRegistrationPaymentStatus`) podem escrever em `registrations` — não devem chamar concessão de convite.

---

## 9. Legado vs canônico (telemetria)

`logLegacyProductionPaidCountForCommission` compara com o antigo `getRegistrationsByLeaderCoupons` (pode incluir referral sem filtro de cupom). Usar **apenas para log/diagnóstico**, não para decisão de concessão.

---

## 10. Migração futura (opcional)

Coluna aditiva sugerida em `registrations`: `free_bonus_origin` ou equivalente (`invitation_canonical` | `administrative` | …) para eliminar ambiguidade sem heurística. **Não obrigatória na Etapa 1.**
