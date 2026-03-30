# Etapa 5 — Hardening multi-instância e coordenação distribuída (comandos assistidos)

## Objetivo

Reduzir a janela de corrida entre **consulta de idempotência**, **gravação de `started`** e **execução** dos comandos assistidos (`deliver_missing_assisted`, `reconcile_state`) quando há **várias instâncias** da API compartilhando o mesmo banco PostgreSQL.

Esta etapa **não** altera regra canônica, não altera `grantInvitationBonusSlotAtomic`, não transforma assistido em automático e mantém compatibilidade com as Etapas 4A e 4B.

## Estratégia de lock distribuído

### Redis

O projeto **não** inclui cliente Redis. A coordenação usa **bloqueio consultivo do PostgreSQL** (`pg_try_advisory_lock` com par de inteiros derivado por hash estável da chave lógica).

Se no futuro for introduzido Redis (`REDIS_URL`), o módulo `invitationBonusDistributedLockService` pode ganhar um backend alternativo mantendo o mesmo contrato externo (orquestrador).

### Chave lógica (escopo)

A chave legível persistida e logada segue:

- prefixo `inv_bonus_assisted`
- `command_type` (`deliver_missing_assisted` | `reconcile_state`)
- `event_id`
- `leader_id` (vazio se nulo)
- `commission_id` (vazio se nulo)
- `idempotency_key` (trim)

O par numérico do advisory lock é derivado por **SHA-256** da string acima (dois int32 big-endian), evitando colisões práticas para o escopo de comandos assistidos.

### Comportamento

1. **Leitura rápida (sem lock):** se o último registro de auditoria para a idempotência está `succeeded` ou `started`, retorna imediatamente (como na Etapa 4B), sem adquirir lock.
2. **Caminho com lock:** para novos comandos ou retentativa após `failed`, tenta-se `pg_try_advisory_lock`.
   - Se **não** adquirir: retorno `executed: false`, `detail: command_in_progress` (compatível com o contrato existente), com logs `lock_acquired: false`, `lock_status: not_acquired`.
   - Se adquirir: revalida idempotência **dentro** da seção crítica, insere `started` com `distributed_lock_key`, executa o serviço, libera o lock no `finally` do cliente dedicado.

### Limitações

- O lock é **no banco**: válido para todos os processos que falam com o **mesmo** PostgreSQL.
- **Não** substitui a fila in-process da Etapa 2 (`leader_id` + `event_id`) para gatilhos automáticos; esta etapa foca **somente assistidos**.
- Latência de rede ou **falha após `started` e antes de `finished_at`** ainda exige política operacional para linhas “presas” (ver abaixo).

## Escopo protegido

| Comando | Lock distribuído |
|--------|--------------------|
| `deliver_missing_assisted` | Sim |
| `reconcile_state` | Sim |
| Demais comandos de domínio | Não (inalterado) |

## Auditoria (migração 105)

- Coluna aditiva `distributed_lock_key` em `invitation_bonus_assisted_command_audit`, preenchida ao inserir `started` no caminho com lock.
- Índice parcial opcional para consultas por chave.

## Logs (`event=invitation_bonus_domain_command`)

Campos complementares (comandos assistidos):

- `lock_key` — string da chave lógica
- `lock_acquired` — `true` / `false` quando aplicável
- `lock_status` — `acquired` | `not_acquired` | `skipped_fast_path` | `n/a`

Comandos não assistidos continuam com `lock_status: n/a` e sem `lock_key`.

## Riscos mitigados

- Dupla inserção de `started` para a **mesma** idempotência entre duas instâncias (race entre SELECT e INSERT).
- Reexecução simultânea do mesmo trabalho assistido antes da conclusão da primeira.

## Riscos remanescentes

- **Banco indisponível:** falha ao adquirir lock ou ao inserir auditoria; tratamento de erro existente + logs `error`/`end`.
- **Lock mantido até o fim da callback:** operações longas bloqueiam outro processo com a mesma chave (comportamento desejado para serializar).
- **Advisory lock ≠ transação de negócio:** a execução de `runMissingInvitationDelivery` / `runInvitationBonusReconciliation` usa o pool global (`query()`); a serialização entre instâncias é garantida pelo **bloqueio consultivo na sessão dedicada**, não por mesma conexão das escritas de negócio.

## Política para comandos presos (`started` sem conclusão)

**Objetivo:** evitar bloqueio permanente sem reexecução indevida.

1. **Identificação:** linhas com `status = started` e `finished_at IS NULL` há tempo elevado; usar `created_at` / `updated_at` para triagem.
2. **Não automatizar recovery agressivo nesta etapa:** não há job que marque `failed` ou apague locks de aplicação (o advisory lock é liberado ao fechar a sessão; o registro `started` pode permanecer se o processo morrer após o INSERT).
3. **Operação segura (incremental):**
   - Repetir a operação com **nova** `idempotency_key` após análise (nova linha de auditoria).
   - Ou, com processo controlado, ajustar manualmente a linha de auditoria problemática (equipe autorizada), documentando o motivo fora do escopo deste arquivo.
4. **Futuro:** timeout operacional ou transição automática para `failed` apenas com critérios explícitos e aprovação de produto.

## Passos de rollout

1. Aplicar migração `105_assisted_audit_distributed_lock_key.sql` em produção **antes** ou junto ao deploy do backend que referencia a coluna.
2. Deploy da API (rolling é aceitável: instâncias antigas não usam a coluna; novas preenchem `distributed_lock_key`).
3. Monitorar logs JSON com `lock_status: not_acquired` e taxa de `command_in_progress` para o mesmo `idempotency_key`.
4. Opcional: correlacionar `distributed_lock_key` na tabela de auditoria com incidentes.

## Referências de código

- `backend/src/services/invitationBonusDistributedLockService.ts` — chave, `pg_try_advisory_lock`, liberação.
- `backend/src/services/invitationBonusDomainOrchestrator.ts` — integração apenas nos fluxos assistidos.
