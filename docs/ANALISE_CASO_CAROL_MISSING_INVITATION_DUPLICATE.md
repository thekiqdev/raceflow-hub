# Caso Carol — 409 Duplicate entry no apply `/admin/reconcile/missing-invitation-delivery`

## Payload de exemplo

- `event_id`, `leader_id` (ex.: Carol), `mode: apply`, hashes alinhados, `apply_confirmed: true`.

## O que já existia

Com alta probabilidade, **já existia** pelo menos uma linha em `leader_invitations` com `status = 'available'` para o **mesmo** `event_id` + `leader_id` (Carol), possivelmente vinculada a **outra** `commission_id` ou a um slot já criado manualmente / por outro fluxo.

O apply tentava criar **nova** `registration` (`free_bonus`) + **novo** `leader_invitations` com `status = 'available'`.

## Tabela / constraint que gerava o duplicate

- **Índice único parcial** criado na migração **100** (`100_event_organizer_migration_prep.sql`):

  `uq_leader_invitation_unique ON leader_invitations (event_id, leader_id, status) WHERE status IN ('available', 'sent')`

- Efeito: no máximo **um** convite `available` e **um** `sent` **por líder e por evento**, **sem** considerar `commission_id`.

- Isso **conflita** com o modelo de negócio de **múltiplos** bônus por comissão (vários slots `available` para o mesmo líder no mesmo evento).

- A unicidade correta por “lastro” continua sendo **`unique_bonus_registration`** em `leader_invitations(bonus_registration_id)` (um convite por inscrição bônus).

## O dry_run “superestima” faltantes?

- O **dry_run** usa `times_granted_db` e `expectedBonuses_canonical` **por comissão** e pode mostrar **N faltantes** para uma comissão B enquanto já existe um convite `available` para a comissão A (ou outro lastro) que **ocupa** o único slot permitido pelo índice legado.
- Nesse cenário, o **COUNT por comissão** pode dizer “falta criar”, mas o **INSERT** falha com **23505** no segundo `available` global — **não** é necessariamente erro de lógica do dry_run, e sim **incompatibilidade de schema** com o fluxo de múltiplos convites.

## O que muda após o ajuste de idempotência + migration 102

1. **Migration `102_drop_uq_leader_invitation_unique.sql`**: remove `uq_leader_invitation_unique`, permitindo vários convites `available` por (evento, líder), alinhado a múltiplas comissões / slots.
2. **Apply idempotente**: colisões `23505` em `leader_invitations` ou `registrations` são tratadas **dentro** do serviço (SAVEPOINT), com **log estruturado** e item em `skipped_existing` / `blocked` quando o índice legado ainda existir, **sem** resposta global 409 “Duplicate entry” por esse motivo.
3. **Relatório**: blocos `created`, `skipped_existing`, `blocked`, `failed` + `equivalencia_logica` documentando chaves lógicas (`unique_bonus_registration`, `confirmation_code`).

## Referência de código

- Serviço: `backend/src/services/missingInvitationDeliveryService.ts`
- Migração 100 (índice): `backend/migrations/100_event_organizer_migration_prep.sql`
- Migração 102 (drop): `backend/migrations/102_drop_uq_leader_invitation_unique.sql`
