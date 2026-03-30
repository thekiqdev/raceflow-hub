# Implementação segura — Migração de organizador de evento

**Objetivo:** Artefatos finais para implementar e executar a funcionalidade de migração de organizador em produção com segurança.

**Referência:** Plano técnico completo em `PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md` (não alterado por este documento).

---

## 0. Padrões de resposta e segurança (obrigatórios)

### 0.1 Status de resposta padronizado

Em **toda** execução (incluindo dry_run e idempotência), o retorno deve usar exatamente um dos status abaixo:

| status      | Significado |
|------------|-------------|
| `success`  | Migração executada com sucesso; validação pós-migração passou. |
| `error`    | Falha na execução (exceção, rollback, timeout). |
| `inconsistent` | Commit realizado mas validação pós-migração falhou. |
| `skipped`  | Nenhuma escrita realizada: idempotência (evento já pertence ao organizador) **ou** dry_run (simulação, sem escrita). Padrão único; frontend não precisa tratar exceção. |

Não usar `failed`; usar sempre `error`.

### 0.2 Retorno quando idempotente (já migrado)

Quando o evento **já** pertence ao organizador informado (B), retornar:

```json
{
  "status": "skipped",
  "message": "Evento já pertence ao organizador informado",
  "idempotent": true,
  "migration_id": "uuid-gerado-mesmo-assim",
  "event_id": "...",
  "organizer_to": "...",
  "executed_by": "user_id_do_admin"
}
```

- `migration_id` é gerado em **toda** execução (incluindo skipped), para rastreio e debug.

### 0.3 migration_id (obrigatório em toda execução)

- Em **toda** chamada ao endpoint de migração (com ou sem dry_run, com ou sem escrita):
  - Gerar um **UUID** como `migration_id`.
  - Incluir no **retorno** da API: `"migration_id": "uuid"`.
  - **Salvar no log** (`event_organizer_migration_log.migration_id` ou equivalente).
  - Usar em logs de aplicação e em suporte (ex.: "migração migration_id=xxx falhou").

### 0.4 Versionar a migração no log

- No registro de log, incluir sempre:
  - `migration_version = 'v1'` (ou valor configurado).
- Objetivo: evoluir o formato/regras no futuro sem ambiguidade (ex.: v2 com novas validações).

### 0.5 Regra crítica: leader_id nunca NULL quando cupom original tinha líder

- Se o cupom **original** (do organizador A) possuía `leader_id` preenchido, o cupom em B (transferido ou duplicado) **nunca** pode ficar com `leader_id` NULL.
- Sempre: **ou** reutilizar um líder já existente em B, **ou** criar um novo líder em B e referenciá-lo.
- **Validação pós-migração (obrigatória):** Se qualquer cupom em B vinculado ao evento tiver `leader_id` NULL e o cupom original correspondente tinha `leader_id` não nulo → considerar **inconsistência** e retornar/registrar `status = inconsistent` com detalhe em `validation_errors` (ex.: "Cupom X deveria ter leader_id preenchido").

### 0.6 Resumo no retorno do dry_run (UX)

- No retorno do dry_run, usar **status = `skipped`** (skipped lógico: sem escrita), mantendo o padrão único de status e evitando que o frontend trate dry_run como exceção.
- Incluir sempre um objeto **summary** simples:

```json
{
  "status": "skipped",
  "dry_run": true,
  "migration_id": "uuid",
  "executed_by": "user_id_do_admin",
  "summary": {
    "total_coupons": 10,
    "exclusivos": 6,
    "compartilhados": 4,
    "leaders_to_create": 2,
    "leaders_to_reuse": 3,
    "conflicts": 1,
    "estimated_operations": {
      "updates": 6,
      "inserts": 4,
      "deletes": 4
    }
  },
  "couponsToUpdate": [...],
  "couponsToDuplicate": [...],
  "leadersToCreate": [...],
  "leadersToReuse": [...],
  "conflicts": [...]
}
```

