# Relatório final: Correção líderes com comissão na migração de organizador

**Cenário do teste:** Dry run mostrava "Líderes a vincular: 2" (correto seria 3). Na execução real, a validação pós-migração retornou: "1 líder(es) em leader_event_commissions do evento não vinculado(s) a B".

---

## 1. Por que o líder de comissão não estava entrando

Havia **dois** pontos:

1. **Coleta (getLeaderIdsForEvent):** A query em `leader_event_commissions` usava `INNER JOIN events e ON e.id = lec.event_id AND e.organizer_id = $2` e `WHERE lec.event_id = $1` com `[eventId, organizerFrom]`. Qualquer divergência entre `events.organizer_id` e o `organizerFrom` passado (ou tipo de dado) podia fazer a linha de LEC não retornar, e o líder só de comissão ficava de fora da lista.

2. **Vínculo quando havia match (resolveLeadersForMigration):** Quando um líder era resolvido por **match por email/telefone** com um líder já em B, o código **não** fazia `INSERT` em `organizer_group_leaders` para o **líder original**. Só atualizava o mapa para uso em convites/cupons. Como `leader_event_commissions` continua referenciando o **leader_id original**, a validação pós-migração (todo líder em LEC do evento deve estar em `organizer_group_leaders` para B) falhava para esse líder.

---

## 2. Em que etapa o líder estava sendo perdido

- **Na coleta:** Possível perda se o JOIN com `events` excluísse a linha de LEC (filtro por organizador).
- **No vínculo:** No caso “match por email/telefone”, o líder original não era inserido em B, então a validação “líder em LEC vinculado a B” falhava.

---

## 3. O que foi alterado para corrigir

### 3.1 getLeaderIdsForEvent

- **Antes:** Query em LEC com `INNER JOIN events e ON e.id = lec.event_id AND e.organizer_id = $2` e `WHERE lec.event_id = $1` (`[eventId, organizerFrom]`).
- **Depois:** Query apenas por evento: `SELECT DISTINCT lec.leader_id FROM leader_event_commissions lec WHERE lec.event_id = $1` com `[eventId]`.
- **Motivo:** Garantir que **todos** os líderes em `leader_event_commissions` do evento entrem na lista, sem depender do filtro por organizador.

### 3.2 resolveLeadersForMigration

- **Antes:** No ramo “matched” (match por email/telefone) só se fazia `map.set(orig.id, matched)` e `continue`, sem INSERT.
- **Depois:** No ramo “matched”, além do mapa, é feito `INSERT INTO organizer_group_leaders (organizer_id, leader_id) VALUES (organizerTo, orig.id) ON CONFLICT DO NOTHING` quando **não** é dry run.
- **Motivo:** O líder original passa a existir em B, `leader_event_commissions` continua apontando para ele e a validação pós-migração passa a ser atendida.

### 3.3 Summary e UI

- **Backend:** Em `DryRunSummary` foi adicionado `leaders_to_link = leaders_to_create + leaders_mapped_to_existing` (todos que passarão a aparecer na lista de B).
- **Frontend:** "Líderes a vincular (passarão a aparecer na lista)" passou a usar `summary.leaders_to_link` quando existir, senão `summary.leaders_to_create`.

### 3.4 Debug do dry run

- **leaders_by_source** passou a ser um objeto: `{ coupon, invitation, leader_event_commission }`, cada um com array de itens (leader_id, nome, email, telefone, source, ação final, motivo, etc.).
- Incluídos no debug: `leaders_to_create`, `leaders_to_reuse`, `leaders_mapped_to_existing`, `leaders_to_link`.
- Na função de debug, a query de LEC foi alinhada à de `getLeaderIdsForEvent` (apenas `WHERE lec.event_id = $1`).

---

## 4. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/services/changeEventOrganizerService.ts` | (1) LEC em `getLeaderIdsForEvent` sem JOIN com events; (2) no “matched”, INSERT em `organizer_group_leaders` quando não dry run; (3) `DryRunSummary.leaders_to_link`; (4) `MigrationDryRunDebug` com `leaders_by_source` por tipo e contadores; (5) `buildDryRunDebug` com parâmetro de contagens, LEC só por event_id e retorno no novo formato; (6) branch dry_run preenche `summary.leaders_to_link` e passa contagens para o debug. |
| `src/components/admin/ChangeOrganizerModal.tsx` | "Líderes a vincular" usa `leaders_to_link ?? leaders_to_create`; texto dos mapeados ajustado. |
| `docs/RELATORIO_CORRECAO_FINAL_LIDERES_COMISSAO_MIGRACAO.md` | Este relatório. |

---

## 5. Resumo da correção

- Líderes que vêm **só** de `leader_event_commissions` passam a ser sempre considerados na coleta (query só por `event_id`).
- Líderes resolvidos por match (email/telefone) **também** são inseridos em `organizer_group_leaders` para B, evitando falha na validação de LEC.
- O dry run passa a exibir o total correto em "Líderes a vincular" via `leaders_to_link` (create + mapped).
- A validação pós-migração que já existia foi mantida e continua correta.

---

## 6. Como testar de novo (local)

### Dry run

1. Admin → Eventos → no evento, "Alterar organizador".
2. Escolher o novo organizador e clicar em **Simular (dry run)**.
3. Verificar:
   - "Líderes a vincular (passarão a aparecer na lista)" = **3** (ou o total esperado), usando `leaders_to_link`.
   - Na resposta da API, em `debug`:
     - `debug.leaders_by_source.leader_event_commission` com o(s) líder(es) de comissão;
     - `debug.leaders_deduplicated.final_leader_ids` contendo os 3 (ou N) líderes;
     - `debug.leaders_classification` com ação e motivo por líder;
     - `debug.leaders_to_link` = 3 (ou o total esperado).

### Execução real

1. No mesmo fluxo, após o dry run, clicar em **Confirmar e executar**.
2. Verificar:
   - Resposta de sucesso (sem erro de validação).
   - Ausência da mensagem "1 líder(es) em leader_event_commissions do evento não vinculado(s) a B".
   - Na conta do novo organizador, em "Líderes de Grupo", os 3 líderes (incluindo o de comissão) aparecem.

### Testes automatizados

- Rodar: `npm run test:migration-leaders` no backend. Os 7 testes devem passar.
