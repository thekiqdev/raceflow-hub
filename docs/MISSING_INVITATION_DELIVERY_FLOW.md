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
- Por linha (A e B): campos resumidos + **`prova_expandida`** (dry_run expandido de prova, somente leitura).

### Dry_run expandido de prova (comissões com faltantes)

Por `leader_id` + `commission_id`, cada item inclui (espelhados também no nível do plano):

| Campo | Significado |
|--------|-------------|
| `expectedBonuses_correto` | Igual à Fase 1 (canônico) |
| `timesGranted_validos` | Convites `available\|sent\|used` cujo `leader_invitation_id` ∈ `leader_invitation_ids_validos` |
| `timesGranted_inconsistentes` | Demais convites nesses status (classificação vs canônico) |
| `faltantes_teoricos` | `max(0, expected − timesGranted_db)` |
| `faltantes_vs_apenas_validos` | `max(0, expected − timesGranted_validos)` |
| `faltantes_liberados_para_apply` | `0` se bloqueado; se apto, igual a `faltantes_teoricos` (mesma regra do apply) |
| `block_reason_codes[]` | Códigos estáveis (`BONUS_REGISTRATION_FORA_CANONICO`, `BONUS_REPROCESSING`, …) |
| `block_reason_human_readable[]` | Texto auditável |

**Bloco A (prova):** convites válidos — `leader_invitation_id`, `bonus_registration_id`, `registration_id`, `status`, `created_at`, `motivo_validade`.

**Bloco B (prova):** inconsistentes — `tipo_inconsistencia`, `motivo_detalhado`, `impacta_bloqueio_geracao_futura`, convites `expired` só para rastreo (não entram no COUNT).

**Bloco C:** resumo matemático.

**Bloco D:** `apto_para_apply`, motivos, quantos seriam gerados se apto, `saneamento_sugerido[]`.

**Não altera regra de negócio** — apenas enriquece o payload do dry_run; não gera convites nem altera cupons.

### Bloqueio real vs aviso (heurística agregada)

- **Evidência material:** `inconsistent_leader_invitation_ids[]` / `blocking_evidence_count` derivados de convites **granted** (available|sent|used) classificados como inconsistentes no dry_run expandido.
- **Regra:** se `granted_inconsistentes === 0` **e** `blocking_evidence_count === 0`, então as flags agregadas da Fase 1 `BONUS_REGISTRATION_FORA_CANONICO` e `BONUS_REPROCESSING` **não bloqueiam apply** — viram **warnings** (`warning_codes`), com texto explicando os IDs agregados da auditoria quando existirem.
- **Bloqueadores “duros”** (sem rebaixamento por esta regra): líder inválido, timesGranted > expected, divergência expected prod vs canônico, cupom/referral, bonus_type inelegível.
- **COUNT divergente** (soma válidos+inconsistentes ≠ times_granted_db): **aviso**, não bloqueia apply neste fluxo.

### Caso “Carol Martins” / comissão `ade7cdf8-ecbe-419c-aa0c-50cf908956d9`

1. Selecionar o **evento** correto na auditoria.
2. (Opcional) Escopo **só líder** = Carol Martins para reduzir ruído.
3. Rodar **auditoria** (Fase 1), depois **Corrigir convites não entregues** → **dry_run**.
4. Se **apto** após a regra de evidência: a comissão aparece em **Bloco A — Aptos**; `eligible_to_generate_missing_invitations` = faltantes teóricos; **warnings** podem aparecer sem impedir apply.
5. Se ainda **bloqueado**: tabela Bloco B + prova expandida com **blockers** vs **warnings**, `blocking_evidence_count` e IDs que sustentam bloqueio quando houver evidência.

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
- **Colisões UNIQUE (23505):** tratadas no serviço com SAVEPOINT (não propagam 409 genérico “Duplicate entry”). Log estruturado com tabela/constraint/IDs; itens vão para `skipped_existing` ou `blocked` (ex.: índice legado `uq_leader_invitation_unique` — ver migração **102**).
- **Migration 102:** remove `uq_leader_invitation_unique` (mig. 100), incompatível com múltiplos convites `available` por líder/evento quando há várias comissões/slots.

## Saídas obrigatórias

1. **Relatório antes** — `relatorio_antes`
2. **Plano de geração** — `plano_geracao` (blocos A e B)
3. **Relatório depois** — `relatorio_depois` (somente após `apply`): IDs criados, totais, nota, blocos `created` / `skipped_existing` / `blocked` / `failed`, `equivalencia_logica`