- **estimated_operations** ajuda na revisão de impacto antes da execução real (quantos UPDATEs, INSERTs e DELETEs serão executados).

### 0.7 Permissão obrigatória

- **Requer permissão:** `event.change_organizer`.
- Sem essa permissão, o endpoint deve retornar **403 Forbidden**.
- Não confiar apenas em role "admin"; checar explicitamente a permissão para reduzir risco de segurança.

### 0.8 Status do log (estado inicial e finais)

- **Ao iniciar** a execução (antes da transação de escrita): criar registro no log com **status = `"started"`** (e migration_id, migration_version, event_id, organizer_to, executor_id, timestamp).
- **Ao finalizar**, atualizar o mesmo registro para um dos status finais:
  - `success` — migração concluída e validação pós-migração passou.
  - `error` — falha durante a execução (rollback, exceção, timeout).
  - `inconsistent` — commit feito mas validação pós-migração falhou.
- Em caso de **skipped** (idempotência), pode-se gravar status `skipped` no log ou manter um registro com status final que indique "nenhuma escrita".

### 0.9 Auditoria: quem executou

- Incluir no **retorno** da API (em toda execução que grava log): **`executed_by`** = user_id do executor (admin que disparou a migração).
- Exemplo: `"executed_by": "uuid-do-admin"`. Facilita auditoria e rastreio sem depender só do log.

---

## 0A. Lock de concorrência (obrigatório)

**Objetivo:** Impedir migração concorrente do **mesmo** evento e garantir idempotência real em ambiente distribuído. Sem isso, o teste de concorrência pode passar em CI e quebrar em produção.

**Lock obrigatório por `event_id` durante a migração.** Utilizar **uma** das estratégias abaixo:

1. **SELECT ... FOR UPDATE no registro do evento**  
   No início da transação (após abrir BEGIN):  
   `SELECT id, organizer_id FROM events WHERE id = $event_id FOR UPDATE;`  
   Manter a transação aberta até COMMIT ou ROLLBACK. Uma segunda requisição para o mesmo evento ficará bloqueada até a primeira liberar.

2. **Advisory lock (PostgreSQL)**  
   Ex.: `pg_advisory_lock(hashtext($event_id::text))` (ou função que converta event_id em bigint para pg_advisory_xact_lock). Obter o lock no início da transação; liberado automaticamente no fim da transação. Garante exclusividade por evento mesmo sem lock na linha.

Implementação deve usar **uma** das duas; documentar qual foi escolhida. Timeout de lock (ex.: `SET lock_timeout = '30s'`) recomendado para evitar espera infinita.

---

## 0B. Ordem obrigatória das operações (dentro da transação)

Ordem **determinística** para evitar inconsistência parcial. Não inverter etapas.

