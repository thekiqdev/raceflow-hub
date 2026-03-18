# Relatório: Debug da migração de organizador (líder com bônus de comissão)

**Objetivo:** Instrumentação temporária para descobrir em que etapa o líder com bônus de comissão está sendo perdido na contagem do dry_run / migração.

---

## 1. O que foi implementado

- **Bloco `debug`** retornado **apenas no dry_run** na resposta da API (`POST .../change-organizer` com `dry_run: true`).
- O mesmo conteúdo pode ser logado no backend (resumo em `console.log` quando `NODE_ENV !== 'production'`).

### Estrutura do `debug`

| Bloco | Conteúdo |
|-------|----------|
| **leaders_by_source** | Lista de **todas** as ocorrências por fonte (cupom, convite, leader_event_commission). Para cada item: `leader_id`, `full_name`, `email`, `phone`, `source` e campos por fonte: `coupon_id`/`code`, `invitation_id`/`invitation_status`, `lec_id`/`bonus_type`. |
| **leaders_deduplicated** | `final_leader_ids`: lista única de líderes após união das 3 fontes. `removed_duplications`: líderes que apareciam em mais de uma fonte (e em quais fontes). |
| **leaders_classification** | Para cada líder da lista final: `already_in_b`, `match_by_email`, `match_by_phone`, `will_link_to_b`, `action` (reused/mapped/create/ignored), `reason` textual. |
| **coupons_to_update** | Cupons exclusivos: `coupon_id`, `code`, `leader_id`, `leader_name`, `organizer_from`/`organizer_to`, `action=update`. |
| **coupons_to_duplicate** | Cupons compartilhados: `coupon_id_original`, `code_original`/`code_final`, `leader_id_original`/`leader_id_final`, `leader_name`, `action=duplicate`. |
| **invitations_to_update** | Convites: `invitation_id`, `leader_id_old`/`leader_id_new`, `status`, `action`. |

---

## 2. Como auditar com o debug

1. Chamar o dry_run com o evento e organizador onde o problema aparece (ex.: deveria 3, aparece 2).
2. Na resposta, inspecionar o objeto **`debug`**.

### 2.1 O líder de comissão entrou na coleta?

- Em **`leaders_by_source`**, filtrar `source === 'leader_event_commission'`.
- **Se não houver nenhum item com esse source:** o líder está sendo **perdido na coleta**. Possíveis causas:
  - Query de `leader_event_commissions` não retorna o registro (ex.: `event_id` ou `organizer_id` do evento errado, JOIN com `events` filtrando demais).
  - Evento/organizador usados na chamada não batem com o evento que tem a comissão.
- **Se houver item(s) com `source === 'leader_event_commission'`:** anotar o(s) `leader_id` e seguir.

### 2.2 O líder está na lista final (deduplicada)?

- Ver **`leaders_deduplicated.final_leader_ids`**.
- **Se o `leader_id` do líder de comissão NÃO estiver em `final_leader_ids`:** ele foi excluído indevidamente na deduplicação (bug na união/Set). Isso seria estranho, pois a deduplicação só une as 3 fontes em um Set.
- **Se estiver em `final_leader_ids`:** a coleta e a deduplicação estão incluindo o líder; o problema está na classificação ou no uso do mapa no relatório.

### 2.3 Como o líder foi classificado?

- Em **`leaders_classification`**, localizar o item com o `leader_id` do líder de comissão.
- Ver **`action`** e **`reason`**:
  - **reused:** já estava em B; não entra em “a vincular”.
  - **mapped:** match por email/telefone; não entra em “a vincular”.
  - **create:** será vinculado a B; deve entrar em “Líderes a vincular”.
  - **ignored:** não deveria ocorrer para quem está em `final_leader_ids`; se ocorrer, há falha na lógica de classificação.

Se o líder estiver em **create** mas o relatório ainda mostrar 2 em vez de 3, o erro pode estar na **montagem do summary** (contadores `leaders_to_create` / `leaders_to_reuse` / `leaders_mapped_to_existing`) ou na forma como o frontend exibe.

