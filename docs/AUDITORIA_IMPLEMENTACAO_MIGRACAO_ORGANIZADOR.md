# Auditoria da implementação — Migração de organizador de evento

**Data da auditoria:** conforme solicitado.  
**Referência:** PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md, PLANO_IMPLEMENTACAO_ETAPAS_ALTERACAO_ORGANIZADOR.md.

---

## 1. Arquivos alterados

| Arquivo | Tipo |
|---------|------|
| `backend/migrations/100_event_organizer_migration_prep.sql` | Migration (Etapa 1) |
| `backend/migrations/101_event_organizer_migration_rollback_status.sql` | Migration (Etapa 10) |
| `backend/src/services/changeEventOrganizerService.ts` | Service principal |
| `backend/src/controllers/changeEventOrganizerController.ts` | Controller |
| `backend/src/routes/adminRoutes.ts` | Rotas admin |
| `docs/PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md` | Documentação (decisão Etapa 6) |
| `docs/PLANO_IMPLEMENTACAO_ETAPAS_ALTERACAO_ORGANIZADOR.md` | Documentação (registro etapas 5–10) |

**Não há testes automatizados** para migração, rollback ou validação pós-migração (nenhum `*.test.*` encontrado para change-organizer/migration).

---

## 2. O que foi implementado em cada arquivo

### 2.1 Migration 100
- Tabela `event_organizer_migration_log` com todos os campos do plano (id, event_id, organizer_from, organizer_to, contadores, dry_run, status, validation_errors, executed_at, executor_id, created_at). Status inicial: success, error, inconsistent, skipped.
- Colunas em `leader_invitations`: migrated_from_leader_id, migrated_at, migration_id.
- Índice único em convites: `uq_leader_invitation_unique` em (event_id, leader_id, status) WHERE status IN ('available','sent').
- Índices em coupon_events(event_id), coupons(organizer_id), coupons(code).
- Tabela opcional `event_organizer_migration_snapshot` (não utilizada pelo código).

### 2.2 Migration 101
- Inclusão do status `rollback` no CHECK de `event_organizer_migration_log` (bloco DO para remover constraint antiga por nome dinâmico).

### 2.3 changeEventOrganizerService.ts
- **Validação inicial:** evento existe, B existe, B é organizador (role), perfil existe. TODO explícito para compatibilidade de plano/limites.
- **Idempotência:** se event.organizer_id === newOrganizerId → skipped, log, sem escrita.
- **Lock:** SET lock_timeout 30s; BEGIN; SELECT events FOR UPDATE.
- **Dry run:** buildDryRunSummary + resolveLeadersForMigration(dryRun=true); ROLLBACK; log skipped; retorno com summary.
- **Etapa 3 – Líderes:** getLeaderIdsForEvent (cupons + convites), loadLeaderData, loadLeadersForOrganizer; mapa por já em B / match email ou phone / INSERT organizer_group_leaders; ON CONFLICT DO NOTHING.
- **Etapa 4 – Convites:** migrateInvitations (UPDATE leader_id, migrated_from_leader_id = leader_id, migrated_at, migration_id; WHERE migration_id IS NULL); countOrphanInvitations; se > 0 → ROLLBACK e erro.
- **Etapa 5 – Cupons:** loadEventCoupons; exclusivos (event_count=1) → UPDATE organizer_id e leader_id para B; compartilhados → conflito de code (sufixo _MIGRADO_+eventId.slice(0,8)), INSERT cupom B (current_uses=0), INSERT/DELETE coupon_events.
- **Etapa 7:** UPDATE events SET organizer_id = B.
- **Etapa 6:** migrateContactMessages (event_id + organizer_from → organizer_to).
- COMMIT; insertMigrationLog(success) com todos os contadores.
- **Etapa 8:** runPostMigrationValidation (event.organizer_id=B, cupons do evento de B, nenhum de A, leader_id em B, convites órfãos=0); se falha → updateMigrationLogValidationFailure; retorno status inconsistent e validation_errors.
- **Etapa 9:** getMigrationLogById, getMigrationLogsByEventId, MigrationLogEntry.
- **Etapa 10:** executeRollbackMigration (pré-condições: log success, executed_at preenchido, janela 48h, zero registrations após executed_at); transação: reverter convites (migration_id), cupons (exclusivos → A; compartilhados → baseCode, reinserir A, deletar B), contact_messages, events; INSERT log status rollback com validation_errors = rollback_of:migrationId.
- Log em todos os caminhos (erro validação, evento não encontrado pós-lock, idempotente, dry_run, órfãos, success, inconsistent). insertMigrationLog com validation_errors opcional.