1. **Lock do evento** — Adquirir lock (FOR UPDATE ou advisory) no registro do evento.
2. **Revalidar idempotência** — Verificar se `event.organizer_id` já é B; se sim, ROLLBACK e retornar status `skipped`, sem executar escritas.
2b. **Pré-validar compatibilidade do organizador B** — Antes de qualquer escrita: verificar se o organizador B **pode receber** esse evento (plano ativo?, limites de eventos?, permissões de conta?). Se não puder (ex.: plano expirado, limite de eventos atingido), ROLLBACK e retornar erro com mensagem clara (ex.: "Organizador B não pode receber o evento: limite atingido"). Evita migração que deixaria o evento em estado inválido para B.
3. **Carregar cupons + vínculos** — Listar cupons do evento (coupon_events para este event_id), classificar exclusivos vs compartilhados.
4. **Resolver líderes (mapa leader_id)** — Para cada leader_id distinto dos cupons **e** dos convites disponíveis do evento (leader_invitations com event_id e status IN ('available','sent')), verificar/criar equivalente em B; construir mapa old_leader_id → new_leader_id.
5. **Reassociar convites** — UPDATE leader_invitations SET leader_id = mapa[leader_id], migrated_from_leader_id = leader_id, migrated_at = NOW(), migration_id = $migration_id WHERE event_id = evento AND status IN ('available','sent') **AND (migration_id IS NULL)** (só atualizar quem ainda não foi migrado; evita duplicidade em retry). Não alterar convites used/expired (histórico).
5b. **Verificar convites órfãos (pré-commit)** — Antes de processar cupons, garantir que nenhum convite disponível ficou com leader_id inexistente em B: `SELECT COUNT(*) FROM leader_invitations li LEFT JOIN organizer_group_leaders ogl ON ogl.leader_id = li.leader_id AND ogl.organizer_id = $organizer_b_id WHERE li.event_id = $event_id AND li.status IN ('available','sent') AND ogl.leader_id IS NULL`. Se > 0 → ROLLBACK e retornar erro (não fazer commit). Evita convite "órfão" (líder falhou parcialmente).
6. **Processar cupons**  
   - Exclusivos → UPDATE coupons SET organizer_id = B, leader_id = mapa[...].  
   - Compartilhados → INSERT em coupons (para B), INSERT em coupon_events (novo cupom, event_id), DELETE em coupon_events (cupom original de A, event_id).
7. **Atualizar event.organizer_id** — UPDATE events SET organizer_id = B WHERE id = event_id.
8. **Commit** — Encerrar transação.
9. **Rodar validação pós-migração** — Em nova conexão ou após commit: executar checagens (event.organizer_id, cupons de B, leader_id não NULL quando aplicável; **convites** — ver abaixo). Se falhar, atualizar log para status `inconsistent`, adicionar em validation_errors (ex.: "Convites inválidos após migração") e retornar status `inconsistent`.

**Validação explícita de convites (obrigatória):** Verificar que **TODOS** os convites com status IN ('available','sent') do evento:
- possuem `leader_id` válido no organizador B (ex.: existe em organizer_group_leaders com organizer_id = B);
- estão vinculados ao `event_id` correto (evento migrado);
- **não** estão vinculados a líder/cupom do organizador A (leader_id não deve ser de líder só de A).

Query de órfãos (também na validação pós-commit): `SELECT COUNT(*) FROM leader_invitations li LEFT JOIN organizer_group_leaders ogl ON ogl.leader_id = li.leader_id AND ogl.organizer_id = $organizer_b_id WHERE li.event_id = $event_id AND li.status IN ('available','sent') AND ogl.leader_id IS NULL`. Esperado 0. Se > 0 → status = `inconsistent`, validation_errors += "Convites inválidos após migração" (ou "Convites órfãos: leader não vinculado a B").

---

## 0C. Regra quando status = inconsistent (pós-commit)

Quando a validação pós-migração falha, o commit **já foi realizado**. Não há rollback automático de transação.

**Ações obrigatórias:**

- **NÃO** tentar rollback automático (já houve commit; rollback de transação não desfaz).
- **Registrar** `validation_errors` no log (event_organizer_migration_log) com status `inconsistent`.
- **Acionar fluxo manual:**  
  - Investigar (consultar validation_errors, migration_id, event_id).  
  - **Ou** corrigir dados manualmente (ajustes pontuais em cupons/event/líderes).  
  - **Ou** executar rollback lógico (script reverso documentado no plano), se pré-condições forem atendidas (ex.: sem inscrições novas após a migração).

Documentar isso evita que alguém tente rollback impossível e agrave o estado.

---

## 0D. Banco de dados: unicidade e índices

### Unicidade de código (nível banco)

- **Garantir constraint:** `UNIQUE (organizer_id, code)` na tabela `coupons`.
- Sem isso, concorrência ou bug pode inserir dois cupons com mesmo (organizer_id, code) e quebrar regras de negócio e validação.
- Se já existir como UNIQUE, apenas validar; caso contrário, adicionar em migration.