### 2.4 O líder está nos cupons ou convites do debug?

- **coupons_to_update** / **coupons_to_duplicate:** ver se algum item tem o `leader_id` do líder de comissão.
- **invitations_to_update:** idem.

Isso confirma se, além de LEC, esse líder aparece em cupom/convite. Se aparecer só em LEC, a única entrada dele deve ser em `leaders_by_source` com `source === 'leader_event_commission'`.

---

## 3. Onde o líder pode estar sendo perdido (checklist)

| Etapa | O que verificar no debug | Conclusão se o líder some aqui |
|-------|---------------------------|----------------------------------|
| **1. Coleta** | `leaders_by_source` tem algum item com `source: 'leader_event_commission'` e o `leader_id` esperado? | **Problema na coleta:** query `leader_event_commissions` ou filtro (event_id/organizer). |
| **2. Deduplicação** | Esse `leader_id` está em `leaders_deduplicated.final_leader_ids`? | **Problema na deduplicação:** união/Set (improvável). |
| **3. Classificação** | Em `leaders_classification`, esse `leader_id` tem `action: 'create'` (ou reused/mapped conforme o caso)? | **Problema na classificação:** lógica de “já em B” / match email/telefone / create. |
| **4. Contadores do summary** | `summary.leaders_to_create` + `leaders_to_reuse` + `leaders_mapped_to_existing` batem com o número de itens em `leaders_classification` e com a lista final? | **Problema no relatório/summary:** contadores não refletem a lista final. |
| **5. Vínculo (execução real)** | Só aplicável na execução real: após migrar, existe linha em `organizer_group_leaders` (organizer_to, leader_id)? | **Problema no vínculo:** INSERT em `organizer_group_leaders` não está sendo feito para esse líder. |

---

## 4. Interpretação do cenário “deveria 3, aparece 2”

- **Cenário típico:** 1 líder já em B, 1 de convite/cupom, 1 só de comissão (LEC).
- **Comportamento esperado:** `leaders_by_source` com pelo menos um item `source: 'leader_event_commission'`; `final_leader_ids` com 3 IDs; `leaders_classification` com 3 itens (1 reused, 2 create ou 1 create + 1 mapped); summary com totais somando 3.
- **Se “aparece 2”:** usar o debug para ver:
  - Se o terceiro líder **não** aparece em `leaders_by_source` com `leader_event_commission` → **problema na coleta** (LEC não está sendo considerada para esse evento/organizador).
  - Se aparece em `leaders_by_source` mas **não** em `final_leader_ids` → **problema na deduplicação**.
  - Se está em `final_leader_ids` mas **não** em `leaders_classification` ou com `action` errada → **problema na classificação**.
  - Se está correto em `leaders_classification` mas o **summary** ou o frontend mostra 2 → **problema no relatório/filtro**.

---

