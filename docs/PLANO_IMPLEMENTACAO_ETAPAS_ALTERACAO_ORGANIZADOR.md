# Plano de implementação por etapas — Alteração de organizador de evento

**Objetivo:** Transformar o plano técnico em fases pequenas, independentes e testáveis, com foco em segurança, testabilidade e baixo risco.

**Referências:**
- `PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md` — plano técnico completo
- `IMPLEMENTACAO_SEGURA_MIGRACAO_ORGANIZADOR.md` — padrões de resposta, ordem das operações, 0D (banco), testes

**Status:** Planejamento de execução — **NÃO implementar código** até aprovação e ordem de execução definida.

---

## Regras obrigatórias (não negociáveis)

- O sistema **não** pode perder dados históricos (orders, commissions, convites usados/expirados).
- Convites existentes (available/sent) devem **continuar funcionando** após a migração.
- Comissões **não** podem ser quebradas (leader_id correto em B; histórico preservado).
- **Não** pode haver duplicidade de leader ou convite (índices e lógica de idempotência).
- Deve ser possível **rodar novamente** sem corromper dados (idempotência; migration_id IS NULL no UPDATE de convites).

---

## Visão geral das etapas

| # | Etapa                         | Depende de | Produção segura |
|---|-------------------------------|------------|------------------|
| 1 | Preparação de banco           | —          | Sim              |
| 2 | Estrutura base de migração    | 1          | Sim (sem executar migração real) |
| 3 | Migração de leaders           | 1, 2       | Não (até testes) |
| 4 | Migração de convites          | 1, 2, 3    | Não (até testes) |
| 5 | Migração de cupons            | 1, 2, 3    | Não (até testes) |
| 6 | (Opcional) Migração de histórico | 1, 2   | Avaliar          |
| 7 | Atualização do evento         | 1–5        | Não (integração) |
| 8 | Validação pós-migração        | 1–7        | Sim              |
| 9 | Auditoria e logs              | 1, 2       | Sim              |
| 10| Rollback seguro               | 1–9        | Sim (documentado) |

---

## Etapa 1 — Preparação de banco

### 1.1 Nome
**Preparação de banco (migrations, índices, auditoria).**

### 1.2 Objetivo
Garantir que o esquema do banco suporte migração idempotente, sem duplicidade e com rastreabilidade, **antes** de qualquer lógica de negócio de migração.

### 1.3 O que será implementado

- **Tabela de log de migração**  
  `event_organizer_migration_log`: id, event_id, organizer_from, organizer_to, total_cupons_exclusivos, total_cupons_compartilhados, total_lideres_criados, total_lideres_reutilizados, total_invitations_updated, conflitos_codigo_resolvidos, dry_run, status, validation_errors, executed_at, executor_id, created_at. (Conforme Etapa 5quater do plano técnico.)

- **Campos em `leader_invitations`** (opcional mas recomendado):  
  `migrated_from_leader_id` (UUID NULL), `migrated_at` (TIMESTAMPTZ NULL), `migration_id` (UUID NULL).

- **Unicidade e índices:**  
  - Coupons: garantir `UNIQUE (organizer_id, code)` se não existir.  
  - Convites: `CREATE UNIQUE INDEX uq_leader_invitation_unique ON leader_invitations (event_id, leader_id, status) WHERE status IN ('available', 'sent')`.  
  - Performance: índices em `coupon_events(event_id)`, `coupons(organizer_id)`, `coupons(code)` (ou equivalentes já existentes).

- **Snapshot (opcional — enterprise):**  
  Tabela `event_organizer_migration_snapshot` (migration_id, event_id, organizer_id, payload_json, created_at) para rollback real e auditoria.

### 1.4 Riscos envolvidos

- Migration aplicada em produção com erro de sintaxe ou conflito de nome de índice → aplicar em ambiente de staging primeiro; usar `IF NOT EXISTS` onde aplicável.
- Novos campos NOT NULL sem default em tabelas com dados → usar NULL ou default e preencher em passo posterior.

### 1.5 Como validar (testes)