### Unicidade de convites (evitar duplicidade pós-migração)

- **Garantir índice único** em `leader_invitations` para (event_id, leader_id, status) quando status for available/sent, evitando convite duplicado após reprocessamento ou bug em concorrência.

```sql
-- Evitar duplicidade de convite por líder + evento (apenas disponíveis/sent)
CREATE UNIQUE INDEX IF NOT EXISTS uq_leader_invitation_unique
ON leader_invitations (event_id, leader_id, status)
WHERE status IN ('available', 'sent');
```

- Se já existir constraint ou índice equivalente, apenas validar; caso contrário, adicionar em migration.

### Rastreabilidade de convites migrados (recomendado)

- Adicionar em `leader_invitations` (via migration) para debug e idempotência:
  - `migrated_from_leader_id` UUID NULL — leader_id anterior antes da reassociação.
  - `migrated_at` TIMESTAMPTZ NULL — data/hora da reassociação.
  - `migration_id` UUID NULL — id da execução (event_organizer_migration_log.id).

- Permite: rollback reverso por migration_id; evitar reprocessamento (WHERE migration_id IS NULL no UPDATE); auditoria.

### Índices recomendados (performance em evento grande)

Sem esses índices, migração em evento com muitos cupons/vínculos pode sofrer.

```sql
CREATE INDEX IF NOT EXISTS idx_coupon_events_event_id ON coupon_events(event_id);
CREATE INDEX IF NOT EXISTS idx_coupons_organizer_id ON coupons(organizer_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
```

- Ajustar nomes se já existirem no projeto (ex.: idx_coupons_organizer_id pode já estar em migrations). Objetivo: consultas por event_id (coupon_events), por organizer_id e por code (coupons) devem usar índice.

---

## 1. Testes automatizados

### 1.1 Testes de integração (obrigatório)

Usar banco real (ex.: PostgreSQL em Docker ou CI) ou banco em memória/mock compatível com as queries do plano. Cobrir os cenários abaixo.

**Estrutura sugerida (exemplo):**

```
backend/
  src/
    services/
      __tests__/
        changeEventOrganizerService.integration.test.ts
```

**Cenários obrigatórios:**

| # | Cenário | Descrição | Assertivas principais |
|---|---------|-----------|------------------------|
| 1 | Migração com cupons exclusivos | Evento com 1+ cupom ligado só a este evento (event_count=1). | Após migração: events.organizer_id = B; cupons têm organizer_id = B; coupon_events inalterado para o evento; validateCoupon(code, B, event_id) retorna válido. |
| 2 | Migração com cupons compartilhados | Evento com cupom ligado a este evento e a outro. | B tem novo cupom (INSERT) com current_uses=0, vinculado só ao evento; A tem cupom sem este evento em coupon_events; cupom de B funciona no evento. |
| 3 | Migração com leader_id | Cupom(s) com leader_id preenchido. | Líder equivalente existe em B (criado ou reutilizado); cupons de B têm leader_id apontando para líder em B; líder de A inalterado. |
| 4 | Conflito de código | B já possui cupom com mesmo code que um compartilhado do evento. | Cupom duplicado para B tem code com sufixo (ex. _MIGRADO); migração não falha; cupom com sufixo válido no evento. |
| 5 | Idempotência | Chamar migração duas vezes para o mesmo (event_id, B). | Segunda chamada retorna sucesso "já migrado" sem duplicar cupons/líderes; event.organizer_id continua B. |
| 6 | Concorrência simulada | Duas "threads" ou requests tentam migrar o mesmo evento ao mesmo tempo. | Uma completa com sucesso; a outra bloqueia até a primeira terminar e depois retorna "já migrado" (ou sucesso idempotente); não há duplicação de cupons/líderes. |
| 7 | Validação pós-migração | Após migração bem-sucedida, rodar etapa de verificação. | Todas as checagens passam (event.organizer_id, cupons de B, nenhum cupom de A no evento, leader_id válidos). Se alterar manualmente um dado (ex. organizer_id de um cupom), validação falha e registra inconsistência. |
| 8 | Dry run | Chamar migração com dry_run=true. | Nenhuma linha alterada em events, coupons, coupon_events, group_leaders; resposta contém listas de cupons a atualizar/duplicar, líderes a criar/reutilizar, conflitos de código. |