### 2.4 changeEventOrganizerController.ts
- POST change-organizer: valida eventId e new_organizer_id; chama executeChangeEventOrganizer; resposta 200 ou 409 com success/status/migration_id/contadores/validation_errors.
- GET events/:eventId/migration-log; GET migration-log/:migrationId; POST migration-rollback (body migration_id).

### 2.5 adminRoutes.ts
- POST /events/:eventId/change-organizer; GET /events/:eventId/migration-log; GET /migration-log/:migrationId; POST /migration-rollback.

---

## 3. O que está 100% aderente ao plano

- **Migrations:** Estrutura do log, colunas de auditoria em convites, índice único de convites, índices de performance, status rollback (101). Snapshot opcional criado mas não usado.
- **Ordem das operações:** Líderes → Convites → verificação órfãos → Cupons → Evento → contact_messages → COMMIT → validação pós-migração.
- **Lock e timeout:** FOR UPDATE no evento, lock_timeout 30s, uma transação por migração.
- **Idempotência:** Checagem event.organizer_id === B no início; convites só atualizados WHERE migration_id IS NULL; ON CONFLICT em organizer_group_leaders e coupon_events.
- **Cupons:** Classificação exclusivo (event_count=1) vs compartilhado; exclusivo → UPDATE organizer_id e leader_id; compartilhado → duplicar para B (current_uses=0), conflito de code com sufixo _MIGRADO_; globais ignorados (só cupons em coupon_events do evento).
- **leader_id:** Mapa old→new usado em convites e cupons; cupons exclusivos e duplicados recebem leader_id mapeado (ou original se já em B).
- **Líderes:** Coleta de cupons + convites; matching por email (preferencial) e telefone; reutilização em B ou INSERT em organizer_group_leaders (mesmo group_leader vinculado a B).
- **Convites:** Apenas available/sent; migrated_from_leader_id, migrated_at, migration_id preenchidos; verificação de órfãos pré-commit; used/expired não alterados.
- **Validação pós-migração:** 1) event.organizer_id=B; 2) cupons do evento com organizer_id=B; 3) zero cupons de A no evento; 4) cupons com leader_id com líder em B; 7) zero convites órfãos. Falha → log inconsistent e validation_errors, retorno 409.
- **Logs/auditoria:** migration_id em toda execução; log em todos os caminhos; contadores no log de success; consulta por migration_id e por event_id.
- **Rollback:** Pré-condições (success, executed_at, 48h, zero inscrições novas); reversão de convites (migrated_from_leader_id), cupons (exclusivos/compartilhados), contact_messages, evento; registro de rollback no log com referência à migração original.

---

## 4. O que ficou parcial, simplificado ou pendente

| Item | Situação | Plano |
|------|----------|--------|
| **Compatibilidade do organizador B** | Não implementado (TODO no código). Sem checagem de plano ativo, limites de eventos ou permissões. | Validação antes de permitir alteração (Etapa 5). |
| **Líder sem email e sem telefone** | Tratado como “vincular o mesmo leader a B” (INSERT organizer_group_leaders). Não há criação de “novo” group_leader com placeholder. | Plano sugere criar líder em B com placeholder se nome vazio; modelo atual usa apenas vínculo organizer_group_leaders. |
| **Rollback – lock do evento** | Rollback não faz FOR UPDATE no evento. Concorrência com nova migração ou outro rollback no mesmo evento possível. | Plano não exige explicitamente; boa prática seria lock no evento durante rollback. |
| **Rollback – cupom compartilhado original de A inexistente** | Se o cupom original de A (code = baseCode) tiver sido deletado, rollback não re-insere vínculo em coupon_events; evento fica sem aquele cupom. Sem falha explícita. | Plano assume cupom de A existente; cenário de exclusão não detalhado. |
| **Rollback – leader_id em cupons exclusivos** | Apenas organizer_id volta para A; leader_id não é revertido (não há armazenamento do leader_id original de cupons). | Plano: “leader_id_original … se não tiver, só organizer_id de volta para A e leader_id pode ficar como está”. |
| **Líderes criados em B após rollback** | Não são removidos nem desativados; permanecem em organizer_group_leaders. | Plano deixa como decisão de política (desativar, remover vínculo ou deixar). |
| **Snapshot pré-migração** | Tabela criada na migration 100; nenhum código popula ou usa. | Opcional “nível enterprise”. |
| **Testes automatizados** | Nenhum teste para migração, validação ou rollback. | Plano e doc de implementação preveem testes (integração, idempotência, órfãos, rollback, validação). |

---

## 5. Riscos silenciosos de quebra