- Rodar migrations em banco limpo e em banco com dados (staging).
- Verificar que índices existem: `\d leader_invitations`, `\d coupons`, `\di` (PostgreSQL).
- Inserir registro de teste em `event_organizer_migration_log` e consultar; verificar colunas em `leader_invitations` se criadas.
- Testes unitários ou de migration: após aplicar, nenhuma constraint violation em dados existentes.

### 1.6 Pode ser feito em produção com segurança?

**Sim.** São apenas DDL (CREATE TABLE, CREATE INDEX, ALTER TABLE ADD COLUMN). Fazer em janela de baixo uso; ter rollback de migration documentado (DROP INDEX / DROP COLUMN se necessário).

### 1.7 Depende de etapa anterior?

**Não.** É a primeira etapa.

---

## Etapa 2 — Estrutura base de migração

### 2.1 Nome
**Estrutura base: service, idempotência e lock.**

### 2.2 Objetivo
Ter o esqueleto do fluxo de migração (service, endpoint ou job), com idempotência e lock de concorrência, **sem** executar ainda a migração real de leaders/convites/cupons/evento.

### 2.3 O que será implementado

- **Service (ex.: `changeEventOrganizerService`):**
  - Entrada: event_id, new_organizer_id (B), opções (dry_run, migration_id).
  - Fluxo: validações iniciais (evento existe, B existe e é organizador, **compatibilidade de B** — plano ativo, limites, permissões); idempotência (se event.organizer_id já é B → retornar success/skipped sem escrita); lock do evento (`SELECT ... FROM events WHERE id = $event_id FOR UPDATE`); em seguida, por enquanto, apenas ROLLBACK ou retorno sem alterar dados (ou dry_run que apenas lê e retorna payload simulado).

- **Controle de idempotência:**  
  No início, dentro da transação: ler `events.organizer_id`; se já for B, considerar "já migrado", não executar escritas, retornar status padronizado (ex.: skipped).

- **Lock de concorrência:**  
  Adquirir lock no registro do evento (FOR UPDATE) no início da transação; timeout de lock (ex.: 30s) para evitar espera infinita.

- **Geração de `migration_id`:**  
  Em toda execução (incluindo skipped e dry_run), gerar UUID como migration_id; incluir no retorno da API e persistir no log quando houver escrita.

- **Padrão de resposta:**  
  status: success | error | inconsistent | skipped (conforme IMPLEMENTACAO_SEGURA 0.1).

### 2.4 Riscos envolvidos

- Lock mal liberado (transação longa ou exceção) → garantir que transação seja encerrada (commit/rollback) em todos os caminhos; usar timeout.
- Endpoint exposto sem permissão → restringir a admin (ou política definida).

### 2.5 Como validar (testes)

- Teste unitário: com evento de A, chamar service com B → não alterar evento; retornar que "faria" migração (ou dry_run com payload).
- Teste de idempotência: com evento já de B, chamar service com B → retorno skipped, nenhuma escrita.
- Teste de lock: duas chamadas simultâneas para o mesmo evento → uma completa ou retorna; a outra espera e depois retorna (ou skipped).
- Teste de compatibilidade: B sem plano ativo ou limite atingido → falha com mensagem clara antes de lock.

### 2.6 Pode ser feito em produção com segurança?

**Sim**, desde que o fluxo **não** execute ainda UPDATE em events/coupons/leader_invitations (apenas leituras e, se desejado, escrita em log com dry_run). Ou seja: deploy do service com "feature flag" ou branch que só faz validação + lock + retorno, sem alterar dados.

### 2.7 Depende de etapa anterior?

**Sim.** Depende da Etapa 1 (tabela de log e, se for usar, campos em leader_invitations e índices).

---

## Etapa 3 — Migração de leaders

### 3.1 Nome
**Migração de leaders (mapa old_leader_id → new_leader_id em B).**

### 3.2 Objetivo
Garantir que todo leader_id referenciado por cupons e convites do evento tenha um equivalente no organizador B (criado ou reutilizado), sem duplicar líderes e preservando líderes do organizador A.

### 3.3 O que será implementado

