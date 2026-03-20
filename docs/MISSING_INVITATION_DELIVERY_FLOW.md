# Fluxo: Corrigir convites não entregues

## Objetivo

Gerar **apenas** os convites faltantes (`faltantes = expectedBonuses_correto − timesGranted_db`) com base no **resultado canônico da auditoria (Fase 1)**, sem reutilizar o botão/fluxo de correção de excesso/DELETE físico.

## Arquivos alterados / novos

| Arquivo | Papel |
|--------|--------|
| `backend/src/services/missingInvitationDeliveryService.ts` | **Novo** — dry_run, apply, plano A/B, transação no apply |
| `backend/src/controllers/missingInvitationDeliveryController.ts` | **Novo** — validação + `executed_by` |
| `backend/src/routes/adminRoutes.ts` | Rota `POST /admin/reconcile/missing-invitation-delivery` |
| `src/lib/api/invitationBonusAudit.ts` | Tipos + `runMissingInvitationDeliveryApi` |
| `src/components/admin/InvitationBonusAuditPanel.tsx` | Seção **Corrigir convites não entregues** (botão distinto) |

## Dry run (novo botão)

- **Padrão:** ao abrir o fluxo, o usuário executa **Executar dry_run (padrão)**.
- Resposta inclui:
  - **`relatorio_antes`:** totais (linhas de comissão, soma de faltantes, aptos vs bloqueados).
  - **`plano_geracao.bloco_a_aptos`:** comissões com `faltantes > 0` e **sem** bloqueios de segurança.
  - **`plano_geracao.bloco_b_bloqueados`:** comissões com `faltantes > 0` mas **bloqueadas** (motivos em `bloqueio_motivos`).
- Por linha (A e B): `leader_id`, `commission_id`, `event_id`, `required_purchases`, `paidCount_correto`, `expectedBonuses_correto`, `timesGranted_db`, `faltantes`, `acao_proposta`, `observacao_seguranca`, `observacao_reversibilidade`, `status`.

## Proteção do apply

1. **`mode=apply`** exige `apply_confirmed: true` (confirmação explícita no front + validação no controller).
2. **`audit_snapshot_hash`** e **`dry_run_hash`** obrigatórios; devem coincidir com um **novo** dry_run no **mesmo** `event_id` e escopo de líder (reexecução da auditoria no backend e comparação — igual ao padrão da Frente 2).
3. **`executed_by`:** usuário autenticado (admin).
4. **`consistency_guard.can_apply`:** falso se não houver nenhuma linha apta no bloco A.

## Rotina de geração (não é `checkAndGrantInvitationBonus`)

- **Não** chama `checkAndGrantInvitationBonus` / loops automáticos antigos.
- Para cada item do **bloco A** (no apply):
  1. Lê `expectedBonuses_correto` da auditoria já validada pelo hash.
  2. Em loop: conta `leader_invitations` com `status IN ('available','sent','used')` por `(leader_id, event_id, commission_id)`.
  3. Enquanto `count < expected`: insere **na mesma transação**:
     - `registrations` com `payment_method = 'free_bonus'`, categoria padrão do evento (mesma ideia do fluxo legado);
     - `leader_invitations` com `bonus_registration_id` e `commission_id`.
  4. Se após inserção `count > expected`, **aborta com erro** (segurança).

## Duplicidade / reprocessamento

- **Limite superior:** nunca ultrapassa `expectedBonuses_correto` (checagem de COUNT após cada par criado).
- **Bloqueios** quando a auditoria sinaliza risco: classificações `bonus_reprocessing`, `commission_coupon_matching`, `wrongful_count_cupom_referral`; convites com `bonus_registration_id` fora do canônico; `divergencia_expected_bonuses ≠ 0`; `bonus_type` não é `invitation`/`both`.
- **Idempotência operacional:** reexecutar o apply com o mesmo estado já satisfeito resultará em **0** criações adicionais (COUNT já igual a expected).

## Saídas obrigatórias

1. **Relatório antes** — `relatorio_antes`
2. **Plano de geração** — `plano_geracao` (blocos A e B)
3. **Relatório depois** — `relatorio_depois` (somente após `apply`): IDs criados, totais, nota