**Exemplo de esqueleto (integração):**

```typescript
// changeEventOrganizerService.integration.test.ts (exemplo)
describe('changeEventOrganizerService (integration)', () => {
  let eventId: string;
  let organizerA: string;
  let organizerB: string;

  beforeAll(async () => {
    // Setup: criar evento, organizador A e B, cupons, etc.
  });

  afterAll(async () => {
    // Cleanup
  });

  it('migrates event with exclusive coupons: event and coupons belong to B', async () => {
    const result = await changeEventOrganizer({ eventId, newOrganizerId: organizerB });
    expect(result.status).toBe('success');
    const event = await getEventById(eventId);
    expect(event.organizer_id).toBe(organizerB);
    const couponsForEvent = await getCouponsByEventId(eventId);
    expect(couponsForEvent.every(c => c.organizer_id === organizerB)).toBe(true);
  });

  it('when event already belongs to B, returns skipped and idempotent without duplicate coupons', async () => {
    await changeEventOrganizer({ eventId, newOrganizerId: organizerB });
    const countBefore = await countCouponsForOrganizer(organizerB, eventId);
    const result = await changeEventOrganizer({ eventId, newOrganizerId: organizerB });
    expect(result.status).toBe('skipped');
    expect(result.idempotent).toBe(true);
    expect(result.migration_id).toBeDefined();
    const countAfter = await countCouponsForOrganizer(organizerB, eventId);
    expect(countAfter).toBe(countBefore);
  });

  it('dry_run=true returns status skipped with summary without writing', async () => {
    const result = await changeEventOrganizer({ eventId, newOrganizerId: organizerB, dryRun: true });
    expect(result.status).toBe('skipped');
    expect(result.dry_run).toBe(true);
    expect(result.migration_id).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.total_coupons).toBeDefined();
    expect(result.summary.exclusivos).toBeDefined();
    expect(result.summary.compartilhados).toBeDefined();
    expect(result.summary.leaders_to_create).toBeDefined();
    expect(result.summary.leaders_to_reuse).toBeDefined();
    expect(result.summary.conflicts).toBeDefined();
    expect(result.summary.estimated_operations).toBeDefined();
    expect(result.summary.estimated_operations.updates).toBeDefined();
    expect(result.summary.estimated_operations.inserts).toBeDefined();
    expect(result.summary.estimated_operations.deletes).toBeDefined();
    const event = await getEventById(eventId);
    expect(event.organizer_id).toBe(organizerA);
    expect(result.couponsToUpdate).toBeDefined();
    expect(result.couponsToDuplicate).toBeDefined();
    expect(result.leadersToCreate).toBeDefined();
  });

  // it('concurrent migration same event: one succeeds, other idempotent')
  // it('post-migration validation passes after success and fails when data tampered')
});
```

---

### 1.2 Testes unitários

Funções isoladas (sem banco, ou com mocks mínimos). Cobrir regras puras e builders.