- Coletar todos os `leader_id` distintos dos cupons do evento (via coupon_events) **e** dos convites disponíveis (leader_invitations com event_id e status IN ('available','sent')).
- Carregar dados dos líderes em lote (group_leaders + users/profiles).
- Para cada líder: verificar se existe equivalente em B (por email, fallback telefone); se não, criar novo líder em B e registrar em organizer_group_leaders.
- Construir mapa `old_leader_id → new_leader_id` para uso nas etapas de convites e cupons.
- Edge cases (plano técnico Etapa 5sept): líder sem email/telefone (criar com placeholder); múltiplos líderes em B com mesmo email (usar um único, ex.: LIMIT 1 ordenado por created_at).

### 3.4 Riscos envolvidos

- Criar líder duplicado em B (mesmo email) → usar busca única antes de INSERT; índice/constraint em (organizer_id, email) se aplicável.
- Líder “órfão” em B sem vínculo com evento/cupom após migração → aceitável; o importante é que cupons/convites referenciem líder em B.

### 3.5 Como validar (testes)

- Teste de integração: evento com 2 cupons com leader_id; um líder já existe em B (mesmo email), outro não → após “só esta etapa”, 1 líder reutilizado, 1 criado; mapa com 2 entradas.
- Verificar que líderes de A não foram alterados (organizer_group_leaders de A inalterado).
- Teste com líder sem email/telefone → novo líder criado em B com placeholder; migração não falha.

### 3.6 Pode ser feito em produção com segurança?

**Não**, até que esta etapa seja apenas uma **parte** do fluxo transacional completo (sem alterar evento ainda). Em produção, esta etapa deve rodar **dentro** do mesmo fluxo que convites + cupons + evento, para não deixar dados intermediários inconsistentes. Em staging/dev, pode ser testada isoladamente (só construir mapa e eventualmente criar líderes em B, sem alterar evento).

### 3.7 Depende de etapa anterior?

**Sim.** Etapa 1 (banco); Etapa 2 (service, lock, idempotência).

---

## Etapa 4 — Migração de convites

### 4.1 Nome
**Migração de convites (reassociar leader_id para líder em B).**

### 4.2 Objetivo
Garantir que convites disponíveis (available/sent) continuem utilizáveis no organizador B, sem convites órfãos e preservando status e histórico (used/expired intocados).

### 4.3 O que será implementado

- Listar `leader_invitations` com event_id = evento e status IN ('available','sent').
- Para cada convite: obter new_leader_id do mapa (Etapa 3); UPDATE leader_invitations SET leader_id = new_leader_id, updated_at = NOW(), migrated_from_leader_id = old_leader_id, migrated_at = NOW(), migration_id = $migration_id WHERE id = $id **AND (migration_id IS NULL)**.
- Verificação pós-update (pré-commit): query de convites órfãos — COUNT de leader_invitations (available/sent) do evento cujo leader_id não está em organizer_group_leaders para B; se > 0 → ROLLBACK.
- Não alterar convites com status used ou expired.

### 4.4 Riscos envolvidos

- Convite órfão (leader_id não existe em B) → mitigado pela verificação pré-commit e pela inclusão dos leader_ids dos convites no mapa de líderes (Etapa 3).
- Duplicar convite ou atualizar duas vezes em retry → mitigado por migration_id IS NULL no WHERE e pelo índice único (event_id, leader_id, status) para available/sent.

### 4.5 Como validar (testes)

- Teste de integração: evento com N convites available/sent; após migração completa, todos com leader_id em B; uso do convite no checkout (ou endpoint de validação) aceita normalmente.
- Teste de idempotência: rodar migração duas vezes (segunda com evento já de B) → convites não são atualizados novamente (migration_id já preenchido na primeira).
- Teste de órfão: simular líder que falhou no mapa → verificação pré-commit deve abortar (ROLLBACK).

### 4.6 Pode ser feito em produção com segurança?

**Não** de forma isolada. Deve rodar **dentro** do mesmo fluxo que líderes + cupons + evento (ordem: líderes → convites → cupons → evento). Em produção, o deploy será do fluxo completo (Etapas 3 + 4 + 5 + 7 + 8).

### 4.7 Depende de etapa anterior?

**Sim.** Etapa 1 (campos migration_id, etc.); Etapa 2 (service, lock); Etapa 3 (mapa de líderes). Convites devem ser migrados **antes** dos cupons (ordem do plano técnico).