## 5. Arquivos alterados (instrumentação)

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/services/changeEventOrganizerService.ts` | Tipos `MigrationDryRunDebug`, `LeadersBySourceItem`, etc.; função `buildDryRunDebug`; retorno do dry_run com `debug`; `console.log` resumido em dev. |
| `backend/src/controllers/changeEventOrganizerController.ts` | Inclusão de `debug: result.debug` na resposta JSON. |
| `docs/RELATORIO_DEBUG_MIGRACAO_ORGANIZADOR.md` | Este relatório. |

Nenhuma regra de negócio foi alterada; apenas instrumentação para auditoria.

---

## 6. Próximos passos após identificar a etapa

- **Se for coleta:** revisar a query de `leader_event_commissions` em `getLeaderIdsForEvent` e no `buildDryRunDebug` (event_id, JOIN com `events.organizer_id`, etc.).
- **Se for classificação:** revisar `resolveLeadersForMigration` (condições reused/mapped/create).
- **Se for summary/relatório:** revisar onde `leaders_to_create` / `leaders_to_reuse` / `leaders_mapped_to_existing` são preenchidos e como o frontend os exibe.
- **Se for vínculo (execução real):** revisar o INSERT em `organizer_group_leaders` e a ordem de execução (dry_run não faz INSERT; na execução real, o mapa usado em cupons/convites deve ser o mesmo que alimenta o vínculo).

Com o debug, o ponto exato em que o líder de comissão é perdido fica identificado para correção direcionada.

---

## 7. Correção: conflito de código em cupons compartilhados (409 Conflict)

### 7.1 Por que o erro ocorreu

- **Erro:** `duplicate key value violates unique constraint "uq_coupons_code_organizer"` (HTTP 409).
- **Constraint no banco:** `UNIQUE (organizer_id, code)` na tabela `coupons`.
- **Causa:** Na migração real, cupons **compartilhados** são **duplicados** para o organizador B (INSERT). Se o `code` do cupom já existir em B (de outro evento ou do próprio evento), o primeiro INSERT usava um sufixo `_MIGRADO_` + 8 primeiros caracteres do `event_id`. Quando **vários** cupons compartilhados tinham o **mesmo** `code` original, o segundo e os seguintes recebiam o **mesmo** `code_final` (ex.: `PROMO10_MIGRADO_8d88b8f3`), gerando novo conflito e quebrando a constraint.

### 7.2 O que foi corrigido

1. **Resolução em loop:** Antes de cada INSERT de cupom compartilhado, o sistema verifica se já existe em B um cupom com o `code` candidato. Se existir, gera um novo código com sufixo `_MIGRADO_` + 8 primeiros caracteres do `event_id` e, se ainda houver conflito, incrementa sufixo numérico (`_2`, `_3`, …) até encontrar um `code` livre.
2. **Helper:** `findUniqueCouponCodeForOrganizer(client, organizerTo, baseCode, eventId)` retorna `{ code, hadConflict }`.
3. **Relatório:** O resultado da migração inclui `code_conflicts_resolved` e a lista `code_conflicts_detail` com `{ coupon_id_original, code_original, code_final }` para cada conflito resolvido.
4. **Dry run:** O summary do dry run passa a incluir `conflitos_codigo_resolvidos` (quantos cupons compartilhados teriam conflito de código em B). No log de debug em dev aparece `conflitos_codigo_resolvidos: N`.
5. **Cupons exclusivos:** Não são alterados por essa lógica; apenas cupons compartilhados duplicados para B passam pela resolução de conflito. A constraint do banco **não** foi removida.

### 7.3 Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/services/changeEventOrganizerService.ts` | Novos: `couponCodeExists`, `findUniqueCouponCodeForOrganizer`; `migrateCoupons` usa o helper e preenche `code_conflicts_detail`; `buildDryRunSummary` calcula `conflitos_codigo_resolvidos` para organizador B; tipo `CodeConflictResolved` e `code_conflicts_detail` no resultado; log do dry_run inclui `conflitos_codigo_resolvidos`. |
| `docs/RELATORIO_DEBUG_MIGRACAO_ORGANIZADOR.md` | Seção 7 (este texto). |

### 7.4 Como testar novamente

1. **Dry run:** `POST /api/admin/events/:eventId/change-organizer` com `{ "new_organizer_id": "<B>", "dry_run": true }`. Na resposta, verificar `summary.conflitos_codigo_resolvidos`. No console do backend (dev), verificar no log `[migration dry_run debug]` o campo `conflitos_codigo_resolvidos`.
2. **Migração real:** Mesmo endpoint com `dry_run: false`. Deve concluir com 200 (sem 409). Na resposta, em `coupons_migrated` verificar `code_conflicts` e, se houver conflitos resolvidos, `code_conflicts_detail` com a lista `{ coupon_id_original, code_original, code_final }`.
3. **Cenário de múltiplos compartilhados com mesmo code:** Evento com mais de um cupom compartilhado com o mesmo `code` (ex.: dois cupons "PROMO10" em eventos diferentes). Migrar para um organizador B que já tenha um cupom "PROMO10". O primeiro deve ficar `PROMO10_MIGRADO_<eventId8>`, o segundo `PROMO10_MIGRADO_<eventId8>_2`, etc., sem erro de constraint.