| # | Função / módulo | Descrição | Exemplo de assertivas |
|---|------------------|-----------|------------------------|
| 1 | Classificação de cupons (exclusivo vs compartilhado) | Dado lista de cupons com `event_count` por id, classificar em exclusivos (count=1) e compartilhados (count>1). | Para event_count=1 → exclusivo; event_count=2 → compartilhado; cupons sem vínculo ao evento não entram. |
| 2 | Geração de código com sufixo | Dado `code` e lista de codes já existentes em B, retornar code único (original ou com sufixo). | Se code não existe em B → retorna code; se existe → retorna code + sufixo (ex. _MIGRADO ou _EV{id}); sufixo não colide com códigos existentes. |
| 3 | Matching de líderes (email/telefone) | Dado líder original (email, phone) e lista de líderes de B, retornar id do equivalente ou null. | Match por email (case-insensitive, trim); se não achar, por telefone; se múltiplos com mesmo email, retorna o primeiro (ex. mais antigo). |
| 4 | Geração de mapa leader_id | Dado lista de cupons com leader_id e função que resolve líder original → líder em B (criar ou reutilizar), retornar mapa old_id → new_id. | Cada leader_id distinto dos cupons aparece uma vez no mapa; múltiplos cupons com mesmo leader_id recebem o mesmo new_id. |

**Exemplo de esqueleto (unitário):**

```typescript
// changeEventOrganizerService.unit.test.ts (exemplo)
describe('classifyCouponsByScope', () => {
  it('classifies exclusive (event_count=1) and shared (event_count>1)', () => {
    const coupons = [
      { id: 'c1', event_count: 1 },
      { id: 'c2', event_count: 2 },
    ];
    const { exclusive, shared } = classifyCouponsByScope(coupons);
    expect(exclusive.map(c => c.id)).toEqual(['c1']);
    expect(shared.map(c => c.id)).toEqual(['c2']);
  });
});

describe('resolveCouponCodeForOrganizer', () => {
  it('returns original code when B has no coupon with same code', () => {
    expect(resolveCouponCodeForOrganizer('PROMO10', [])).toBe('PROMO10');
  });
  it('returns code with suffix when B already has code', () => {
    const result = resolveCouponCodeForOrganizer('PROMO10', ['PROMO10']);
    expect(result).not.toBe('PROMO10');
    expect(result).toMatch(/^PROMO10_/);
  });
});

describe('findEquivalentLeaderInOrganizer', () => {
  it('matches by email case-insensitive', () => {
    const leadersB = [{ id: 'lb1', email: 'Leader@Mail.com' }];
    expect(findEquivalentLeaderInOrganizer({ email: ' leader@mail.com ', phone: null }, leadersB)).toBe('lb1');
  });
  it('returns null when no match', () => {
    expect(findEquivalentLeaderInOrganizer({ email: 'x@y.com', phone: null }, [])).toBeNull();
  });
});

describe('buildLeaderIdMap', () => {
  it('maps each distinct original leader_id to one new_id', () => {
    const coupons = [{ leader_id: 'L1' }, { leader_id: 'L1' }, { leader_id: 'L2' }];
    const resolve = (id: string) => ({ L1: 'LB1', L2: 'LB2' }[id]!);
    const map = buildLeaderIdMap(coupons, resolve);
    expect(map.get('L1')).toBe('LB1');
    expect(map.get('L2')).toBe('LB2');
  });
});
```

---

## 2. Script de execução segura (produção)

### 2.1 Exigências de segurança