---

## Etapa 5 — Migração de cupons

### 5.1 Nome
**Migração de cupons (exclusivos vs compartilhados; leader_id).**

### 5.2 Objetivo
Garantir que cupons que eram válidos para o evento continuem válidos sob o organizador B: exclusivos transferidos (UPDATE organizer_id); compartilhados duplicados para B; leader_id mantido via mapa; conflito de código tratado.

### 5.3 O que será implementado

- Identificar cupons do evento (via coupon_events WHERE event_id = evento). Classificar: **exclusivo** (count eventos do cupom = 1) ou **compartilhado** (count > 1). **Globais** (sem registro para este evento em coupon_events) → ignorados.
- **Exclusivos:** UPDATE coupons SET organizer_id = B, leader_id = mapa[leader_id] WHERE id IN (...). Manter current_uses.
- **Compartilhados:** para cada um: verificar conflito de código em B; definir code_final (original ou sufixo); INSERT em coupons (organizer_id = B, current_uses = 0, leader_id = mapa[leader_id]); INSERT coupon_events (novo cupom, event_id); DELETE coupon_events (cupom original de A, event_id).
- Garantir UNIQUE(code, organizer_id) ao inserir (e sufixo em caso de conflito).

### 5.4 Riscos envolvidos

- Cupom de A aceito indevidamente após migração → validação usa event.organizer_id = B; apenas cupons de B são encontrados.
- Duplicar cupom compartilhado e deixar vínculo em A → DELETE em coupon_events (coupon_id original, event_id) remove o vínculo do evento com o cupom de A.
- current_uses zerado em exclusivo → não zerar; só em duplicados (compartilhados) o novo cupom de B tem current_uses = 0.

### 5.5 Como validar (testes)

- Teste: evento com 1 exclusivo e 1 compartilhado → após migração, validateCoupon(code_exclusivo, B, event_id) e validateCoupon(code_compartilhado_ou_sufixo, B, event_id) retornam válido; validateCoupon(code, A, event_id) para o evento não aceita.
- Teste de conflito de código: B já tem cupom "PROMO"; compartilhado do evento também "PROMO" → cupom duplicado para B com sufixo (ex.: PROMO_MIGRADO).
- Teste de leader_id: cupom com leader_id → cupom de B com leader_id = mapa[leader_id].

### 5.6 Pode ser feito em produção com segurança?

**Não** de forma isolada. Deve rodar na mesma transação que líderes, convites e atualização do evento. Deploy em produção = fluxo completo.

### 5.7 Depende de etapa anterior?

**Sim.** Etapa 1 (índices, log); Etapa 2 (service, lock); Etapa 3 (mapa de líderes). Etapa 4 (convites) deve ter sido executada antes na mesma transação (ordem: líderes → convites → cupons → evento).

---

## Etapa 6 — (Opcional) Migração de histórico

### 6.1 Nome
**Migração de histórico (estratégia e impacto).**

### 6.2 Objetivo
Decidir e, se aplicável, implementar estratégia para dados “históricos” ligados ao evento/organizador (ex.: contact_messages.organizer_id, relatórios, comissões já pagas). Objetivo: não perder dados; definir se algo deve “migrar” para B ou permanecer em A.

### 6.3 O que será implementado

- **Decisão de negócio:**  
  - Manter no organizador A: contact_messages, withdraw_requests, histórico de comissões já pagas (não alterar).  
  - Ou: atualizar contact_messages SET organizer_id = B WHERE event_id = evento (para aparecer no painel de B). Documentar a escolha.

- **Comissões e relatórios:**  
  leader_event_commissions e registrations permanecem ligados ao evento (event_id); após trocar events.organizer_id, relatórios por organizador (e.organizer_id) passam a mostrar o evento sob B. Nenhuma alteração em tabelas de comissão/inscrição além do que já está no plano (não migrar histórico de comissões para “outro” organizador).

- Se houver tabelas adicionais que referenciem organizer_id e que devam ser atualizadas para B quando o evento migrar, listar e tratar aqui (ex.: opcional contact_messages).

### 6.4 Riscos envolvidos