1. **coupons.organizer_id FK para users(id):** No código usa-se profile id (organizerTo/organizerFrom). No projeto, profiles.id = users.id; portanto o mesmo UUID atende à FK. **Risco baixo** desde que essa igualdade seja mantida.
2. **Rollback sem lock no evento:** Duas operações (ex.: rollback e nova migração) no mesmo evento podem rodar em paralelo e deixar estado inconsistente. **Risco médio**; mitigação: uso restrito (admin) e janela 48h.
3. **Cupom compartilhado com code já contendo "_MIGRADO_":** Se A tiver um cupom com code "PROMO_MIGRADO_X", no rollback o baseCode seria "PROMO"; busca por cupom de A com code "PROMO" pode retornar outro cupom. **Risco baixo** (codes com _MIGRADO_ são criados pelo próprio fluxo).
4. **Validação pós-migração com executed_at em fuso:** executed_at vem do log (TIMESTAMPTZ); comparação com registrations.created_at é consistente no PostgreSQL. **Risco desprezível.**
5. **Migration 101 e constraint:** O DO que remove o CHECK em status depende de pg_get_constraintdef conter 'status'. Se o nome ou a definição mudar, a remoção pode não ocorrer e a ADD CONSTRAINT pode falhar por duplicidade. **Risco baixo** em ambiente controlado.

---

## 6. Migração pronta para teste local?

**Do ponto de vista funcional:** Sim. Todas as etapas do plano (1–10) estão implementadas: banco, fluxo transacional, líderes, convites, cupons, evento, contact_messages, validação pós-migração, logs, rollback. Pré-condições e ordem estão alinhadas ao plano; os itens parciais/pendentes não impedem um primeiro teste local.

**Condição:** É necessário aplicar as duas migrations (100 e 101) no banco local antes de testar (sem 101, o insert de rollback falha por CHECK de status).

---

## 7. Cenários recomendados para testar primeiro

1. **Dry run:** Evento com cupons (exclusivo + compartilhado) e convites; POST com dry_run=true; conferir summary (exclusivos, compartilhados, invitations_to_update, leaders) e que nenhum dado foi alterado.
2. **Idempotência:** Migrar evento para B; nova chamada com o mesmo B; deve retornar skipped e não alterar dados.
3. **Migração completa (happy path):** Evento de A com 1 cupom exclusivo, 1 compartilhado, 2 convites available/sent; migrar para B; verificar event.organizer_id, cupons de B, coupon_events, leader_invitations (leader_id e migrated_*), contact_messages; validação pós-migração deve passar; log com status success e contadores.
4. **Convites órfãos:** Simular cenário em que um leader_id de convite não está no mapa (ex.: remover temporariamente o leader de organizer_group_leaders de B após resolver líderes); esperar ROLLBACK e mensagem de convites órfãos.
5. **Validação pós-migração:** Após migração bem-sucedida, alterar manualmente um cupom do evento para organizer_id = A; chamar validação (ou reexecutar fluxo que a chama); esperar status inconsistent e validation_errors (ou checagem equivalente).
6. **Rollback dentro da janela e sem inscrições novas:** Migrar evento para B; POST migration-rollback com migration_id; verificar evento de volta em A, convites com leader_id original, cupons e contact_messages revertidos; log com status rollback.
7. **Rollback negado – inscrições novas:** Migrar; criar 1 registration no evento com created_at > executed_at; tentar rollback; esperar 409 e motivo “inscrições após a migração”.
8. **Consulta ao log:** GET /events/:eventId/migration-log e GET /migration-log/:migrationId; conferir campos e ordenação.

---

## 8. Parecer final

### PRONTO PARA TESTE LOCAL

A implementação está aderente ao plano e pode ser testada localmente desde que:

1. **Migrations aplicadas:** Rodar 100 e 101 no banco local (ex.: `npm run migrate` ou o comando equivalente do projeto).
2. **Cenários sugeridos:** Priorizar dry run, idempotência, happy path, convites órfãos, validação pós-migração e rollback (permitido e negado), além da consulta ao log.

**Antes de produção ou uso em staging mais amplo, recomenda-se:**

- Implementar o TODO de **compatibilidade do organizador B** (plano/limites), se o modelo de negócio existir.
- Adicionar **lock do evento (FOR UPDATE)** no início da transação de rollback para evitar concorrência.
- Incluir **testes automatizados** (pelo menos integração para happy path, idempotência, órfãos, rollback e validação pós-migração), conforme plano e doc de implementação.

Se quiser, na próxima etapa podemos descrever os casos de teste em formato de checklist (por exemplo em `TESTES_MIGRACAO_ORGANIZADOR.md`) ou esboçar os testes automatizados (suíte e cenários).