- **Confirmação explícita:** A execução real (sem dry_run) só prossegue se o cliente enviar confirmação explícita, ex.: body `{ "confirm": "CONFIRMAR MIGRAÇÃO" }` ou query `?confirm=CONFIRMAR_MIGRACAO`. Qualquer outro valor ou ausência → 400 com mensagem "Confirmação obrigatória para executar migração em produção".
- **Permissão:** Exigir permissão `event.change_organizer`. Sem ela → 403 Forbidden.
- **Log de início:** Antes de abrir transação, registrar em `event_organizer_migration_log` com **status = `started`** (migration_id, migration_version = 'v1', event_id, organizer_to, executor_id, timestamp). Em caso de falha antes do commit, atualizar para **status = `error`**.
- **Dry_run prévio (opcional):** Política configurável: "exigir que o mesmo (event_id, organizer_to) tenha sido executado em dry_run nas últimas X horas" antes de aceitar a execução real. Se habilitado, verificar em log; se não houver dry_run recente → 400 "Execute dry_run antes da migração real".
- **Timeout de segurança:** Definir timeout máximo da requisição ou da transação (ex.: 120s). Ao estourar, fazer ROLLBACK, atualizar log para status `error` e retornar 503 "Migração excedeu tempo limite".
- **Retorno detalhado ao final:** Resposta 200 com payload contendo: **migration_id** (UUID gerado em toda execução), **executed_by** (user_id do admin), status (`success` | `error` | `inconsistent` | `skipped`), event_id, organizer_from, organizer_to, totais (cupons exclusivos, compartilhados, líderes criados, reutilizados, conflitos de código), id do registro em `event_organizer_migration_log`. Se status = `inconsistent`, incluir validation_errors. Se status = `skipped`, incluir message e idempotent: true quando aplicável.

### 2.2 Fluxo ideal de execução

1. **Rodar dry_run**  
   `POST /api/admin/events/:eventId/change-organizer` com `dry_run: true` e `new_organizer_id: <B>`. Revisar no retorno: cupons a atualizar/duplicar, líderes a criar/reutilizar, conflitos de código.

2. **Revisar resultado do dry_run**  
   Conferir totais e listas; validar que evento e organizador destino estão corretos; anotar número esperado de cupons/líderes.

3. **Executar migração real**  
   Mesmo endpoint com `dry_run: false` e `confirm: "CONFIRMAR MIGRAÇÃO"` (ou valor configurado). Servidor aplica lock, transação, escritas, commit, validação pós-migração e preenchimento do log.

4. **Validar resultado**  
   Checar retorno (status, totais); opcionalmente na UI: evento aparece no organizador B, cupons funcionam (validateCoupon), organizador A não acessa mais o evento.

---

## 3. Checklist operacional

Checklist para o administrador executar antes, durante e depois da migração.

### Antes da migração

- [ ] **Evento correto?** Confirmar nome e ID do evento a ser migrado (ex.: tela de detalhe ou lista).
- [ ] **Organizador destino correto?** Confirmar nome e ID do organizador B (novo dono).
- [ ] **Dry_run executado?** Rodar migração com `dry_run=true` e obter plano.
- [ ] **Dry_run validado?** Revisar listas: cupons a atualizar (exclusivos), a duplicar (compartilhados), líderes a criar/reutilizar, conflitos de código. Conferir se os totais e nomes fazem sentido.
- [ ] **Número de cupons esperado?** Anotar totais do dry_run (ex.: X exclusivos, Y compartilhados) para comparar após a migração real.
- [ ] **Backup/snapshot (recomendado):** Em produção, garantir backup ou snapshot da base antes da execução real.

### Durante a execução

- [ ] **Log de início registrado?** Verificar (no retorno ou em log) que a migração foi iniciada (event_id, executor, timestamp).
- [ ] **Sem erro na execução?** A requisição deve retornar 200 com status `success` (ou 200 com status `skipped` se idempotente). Em caso de 4xx/5xx ou status `error`/`inconsistent`, não considerar migração concluída; analisar mensagem e log (usar migration_id para rastrear).
- [ ] **Tempo dentro do esperado?** Se houver timeout (ex.: 503), investigar e reexecutar apenas se seguro (idempotência).

### Depois da migração

- [ ] **Validação automática passou?** No retorno, não deve haver status 'inconsistent' nem validation_errors. Se houver, tratar como falha e seguir procedimento de análise/rollback.
- [ ] **Cupons funcionando?** Testar no fluxo de inscrição (ou endpoint de validação) um cupom que era exclusivo e um que era compartilhado; ambos devem ser aceitos para o evento com organizador B.
- [ ] **Evento aparece no organizador B?** Login como B: listar eventos e confirmar que o evento migrado está na lista.
- [ ] **Organizador A não acessa mais?** Login como A: o evento não deve aparecer na lista de eventos do organizador; acesso direto ao evento deve retornar 403 (ou equivalente).
- [ ] **Registro no log de migração:** Confirmar em `event_organizer_migration_log` que existe registro com status `success`, migration_id, migration_version, executed_at e contadores corretos.