- Alterar histórico pode quebrar relatórios ou auditoria do organizador A → preferir não alterar dados antigos; apenas evento e cupons/convites/líderes conforme etapas anteriores.
- contact_messages: se atualizar para B, A deixa de ver mensagens do evento → decidir por produto.

### 6.5 Como validar (testes)

- Se contact_messages for atualizado: após migração, B vê mensagens do evento; A não (ou vice-versa conforme decisão).
- Relatórios de comissão e inscrições: evento aparece sob B; totais e detalhes consistentes.

### 6.6 Pode ser feito em produção com segurança?

**Avaliar.** Se for apenas “não migrar nada de histórico” (decisão padrão do plano técnico), não há código novo; se for UPDATE em contact_messages, fazer na mesma transação da Etapa 7 (atualização do evento) ou em passo explícito documentado.

### 6.7 Depende de etapa anterior?

**Sim.** Etapa 1 (banco); Etapa 2 (fluxo). Pode ser implementada como último passo da transação (junto com ou após Etapa 7), conforme decisão.

---

## Etapa 7 — Atualização do evento

### 7.1 Nome
**Atualização do evento (organizer_id = B).**

### 7.2 Objetivo
Alterar definitivamente o dono do evento para B, **somente** após líderes, convites e cupons estarem consistentes na mesma transação.

### 7.3 O que será implementado

- Único passo de escrita no evento: `UPDATE events SET organizer_id = $organizer_b_id, updated_at = NOW() WHERE id = $event_id`.
- Executado **depois** de: resolução de líderes, reassociação de convites, verificação de órfãos, processamento de cupons (exclusivos e compartilhados).
- Na mesma transação que as etapas 3, 4 e 5 (e opcional 6).

**Implementado:** O passo está em `changeEventOrganizerService.ts`: após `migrateCoupons`, executa o UPDATE em `events` e em seguida `migrateContactMessages` (Etapa 6), antes do COMMIT.

### 7.4 Riscos envolvidos

- Executar antes de convites/cupons → evento de B mas cupons/convites ainda de A → checkout e validação quebrados. Mitigação: ordem rígida (líderes → convites → cupons → evento).
- Falha após UPDATE do evento e antes do COMMIT → ROLLBACK desfaz tudo.

### 7.5 Como validar (testes)

- Teste de integração completo: após migração, event.organizer_id = B; listagens por organizador mostram evento em B e não em A; validateCoupon e uso de convite funcionam para B.
- Teste de rollback: falha forçada após UPDATE evento → nenhuma alteração persistida (ROLLBACK).

### 7.6 Pode ser feito em produção com segurança?

**Não** isoladamente. Faz parte do fluxo transacional único; em produção o fluxo inteiro (3 → 4 → 5 → 7, e 8 pós-commit) é executado junto.

### 7.7 Depende de etapa anterior?

**Sim.** Todas as etapas 1–5 (e opcional 6). É o passo que “consolida” a migração na mesma transação.

---

## Etapa 8 — Validação pós-migração

### 8.1 Nome
**Validação pós-migração (evento, cupons, leaders, convites).**

### 8.2 Objetivo
Detectar inconsistências logo após o COMMIT: evento, cupons, líderes e **convites** devem estar corretos; em falha, registrar status inconsistent e validation_errors sem tentar rollback automático.

### 8.3 O que será implementado

- Executar **após** COMMIT da transação de migração (em nova conexão ou mesmo fluxo).
- Checagens obrigatórias (conforme plano técnico Etapa 5ter e IMPLEMENTACAO 0B etapa 9):
  1. event.organizer_id = B.
  2. Todos os cupons em coupon_events para o evento com coupons.organizer_id = B.
  3. Nenhum cupom de A vinculado ao evento (coupon_events + coupons.organizer_id = A para o evento → 0).
  4. Cupons com leader_id: líder em organizer_group_leaders para B.
  5. **Convites:** Todos os convites com status available/sent do evento com leader_id presente em organizer_group_leaders para B (query de órfãos: COUNT = 0); event_id correto; não vinculados a líder/cupom de A.
  6. (Opcional) Contagem de cupons/convites conforme esperado.
- Se qualquer checagem falhar: atualizar log com status = 'inconsistent' e validation_errors (ex.: "Convites inválidos após migração"); retornar erro ao cliente.

**Implementado:** Em `changeEventOrganizerService.ts`, após COMMIT e insertMigrationLog(success), chama-se `runPostMigrationValidation(eventId, organizerFrom, organizerTo)`. Se falhar, `updateMigrationLogValidationFailure(migrationId, errors)` atualiza o log e retorna status `inconsistent` com `validation_errors`. O controller retorna HTTP 409 e `validation_errors` no body. Checagens: (1) event.organizer_id = B, (2) cupons do evento com organizer_id = B, (3) nenhum cupom de A vinculado ao evento, (4) cupons com leader_id têm líder em organizer_group_leaders para B, (7) convites available/sent sem órfãos (leader_id em B).

### 8.4 Riscos envolvidos

- Falso positivo (validação falha com dados corretos) → revisar queries (LEFT JOIN organizer_group_leaders, etc.).
- Falso negativo (não detectar inconsistência) → incluir todas as checagens do plano técnico, em especial convites.

### 8.5 Como validar (testes)

- Teste: migração bem-sucedida → validação retorna sucesso; nenhum status inconsistent.
- Teste: após migração, alterar manualmente um cupom para organizer_id = A → rodar validação → deve falhar e registrar inconsistent + validation_errors.
- Teste específico de convites: convite available com leader_id não em B → validação deve falhar com mensagem sobre convites.

### 8.6 Pode ser feito em produção com segurança?

**Sim.** Validação é somente leitura (e escrita no log em caso de falha). Deve ser executada após toda migração real em produção.

### 8.7 Depende de etapa anterior?

**Sim.** Etapas 1–7 (estrutura de log, fluxo completo). A validação é a última etapa “automática” do fluxo de uma execução de migração.

---

## Etapa 9 — Auditoria e logs

### 9.1 Nome
**Auditoria e logs (migration_id, rastreabilidade).**

### 9.2 Objetivo
Registrar toda execução com migration_id e contadores, permitir rastreabilidade completa e suporte a dry_run e rollback.

### 9.3 O que será implementado

- Em **toda** execução (incluindo skipped e dry_run): gerar migration_id; incluir no retorno da API; persistir em event_organizer_migration_log com status, contadores (total_cupons_exclusivos, total_cupons_compartilhados, total_lideres_criados, total_lideres_reutilizados, total_invitations_updated, conflitos_codigo_resolvidos), dry_run, executed_at, executor_id, validation_errors (se inconsistent).
- Campos em leader_invitations (migrated_from_leader_id, migrated_at, migration_id) já preenchidos na Etapa 4.
- (Opcional) Snapshot pré-migração em event_organizer_migration_snapshot antes de escritas.

**Implementado:** Toda execução já gera migration_id e persiste em event_organizer_migration_log (status, contadores, dry_run, executed_at, executor_id, validation_errors quando inconsistent). Consulta ao log: `getMigrationLogById(migrationId)` e `getMigrationLogsByEventId(eventId)` no service; endpoints GET `/api/admin/events/:eventId/migration-log` (lista por evento) e GET `/api/admin/migration-log/:migrationId` (detalhe por id). Interface `MigrationLogEntry` exportada para tipagem.

### 9.4 Riscos envolvidos

- Log sem migration_id ou com dados incorretos → dificulta debug; garantir que migration_id seja sempre gerado e escrito no log.
- Volume de logs → índices em event_id e executed_at (já previstos no plano).

### 9.5 Como validar (testes)

- Teste: toda chamada (success, skipped, error, dry_run) retorna migration_id e grava registro no log com os campos esperados.
- Teste: consultar log por event_id ou migration_id e recuperar detalhes da execução.

### 9.6 Pode ser feito em produção com segurança?

**Sim.** Escrita apenas em tabelas de log/snapshot; não altera dados de negócio além do que já está nas etapas anteriores.

### 9.7 Depende de etapa anterior?

**Sim.** Etapa 1 (estrutura da tabela de log e campos de auditoria); Etapa 2 (service que gera migration_id e chama escrita no log). A “completude” da auditoria depende das etapas 3–8 (contadores e status).

---