---

## 4. Monitoramento pós-produção

### 4.1 Métricas a observar

- **Migrações executadas:** Contagem por dia/semana de registros em `event_organizer_migration_log` com status 'success'. Alertar se houver queda abrupta se migrações forem frequentes, ou pico anormal.
- **Taxa de falha de migração:** Proporção de status `error` ou `inconsistent` em relação ao total de execuções (ex.: últimas 24h). Alertar se taxa > 0 (investigar causa).
- **Validação de cupom (validateCoupon):** Contagem de chamadas que retornam "Cupom não encontrado" ou "não válido para este evento" para eventos que passaram por migração recente (ex.: últimos 7 dias). Aumento pode indicar cupom quebrado pós-migração.
- **Erros 4xx/5xx em endpoints de inscrição ou cupom:** Aumento em rotas que usam validateCoupon ou que listam cupons por organizador, após migrações; correlacionar com event_id migrado.
- **Inconsistência de dados:** Job ou query periódica que replica as checagens da Etapa 5ter (event.organizer_id, cupons do evento pertencentes a B, coupon_events, leader_id válidos) para eventos com migração recente; contar falhas e alertar se > 0.

### 4.2 Detecção de erro silencioso

- **Falha em validateCoupon:** Logar event_id e organizer_id quando validateCoupon retornar inválido; cruzar com eventos migrados nas últimas 24–48h. Se houver match, notificar para verificar se o cupom foi migrado corretamente.
- **Aumento de erro 400/500:** Dashboard ou alerta por rota (ex.: POST inscrição, POST validate coupon); filtrar por período pós-deploy ou pós-migração; investigar mensagens de erro relacionadas a "cupom" ou "evento".
- **Inconsistência de dados:** Executar semanalmente (ou após cada migração) as queries de validação pós-migração para todos os eventos que tenham registro em `event_organizer_migration_log` com status 'success' e executed_at nas últimas N horas. Se alguma falhar, criar ticket e notificar equipe.
- **Log de migração com status 'inconsistent':** Alertar imediatamente quando um registro for gravado com status 'inconsistent' (e-mail ou canal de operações); incluir event_id, organizer_to e validation_errors no alerta.

### 4.3 Ações recomendadas

- Integrar contadores de migração (success, error, inconsistent, skipped) ao sistema de métricas (ex.: Prometheus/Grafana ou equivalente).
- Manter painel com: últimas migrações (event_id, organizer_to, status, executed_at) e totais de cupons/líderes.
- Documentar runbook: "Migração com status inconsistent" (consultar validation_errors, verificar dados manualmente, decidir rollback ou correção pontual).

---

## 3b. Snapshot pré-migração (opcional — nível enterprise)

Salvar estado completo **antes** da mudança permite rollback real e auditoria profunda.

**Tabela sugerida:**

```sql
CREATE TABLE event_organizer_migration_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id),
  organizer_id UUID NOT NULL REFERENCES profiles(id),
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- **payload_json:** estado relevante antes da migração (ex.: evento (id, organizer_id, name), lista de cupons do evento com ids/codes, lista de leader_invitations do evento com ids/leader_id, contadores). Serializar após lock e leituras, antes de qualquer UPDATE/INSERT.
- **Uso:** rollback real (reaplicar payload em caso de falha); auditoria (comparar antes/depois); suporte (debug com migration_id).
- Implementação opcional; recomendado para ambientes com requisito forte de rastreabilidade ou rollback garantido.

---

**Fim do documento.** Plano técnico em `PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md` permanece inalterado.