## Etapa 10 — Rollback seguro

### 10.1 Nome
**Rollback seguro (estratégia e limites).**

### 10.2 Objetivo
Definir o que pode ou não ser revertido após o commit e como executar rollback lógico sem corromper dados (inscrições novas, cupons usados, etc.).

### 10.3 O que será implementado

- **Documentação (obrigatória):**
  - Rollback **dentro** da transação: qualquer falha antes do COMMIT → ROLLBACK; nenhuma escrita parcial.
  - Rollback **pós-commit:** apenas dentro de janela (ex.: 24–48h) e desde que não existam registrations com created_at > migration_executed_at para o evento. Se houver inscrições novas, negar rollback automático.
  - Passos do rollback lógico (conforme plano técnico Etapa 5sex): evento de volta para A; cupons exclusivos UPDATE organizer_id e leader_id para A; cupons duplicados (compartilhados): DELETE coupon_events e cupons de B, reinserir vínculo em A; **convites:** UPDATE leader_invitations SET leader_id = migrated_from_leader_id WHERE migration_id = $migration_id (e limpar migrated_*); líderes criados em B: política (desativar ou deixar).
  - Registrar em log um registro de tipo “rollback” referenciando a migração original.

- **Implementação (recomendada):** Endpoint ou script admin que executa o rollback lógico **somente** se pré-condições forem atendidas; caso contrário, retornar erro e orientar análise manual/backup.

**Implementado:** Migration 101 adiciona status `rollback` ao log. Service `executeRollbackMigration(migrationId, executorId)`: pré-condições (migração existe, status = success, sem inscrições novas após executed_at, janela 48h); em transação: reverter convites (leader_id = migrated_from_leader_id, limpar migrated_*); reverter cupons (exclusivos → UPDATE organizer_id para A; compartilhados → identificar por code com `_MIGRADO_`, reinserir vínculo em A, deletar cupom de B); reverter contact_messages e events para A; inserir registro de log com status `rollback` e validation_errors = `rollback_of:<migration_id>`. Endpoint POST `/api/admin/migration-rollback` com body `{ migration_id }`. Respostas: 200 (ok), 404 (não encontrado), 409 (inscrições novas, janela expirada ou migração não success).

### 10.4 Riscos envolvidos

- Rollback após novas inscrições/pagamentos → inconsistência (inscrições de B com cupons que voltaram para A). Mitigação: checar created_at das registrations antes de permitir rollback.
- Perda de migrated_from_leader_id se coluna não existir → usar tabela de auditoria (leader_invitation_migration_audit) para recuperar old_leader_id no rollback.

### 10.5 Como validar (testes)

- Teste: após migração, sem novas inscrições, executar rollback → evento volta para A; cupons e convites revertidos; validação pós-migração (ou checagem manual) confirma estado.
- Teste: após migração, criar 1 inscrição nova no evento → tentar rollback → deve ser negado com mensagem clara.

### 10.6 Pode ser feito em produção com segurança?

**Sim** como **documentação** e **script/endpoint condicional**. Executar rollback em produção apenas quando pré-condições forem atendidas e com backup/ventana de manutenção.

### 10.7 Depende de etapa anterior?

**Sim.** Etapas 1–9 (estrutura de banco, fluxo completo, logs com migration_id e contadores, convites com migrated_from_leader_id). Sem esses elementos, rollback não é rastreável nem seguro.

---

## Ordem sugerida de implementação (resumo)

1. **Fase 1 (banco e esqueleto):** Etapa 1 → Etapa 2 → Etapa 9 (logs desde o início).  
2. **Fase 2 (lógica de migração):** Etapa 3 → Etapa 4 → Etapa 5 (implementar em um único service transacional, na ordem líderes → convites → cupons).  
3. **Fase 3 (consolidação):** Etapa 7 (UPDATE evento) dentro do mesmo fluxo; Etapa 8 (validação pós-commit); Etapa 6 (opcional, se contact_messages for decidido).  
4. **Fase 4 (segurança):** Etapa 10 (documentação e script/endpoint de rollback).  

Cada fase deve ser testada em ambiente de staging (integração e, quando aplicável, carga) antes de habilitar execução real em produção.
