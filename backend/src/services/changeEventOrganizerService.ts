/**
 * Service: alteração de organizador de evento (migração)
 * Etapa 2: estrutura base — validações, idempotência, lock. Sem migração real de cupons/convites/evento.
 * Ref: PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md, IMPLEMENTACAO_SEGURA_MIGRACAO_ORGANIZADOR.md
 */

import { getClient, query } from '../config/database.js';
import { hasRole } from './userRolesService.js';

const LOCK_TIMEOUT_MS = 30000; // 30s

export type MigrationStatus = 'success' | 'error' | 'inconsistent' | 'skipped' | 'rollback';

export interface ChangeEventOrganizerOptions {
  dry_run?: boolean;
  executor_id: string; // profile id do admin (req.user.id = profile.id)
}

export interface ChangeEventOrganizerResult {
  status: MigrationStatus;
  migration_id: string;
  event_id: string;
  organizer_from?: string;
  organizer_to: string;
  executed_by: string;
  message?: string;
  idempotent?: boolean;
  dry_run?: boolean;
  summary?: DryRunSummary;
  /** Preenchido quando a resolução de líderes (Etapa 3) é executada (antes do rollback). */
  leaders_resolved?: { total: number; added_to_b: number; reused_in_b: number; mapped_to_existing?: number };
  /** Número de convites reassociados (Etapa 4). */
  invitations_updated?: number;
  /** Contadores da migração de cupons (Etapa 5). */
  coupons_migrated?: {
    exclusives: number;
    shared: number;
    code_conflicts: number;
    code_conflicts_detail?: CodeConflictResolved[];
  };
  /** Etapa 6 (opcional): mensagens de contato do evento reassociadas ao organizador B. */
  contact_messages_updated?: number;
  /** Etapa 8: preenchido quando validação pós-migração falha (status = inconsistent). */
  validation_errors?: string[];
  /** Debug estruturado (temporário) apenas em dry_run para auditoria. */
  debug?: MigrationDryRunDebug;
}

export interface DryRunSummary {
  total_coupons?: number;
  exclusivos?: number;
  compartilhados?: number;
  leaders_to_create?: number;
  leaders_to_reuse?: number;
  leaders_mapped_to_existing?: number;
  /** Total que passarão a aparecer na lista de B (create + mapped, pois ambos são vinculados). */
  leaders_to_link?: number;
  /** Conflitos de código (cupons compartilhados cujo code já existe em B) que seriam resolvidos. */
  conflitos_codigo_resolvidos?: number;
  invitations_to_update?: number;
}

/** Debug estruturado (temporário) para auditoria do dry_run. */
export interface MigrationDryRunDebug {
  leaders_by_source: {
    coupon: LeadersBySourceItem[];
    invitation: LeadersBySourceItem[];
    leader_event_commission: LeadersBySourceItem[];
  };
  leaders_deduplicated: LeadersDeduplicated;
  leaders_classification: LeaderClassificationItem[];
  leaders_to_create: number;
  leaders_to_reuse: number;
  leaders_mapped_to_existing: number;
  leaders_to_link: number;
  coupons_to_update: CouponUpdateDebugItem[];
  coupons_to_duplicate: CouponDuplicateDebugItem[];
  invitations_to_update: InvitationUpdateDebugItem[];
}

export interface LeadersBySourceItem {
  leader_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: 'coupon' | 'invitation' | 'leader_event_commission';
  coupon_id?: string;
  code?: string;
  invitation_id?: string;
  invitation_status?: string;
  lec_id?: string;
  bonus_type?: string;
}

export interface LeadersDeduplicated {
  final_leader_ids: string[];
  removed_duplications: { leader_id: string; sources: string[] }[];
}

export interface LeaderClassificationItem {
  leader_id: string;
  full_name: string | null;
  already_in_b: boolean;
  match_by_email: boolean;
  match_by_phone: boolean;
  will_link_to_b: boolean;
  action: 'reused' | 'mapped' | 'create' | 'ignored';
  reason: string;
}

export interface CouponUpdateDebugItem {
  coupon_id: string;
  code: string;
  leader_id: string | null;
  leader_name: string | null;
  organizer_from: string;
  organizer_to: string;
  action: 'update';
}

export interface CouponDuplicateDebugItem {
  coupon_id_original: string;
  code_original: string;
  code_final: string;
  leader_id_original: string | null;
  leader_id_final: string | null;
  leader_name: string | null;
  organizer_from: string;
  organizer_to: string;
  action: 'duplicate';
}

export interface InvitationUpdateDebugItem {
  invitation_id: string;
  leader_id_old: string;
  leader_id_new: string;
  status: string;
  action: string;
}

/** Mapa old_leader_id (organizador A) → new_leader_id (organizador B) para uso em convites e cupons */
export type LeaderIdMap = Map<string, string>;

export interface ResolveLeadersResult {
  map: LeaderIdMap;
  /** Líderes que passam a aparecer na lista de B (INSERT em organizer_group_leaders). */
  leaders_added_to_b: number;
  /** Líderes do evento que já estavam na lista de B (organizer_group_leaders). Igual à regra da UI "Líderes de Grupo". */
  leaders_reused_in_b: number;
  /** Líderes do evento mapeados por email/telefone para um líder já na lista de B (não adiciona vínculo novo). */
  leaders_mapped_to_existing: number;
}

/**
 * Validações iniciais (fora da transação): evento existe, B existe e é organizador.
 * Opcional: compatibilidade do organizador B (plano ativo, limites) — TODO se houver modelo.
 */
async function validateInput(
  eventId: string,
  newOrganizerId: string,
  executorId: string
): Promise<{ ok: true } | { ok: false; status: MigrationStatus; message: string }> {
  const client = await getClient();
  try {
    const eventResult = await client.query(
      'SELECT id, organizer_id FROM events WHERE id = $1',
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      return { ok: false, status: 'error', message: 'Evento não encontrado' };
    }

    const newOrgHasRole = await hasRole(newOrganizerId, 'organizer');
    if (!newOrgHasRole) {
      return {
        ok: false,
        status: 'error',
        message: 'Novo organizador não possui role de organizador',
      };
    }

    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE id = $1',
      [newOrganizerId]
    );
    if (profileResult.rows.length === 0) {
      return { ok: false, status: 'error', message: 'Novo organizador (perfil) não encontrado' };
    }

    // TODO: compatibilidade do organizador B (plano ativo, limites de eventos, permissões)
    return { ok: true };
  } finally {
    client.release();
  }
}

/**
 * Executa a “migração” apenas no sentido da Etapa 2: lock, idempotência, geração de migration_id.
 * Não altera evento, cupons, convites ou líderes; em dry_run retorna um resumo simulado.
 */
export async function executeChangeEventOrganizer(
  eventId: string,
  newOrganizerId: string,
  options: ChangeEventOrganizerOptions
): Promise<ChangeEventOrganizerResult> {
  const { dry_run = false, executor_id: executorId } = options;
  const migrationId = crypto.randomUUID();

  const validation = await validateInput(eventId, newOrganizerId, executorId);
  if (!validation.ok) {
    const eventRow = await query('SELECT id, organizer_id FROM events WHERE id = $1', [eventId]).then((r) => r.rows[0]);
    if (eventRow) {
      await insertMigrationLog({
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: eventRow.organizer_id as string,
        organizer_to: newOrganizerId,
        status: validation.status,
        dry_run: false,
        executor_id: executorId,
      });
    }
    return {
      status: validation.status,
      migration_id: migrationId,
      event_id: eventId,
      organizer_to: newOrganizerId,
      executed_by: executorId,
      message: validation.message,
    };
  }

  const client = await getClient();
  try {
    await client.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
    await client.query('BEGIN');

    const lockResult = await client.query(
      'SELECT id, organizer_id FROM events WHERE id = $1 FOR UPDATE',
      [eventId]
    );
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        status: 'error',
        migration_id: migrationId,
        event_id: eventId,
        organizer_to: newOrganizerId,
        executed_by: executorId,
        message: 'Evento não encontrado',
      };
    }

    const currentOrganizerId = lockResult.rows[0].organizer_id as string;

    if (currentOrganizerId === newOrganizerId) {
      await client.query('ROLLBACK');
      await insertMigrationLog({
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        status: 'skipped',
        dry_run: false,
        executor_id: executorId,
      });
      return {
        status: 'skipped',
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        executed_by: executorId,
        message: 'Evento já pertence ao organizador informado',
        idempotent: true,
      };
    }

    if (dry_run) {
      const [summary, leadersResult] = await Promise.all([
        buildDryRunSummary(client, eventId, currentOrganizerId, newOrganizerId),
        resolveLeadersForMigration(client, eventId, currentOrganizerId, newOrganizerId, true),
      ]);
      summary.leaders_to_create = leadersResult.leaders_added_to_b;
      summary.leaders_to_reuse = leadersResult.leaders_reused_in_b;
      summary.leaders_mapped_to_existing = leadersResult.leaders_mapped_to_existing;
      summary.leaders_to_link =
        leadersResult.leaders_added_to_b + (leadersResult.leaders_mapped_to_existing ?? 0);
      const debug = await buildDryRunDebug(
        client,
        eventId,
        currentOrganizerId,
        newOrganizerId,
        leadersResult.map,
        {
          leaders_to_create: leadersResult.leaders_added_to_b,
          leaders_to_reuse: leadersResult.leaders_reused_in_b,
          leaders_mapped_to_existing: leadersResult.leaders_mapped_to_existing,
        }
      );
      await client.query('ROLLBACK');
      await insertMigrationLog({
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        status: 'skipped',
        dry_run: true,
        executor_id: executorId,
      });
      if (process.env.NODE_ENV !== 'production') {
        const bySource = debug.leaders_by_source;
        console.log('[migration dry_run debug]', JSON.stringify({
          leaders_by_source: {
            coupon_count: bySource.coupon.length,
            invitation_count: bySource.invitation.length,
            leader_event_commission_count: bySource.leader_event_commission.length,
          },
          leaders_deduplicated_count: debug.leaders_deduplicated.final_leader_ids.length,
          leaders_classification_count: debug.leaders_classification.length,
          leaders_to_link: debug.leaders_to_link,
          removed_duplications: debug.leaders_deduplicated.removed_duplications,
          conflitos_codigo_resolvidos: summary.conflitos_codigo_resolvidos ?? 0,
        }, null, 2));
      }
      return {
        status: 'skipped',
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        executed_by: executorId,
        dry_run: true,
        summary,
        debug,
      };
    }

    // Etapa 3: resolver líderes (mapa old → new em B)
    const leadersResult = await resolveLeadersForMigration(
      client,
      eventId,
      currentOrganizerId,
      newOrganizerId,
      false
    );

    // Etapa 4: reassociar convites (available/sent) ao líder em B
    const invitationsUpdated = await migrateInvitations(
      client,
      eventId,
      migrationId,
      leadersResult.map,
      newOrganizerId
    );

    const orphanCount = await countOrphanInvitations(client, eventId, newOrganizerId);
    if (orphanCount > 0) {
      await client.query('ROLLBACK');
      await insertMigrationLog({
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        status: 'error',
        dry_run: false,
        executor_id: executorId,
      });
      return {
        status: 'error',
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        executed_by: executorId,
        message: `Convites órfãos detectados (${orphanCount}): leader_id não vinculado ao organizador B. Transação revertida.`,
      };
    }

    // Etapa 5: migração de cupons (exclusivos + compartilhados)
    const couponsResult = await migrateCoupons(
      client,
      eventId,
      currentOrganizerId,
      newOrganizerId,
      leadersResult.map
    );

    // Etapa 7: atualizar organizador do evento (consolida a migração; só após líderes, convites e cupons)
    await client.query(
      `UPDATE events SET organizer_id = $1, updated_at = NOW() WHERE id = $2`,
      [newOrganizerId, eventId]
    );

    // Etapa 6 (opcional): migração de histórico — contact_messages do evento para B (para aparecer no painel de B)
    const contactMessagesUpdated = await migrateContactMessages(
      client,
      eventId,
      currentOrganizerId,
      newOrganizerId
    );

    await client.query('COMMIT');

    const executedAt = new Date();
    await insertMigrationLog({
      migration_id: migrationId,
      event_id: eventId,
      organizer_from: currentOrganizerId,
      organizer_to: newOrganizerId,
      status: 'success',
      dry_run: false,
      executor_id: executorId,
      executed_at: executedAt,
      total_cupons_exclusivos: couponsResult.exclusives_updated,
      total_cupons_compartilhados: couponsResult.shared_created,
      total_lideres_criados: leadersResult.leaders_added_to_b,
      total_lideres_reutilizados: leadersResult.leaders_reused_in_b,
      total_invitations_updated: invitationsUpdated,
      conflitos_codigo_resolvidos: couponsResult.code_conflicts_resolved,
    });

    // Etapa 8: validação pós-migração (após COMMIT; só leitura + possível UPDATE no log)
    const validation = await runPostMigrationValidation(
      eventId,
      currentOrganizerId,
      newOrganizerId
    );
    if (!validation.ok) {
      await updateMigrationLogValidationFailure(migrationId, validation.errors);
      return {
        status: 'inconsistent',
        migration_id: migrationId,
        event_id: eventId,
        organizer_from: currentOrganizerId,
        organizer_to: newOrganizerId,
        executed_by: executorId,
        message:
          'Migração concluída mas verificação pós-migração falhou. Consulte validation_errors.',
        validation_errors: validation.errors,
        leaders_resolved: {
          total: leadersResult.map.size,
          added_to_b: leadersResult.leaders_added_to_b,
          reused_in_b: leadersResult.leaders_reused_in_b,
          mapped_to_existing: leadersResult.leaders_mapped_to_existing,
        },
        invitations_updated: invitationsUpdated,
        coupons_migrated: {
          exclusives: couponsResult.exclusives_updated,
          shared: couponsResult.shared_created,
          code_conflicts: couponsResult.code_conflicts_resolved,
          code_conflicts_detail: couponsResult.code_conflicts_detail,
        },
        contact_messages_updated: contactMessagesUpdated,
      };
    }

    return {
      status: 'success',
      migration_id: migrationId,
      event_id: eventId,
      organizer_from: currentOrganizerId,
      organizer_to: newOrganizerId,
      executed_by: executorId,
      message: 'Migração concluída com sucesso.',
      leaders_resolved: {
        total: leadersResult.map.size,
        added_to_b: leadersResult.leaders_added_to_b,
        reused_in_b: leadersResult.leaders_reused_in_b,
        mapped_to_existing: leadersResult.leaders_mapped_to_existing,
      },
      invitations_updated: invitationsUpdated,
      coupons_migrated: {
        exclusives: couponsResult.exclusives_updated,
        shared: couponsResult.shared_created,
        code_conflicts: couponsResult.code_conflicts_resolved,
        code_conflicts_detail: couponsResult.code_conflicts_detail,
      },
      contact_messages_updated: contactMessagesUpdated,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

interface LogInsertParams {
  migration_id: string;
  event_id: string;
  organizer_from: string;
  organizer_to: string;
  status: MigrationStatus;
  dry_run: boolean;
  executor_id: string;
  executed_at?: Date | null;
  total_cupons_exclusivos?: number;
  total_cupons_compartilhados?: number;
  total_lideres_criados?: number;
  total_lideres_reutilizados?: number;
  total_invitations_updated?: number;
  conflitos_codigo_resolvidos?: number;
  validation_errors?: string | null;
}

async function insertMigrationLog(params: LogInsertParams): Promise<void> {
  await query(
    `INSERT INTO event_organizer_migration_log (
      id, event_id, organizer_from, organizer_to,
      total_cupons_exclusivos, total_cupons_compartilhados, total_lideres_criados, total_lideres_reutilizados,
      total_invitations_updated, conflitos_codigo_resolvidos,
      status, dry_run, executor_id, executed_at, validation_errors
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      params.migration_id,
      params.event_id,
      params.organizer_from,
      params.organizer_to,
      params.total_cupons_exclusivos ?? 0,
      params.total_cupons_compartilhados ?? 0,
      params.total_lideres_criados ?? 0,
      params.total_lideres_reutilizados ?? 0,
      params.total_invitations_updated ?? 0,
      params.conflitos_codigo_resolvidos ?? 0,
      params.status,
      params.dry_run,
      params.executor_id,
      params.executed_at ?? null,
      params.validation_errors ?? null,
    ]
  );
}

/** Atualiza o registro de log para status inconsistent e grava os erros de validação (Etapa 8). */
async function updateMigrationLogValidationFailure(
  migrationId: string,
  validationErrors: string[]
): Promise<void> {
  const errorsText = validationErrors.join('; ');
  await query(
    `UPDATE event_organizer_migration_log SET status = 'inconsistent', validation_errors = $1 WHERE id = $2`,
    [errorsText, migrationId]
  );
}

/**
 * Validação pós-migração (Etapa 8): executa após COMMIT para detectar inconsistências.
 * Usa conexão separada (query()). Retorna ok: true ou ok: false com lista de erros.
 */
async function runPostMigrationValidation(
  eventId: string,
  organizerFrom: string,
  organizerTo: string
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const errors: string[] = [];

  // 1. event.organizer_id = B
  const eventRow = await query(
    'SELECT organizer_id FROM events WHERE id = $1',
    [eventId]
  ).then((r) => r.rows[0] as { organizer_id: string } | undefined);
  if (!eventRow || eventRow.organizer_id !== organizerTo) {
    errors.push('event.organizer_id não é o organizador B');
  }

  // 2. Todos os cupons em coupon_events para o evento têm coupons.organizer_id = B
  const couponNotB = await query(
    `SELECT COUNT(*)::int AS cnt FROM coupon_events ce
     INNER JOIN coupons c ON c.id = ce.coupon_id
     WHERE ce.event_id = $1 AND c.organizer_id != $2`,
    [eventId, organizerTo]
  ).then((r) => (r.rows[0] as { cnt: number })?.cnt ?? 0);
  if (couponNotB > 0) {
    errors.push(`Existem ${couponNotB} cupom(ns) do evento com organizer_id diferente de B`);
  }

  // 3. Nenhum cupom de A vinculado ao evento (coupon_events + coupons.organizer_id = A)
  const couponFromA = await query(
    `SELECT COUNT(*)::int AS cnt FROM coupon_events ce
     INNER JOIN coupons c ON c.id = ce.coupon_id
     WHERE ce.event_id = $1 AND c.organizer_id = $2`,
    [eventId, organizerFrom]
  ).then((r) => (r.rows[0] as { cnt: number })?.cnt ?? 0);
  if (couponFromA > 0) {
    errors.push(`Ainda existem ${couponFromA} vínculo(s) de cupom do organizador A com o evento`);
  }

  // 4. Cupons com leader_id: líder deve estar em organizer_group_leaders para B
  const invalidLeader = await query(
    `SELECT COUNT(*)::int AS cnt FROM coupons c
     INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
     WHERE c.leader_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM organizer_group_leaders ogl
         WHERE ogl.leader_id = c.leader_id AND ogl.organizer_id = $2
       )`,
    [eventId, organizerTo]
  ).then((r) => (r.rows[0] as { cnt: number })?.cnt ?? 0);
  if (invalidLeader > 0) {
    errors.push(`${invalidLeader} cupom(ns) com leader_id não vinculado ao organizador B`);
  }

  // 7. Convites (available/sent): nenhum órfão (leader_id deve estar em organizer_group_leaders para B)
  const orphanInvitations = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM leader_invitations li
     LEFT JOIN organizer_group_leaders ogl
       ON ogl.leader_id = li.leader_id AND ogl.organizer_id = $1
     WHERE li.event_id = $2 AND li.status IN ('available', 'sent') AND ogl.leader_id IS NULL`,
    [organizerTo, eventId]
  ).then((r) => (r.rows[0] as { cnt: number })?.cnt ?? 0);
  if (orphanInvitations > 0) {
    errors.push(`Convites órfãos: ${orphanInvitations} convite(s) com leader_id não vinculado a B`);
  }

  // 8. Líderes em leader_event_commissions do evento devem estar vinculados a B
  const orphanLec = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM leader_event_commissions lec
     LEFT JOIN organizer_group_leaders ogl
       ON ogl.leader_id = lec.leader_id AND ogl.organizer_id = $1
     WHERE lec.event_id = $2 AND ogl.leader_id IS NULL`,
    [organizerTo, eventId]
  ).then((r) => (r.rows[0] as { cnt: number })?.cnt ?? 0);
  if (orphanLec > 0) {
    errors.push(`${orphanLec} líder(es) em leader_event_commissions do evento não vinculado(s) a B`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

/**
 * Monta um resumo simulado para dry_run (contagens de cupons do evento, etc.).
 */
async function buildDryRunSummary(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  eventId: string,
  organizerFrom: string,
  organizerTo: string
): Promise<DryRunSummary> {
  const couponCountResult = await client.query(
    `WITH event_coupons AS (
       SELECT c.id, c.code, (SELECT COUNT(*) FROM coupon_events ce2 WHERE ce2.coupon_id = c.id) AS event_count
       FROM coupons c
       INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
       WHERE c.organizer_id = $2
     )
     SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE event_count = 1)::int AS exclusivos,
       COUNT(*) FILTER (WHERE event_count > 1)::int AS compartilhados
     FROM event_coupons`,
    [eventId, organizerFrom]
  );
  const invResult = await client.query(
    `SELECT COUNT(*) AS cnt FROM leader_invitations WHERE event_id = $1 AND status IN ('available', 'sent')`,
    [eventId]
  );
  const row = couponCountResult.rows[0] as { total?: number; exclusivos?: number; compartilhados?: number };
  const totalCoupons = Number(row?.total ?? 0) || 0;
  const exclusivos = Number(row?.exclusivos ?? 0) || 0;
  const compartilhados = Number(row?.compartilhados ?? 0) || 0;
  const invitationsToUpdate = Number((invResult.rows[0] as { cnt?: string })?.cnt ?? 0) || 0;

  const conflitosResult = await client.query(
    `WITH shared_codes AS (
       SELECT c.id, c.code
       FROM coupons c
       INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
       WHERE c.organizer_id = $2
         AND (SELECT COUNT(*) FROM coupon_events ce2 WHERE ce2.coupon_id = c.id) > 1
     )
     SELECT COUNT(*)::int AS cnt
     FROM shared_codes sc
     WHERE EXISTS (SELECT 1 FROM coupons c2 WHERE c2.organizer_id = $3 AND c2.code = sc.code)`,
    [eventId, organizerFrom, organizerTo]
  );
  const conflitosCodigoResolvidos = Number((conflitosResult.rows[0] as { cnt?: number })?.cnt ?? 0) || 0;

  return {
    total_coupons: totalCoupons,
    exclusivos,
    compartilhados,
    leaders_to_create: 0,
    leaders_to_reuse: 0,
    leaders_mapped_to_existing: 0,
    conflitos_codigo_resolvidos: conflitosCodigoResolvidos,
    invitations_to_update: invitationsToUpdate,
  };
}

// ---------------------------------------------------------------------------
// Etapa 3: Migração de leaders — mapa old_leader_id → new_leader_id em B
// ---------------------------------------------------------------------------

type PgClient = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

/**
 * Coleta todos os leader_id distintos impactados pelo evento para a migração.
 * Fontes: (1) cupons do evento, (2) convites available/sent, (3) leader_event_commissions.
 * Lista única sem duplicidade.
 * Exportada para testes.
 */
export async function getLeaderIdsForEvent(
  client: PgClient,
  eventId: string,
  organizerFrom: string
): Promise<string[]> {
  const fromCoupons = await client.query(
    `SELECT DISTINCT c.leader_id FROM coupons c
     INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
     WHERE c.organizer_id = $2 AND c.leader_id IS NOT NULL`,
    [eventId, organizerFrom]
  );
  const fromInvitations = await client.query(
    `SELECT DISTINCT leader_id FROM leader_invitations
     WHERE event_id = $1 AND status IN ('available', 'sent')`,
    [eventId]
  );
  const fromCommissions = await client.query(
    `SELECT DISTINCT lec.leader_id FROM leader_event_commissions lec
     WHERE lec.event_id = $1`,
    [eventId]
  );
  const ids = new Set<string>();
  for (const row of fromCoupons.rows) {
    const id = (row as { leader_id: string }).leader_id;
    if (id) ids.add(id);
  }
  for (const row of fromInvitations.rows) {
    const id = (row as { leader_id: string }).leader_id;
    if (id) ids.add(id);
  }
  for (const row of fromCommissions.rows) {
    const id = (row as { leader_id: string }).leader_id;
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

interface LeaderData {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
}

/** Carrega email, phone, full_name dos líderes (group_leaders → users, profiles). */
async function loadLeaderData(client: PgClient, leaderIds: string[]): Promise<LeaderData[]> {
  if (leaderIds.length === 0) return [];
  const result = await client.query(
    `SELECT gl.id, u.email, p.phone, p.full_name
     FROM group_leaders gl
     JOIN users u ON u.id = gl.user_id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE gl.id = ANY($1::uuid[])`,
    [leaderIds]
  );
  return result.rows.map((row) => {
    const r = row as { id: string; email: string | null; phone: string | null; full_name: string | null };
    return { id: r.id, email: r.email ?? null, phone: r.phone ?? null, full_name: r.full_name ?? null };
  });
}

/** Líderes já vinculados ao organizador B com email/phone para matching. */
async function loadLeadersForOrganizer(
  client: PgClient,
  organizerId: string
): Promise<{ leader_id: string; email: string | null; phone: string | null }[]> {
  const result = await client.query(
    `SELECT gl.id AS leader_id, u.email, p.phone
     FROM organizer_group_leaders ogl
     JOIN group_leaders gl ON gl.id = ogl.leader_id
     JOIN users u ON u.id = gl.user_id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE ogl.organizer_id = $1`,
    [organizerId]
  );
  return result.rows.map((row) => {
    const r = row as { leader_id: string; email: string | null; phone: string | null };
    return { leader_id: r.leader_id, email: r.email ?? null, phone: r.phone ?? null };
  });
}

function normalizeForMatch(s: string | null): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

/**
 * Resolve o mapa old_leader_id → new_leader_id para o organizador B.
 * - Se o líder já está vinculado a B (organizer_group_leaders): old → old.
 * - Se existe em B um líder com mesmo email (ou telefone): old → esse leader_id.
 * - Senão: vincula o mesmo líder a B (INSERT organizer_group_leaders) e old → old.
 * @param dryRun quando true, não faz INSERT; apenas calcula o mapa e contagens.
 */
export async function resolveLeadersForMigration(
  client: PgClient,
  eventId: string,
  organizerFrom: string,
  organizerTo: string,
  dryRun = false
): Promise<ResolveLeadersResult> {
  const leaderIds = await getLeaderIdsForEvent(client, eventId, organizerFrom);
  if (leaderIds.length === 0) {
    return { map: new Map(), leaders_added_to_b: 0, leaders_reused_in_b: 0, leaders_mapped_to_existing: 0 };
  }

  const [originalLeaders, leadersInB] = await Promise.all([
    loadLeaderData(client, leaderIds),
    loadLeadersForOrganizer(client, organizerTo),
  ]);

  const bByLeaderId = new Map(leadersInB.map((l) => [l.leader_id, l]));
  const bByEmail = new Map<string, string>();
  const bByPhone = new Map<string, string>();
  for (const l of leadersInB) {
    const email = normalizeForMatch(l.email);
    const phone = normalizeForMatch(l.phone);
    if (email && !bByEmail.has(email)) bByEmail.set(email, l.leader_id);
    if (phone && !bByPhone.has(phone)) bByPhone.set(phone, l.leader_id);
  }

  const map: LeaderIdMap = new Map();
  let leadersAddedToB = 0;
  let leadersReusedInB = 0;
  let leadersMappedToExisting = 0;

  for (const orig of originalLeaders) {
    const alreadyInB = bByLeaderId.has(orig.id);
    if (alreadyInB) {
      map.set(orig.id, orig.id);
      leadersReusedInB += 1;
      continue;
    }

    const email = normalizeForMatch(orig.email);
    const phone = normalizeForMatch(orig.phone);
    const matchedByEmail = email ? bByEmail.get(email) : undefined;
    const matchedByPhone = phone ? bByPhone.get(phone) : undefined;
    const matched = matchedByEmail ?? matchedByPhone;

    if (matched) {
      map.set(orig.id, matched);
      leadersMappedToExisting += 1;
      if (!dryRun) {
        await client.query(
          `INSERT INTO organizer_group_leaders (organizer_id, leader_id)
           VALUES ($1, $2)
           ON CONFLICT (organizer_id, leader_id) DO NOTHING`,
          [organizerTo, orig.id]
        );
      }
      continue;
    }

    if (!dryRun) {
      await client.query(
        `INSERT INTO organizer_group_leaders (organizer_id, leader_id)
         VALUES ($1, $2)
         ON CONFLICT (organizer_id, leader_id) DO NOTHING`,
        [organizerTo, orig.id]
      );
    }
    map.set(orig.id, orig.id);
    leadersAddedToB += 1;
    bByLeaderId.set(orig.id, { leader_id: orig.id, email: orig.email, phone: orig.phone });
    if (email) bByEmail.set(email, orig.id);
    if (phone) bByPhone.set(phone, orig.id);
  }

  return {
    map,
    leaders_added_to_b: leadersAddedToB,
    leaders_reused_in_b: leadersReusedInB,
    leaders_mapped_to_existing: leadersMappedToExisting,
  };
}

// ---------------------------------------------------------------------------
// Debug estruturado para dry_run (auditoria temporária)
// ---------------------------------------------------------------------------

async function buildDryRunDebug(
  client: PgClient,
  eventId: string,
  organizerFrom: string,
  organizerTo: string,
  leaderMap: LeaderIdMap,
  counts: { leaders_to_create: number; leaders_to_reuse: number; leaders_mapped_to_existing: number }
): Promise<MigrationDryRunDebug> {
  // 1. Leaders by source (queries com detalhes por fonte; LEC sem JOIN events para bater com getLeaderIdsForEvent)
  const [couponRows, invitationRows, lecRows] = await Promise.all([
    client.query(
      `SELECT c.id AS coupon_id, c.code, c.leader_id
       FROM coupons c
       INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
       WHERE c.organizer_id = $2 AND c.leader_id IS NOT NULL`,
      [eventId, organizerFrom]
    ),
    client.query(
      `SELECT id AS invitation_id, leader_id, status AS invitation_status
       FROM leader_invitations
       WHERE event_id = $1 AND status IN ('available', 'sent')`,
      [eventId]
    ),
    client.query(
      `SELECT lec.id AS lec_id, lec.leader_id, COALESCE(lec.bonus_type, 'commission') AS bonus_type
       FROM leader_event_commissions lec
       WHERE lec.event_id = $1`,
      [eventId]
    ),
  ]);

  const allLeaderIds = new Set<string>();
  for (const r of couponRows.rows) {
    const id = (r as { leader_id: string }).leader_id;
    if (id) allLeaderIds.add(id);
  }
  for (const r of invitationRows.rows) {
    const id = (r as { leader_id: string }).leader_id;
    if (id) allLeaderIds.add(id);
  }
  for (const r of lecRows.rows) {
    const id = (r as { leader_id: string }).leader_id;
    if (id) allLeaderIds.add(id);
  }

  const leaderDataList = await loadLeaderData(client, Array.from(allLeaderIds));
  const leaderById = new Map(leaderDataList.map((l) => [l.id, l]));

  const bySourceCoupon: LeadersBySourceItem[] = [];
  const bySourceInvitation: LeadersBySourceItem[] = [];
  const bySourceLec: LeadersBySourceItem[] = [];
  const sourceByLeader = new Map<string, Set<string>>();

  function addSource(leaderId: string, source: string) {
    if (!sourceByLeader.has(leaderId)) sourceByLeader.set(leaderId, new Set());
    sourceByLeader.get(leaderId)!.add(source);
  }

  for (const row of couponRows.rows) {
    const r = row as { coupon_id: string; code: string; leader_id: string };
    if (!r.leader_id) continue;
    const ld = leaderById.get(r.leader_id);
    bySourceCoupon.push({
      leader_id: r.leader_id,
      full_name: ld?.full_name ?? null,
      email: ld?.email ?? null,
      phone: ld?.phone ?? null,
      source: 'coupon',
      coupon_id: r.coupon_id,
      code: r.code,
    });
    addSource(r.leader_id, 'coupon');
  }
  for (const row of invitationRows.rows) {
    const r = row as { invitation_id: string; leader_id: string; invitation_status: string };
    const ld = leaderById.get(r.leader_id);
    bySourceInvitation.push({
      leader_id: r.leader_id,
      full_name: ld?.full_name ?? null,
      email: ld?.email ?? null,
      phone: ld?.phone ?? null,
      source: 'invitation',
      invitation_id: r.invitation_id,
      invitation_status: r.invitation_status,
    });
    addSource(r.leader_id, 'invitation');
  }
  for (const row of lecRows.rows) {
    const r = row as { lec_id: string; leader_id: string; bonus_type: string };
    const ld = leaderById.get(r.leader_id);
    bySourceLec.push({
      leader_id: r.leader_id,
      full_name: ld?.full_name ?? null,
      email: ld?.email ?? null,
      phone: ld?.phone ?? null,
      source: 'leader_event_commission',
      lec_id: r.lec_id,
      bonus_type: r.bonus_type,
    });
    addSource(r.leader_id, 'leader_event_commission');
  }

  const finalLeaderIds = Array.from(allLeaderIds);
  const removed_duplications = finalLeaderIds
    .filter((id) => (sourceByLeader.get(id)?.size ?? 0) > 1)
    .map((leader_id) => ({ leader_id, sources: Array.from(sourceByLeader.get(leader_id)!) }));

  // 2. Classification (mesma lógica que resolveLeadersForMigration, só output detalhado)
  const leadersInB = await loadLeadersForOrganizer(client, organizerTo);
  const bByLeaderId = new Map(leadersInB.map((l) => [l.leader_id, l]));
  const bByEmail = new Map<string, string>();
  const bByPhone = new Map<string, string>();
  for (const l of leadersInB) {
    const email = normalizeForMatch(l.email);
    const phone = normalizeForMatch(l.phone);
    if (email && !bByEmail.has(email)) bByEmail.set(email, l.leader_id);
    if (phone && !bByPhone.has(phone)) bByPhone.set(phone, l.leader_id);
  }

  const classification: LeaderClassificationItem[] = [];
  for (const orig of leaderDataList) {
    const alreadyInB = bByLeaderId.has(orig.id);
    const email = normalizeForMatch(orig.email);
    const phone = normalizeForMatch(orig.phone);
    const matchedByEmail = email ? bByEmail.get(email) : undefined;
    const matchedByPhone = phone ? bByPhone.get(phone) : undefined;
    const matched = matchedByEmail ?? matchedByPhone;

    let action: LeaderClassificationItem['action'] = 'ignored';
    let reason: string;
    let will_link_to_b = false;

    if (alreadyInB) {
      action = 'reused';
      reason = 'Líder já está em organizer_group_leaders para B';
    } else if (matched) {
      action = 'mapped';
      reason = matchedByEmail && matchedByPhone
        ? 'Match por email e telefone com líder já em B'
        : matchedByEmail
          ? 'Match por email com líder já em B'
          : 'Match por telefone com líder já em B';
    } else {
      action = 'create';
      will_link_to_b = true;
      reason = 'Será feito INSERT em organizer_group_leaders para B';
    }

    classification.push({
      leader_id: orig.id,
      full_name: orig.full_name ?? null,
      already_in_b: alreadyInB,
      match_by_email: !!matchedByEmail,
      match_by_phone: !!matchedByPhone,
      will_link_to_b,
      action,
      reason,
    });
  }

  // 3. Coupons to update / duplicate
  const couponRowsList = await loadEventCoupons(client, eventId, organizerFrom);
  const leaderIdsInCoupons = [...new Set(couponRowsList.map((c) => c.leader_id).filter(Boolean) as string[])];
  const couponLeaderData = await loadLeaderData(client, leaderIdsInCoupons);
  const couponLeaderByName = new Map(couponLeaderData.map((l) => [l.id, l.full_name]));

  const coupons_to_update: CouponUpdateDebugItem[] = [];
  const coupons_to_duplicate: CouponDuplicateDebugItem[] = [];
  for (const c of couponRowsList) {
    const newLeaderId = c.leader_id ? (leaderMap.get(c.leader_id) ?? c.leader_id) : null;
    const leaderName = c.leader_id ? (couponLeaderByName.get(c.leader_id) ?? null) : null;
    if (c.event_count === 1) {
      coupons_to_update.push({
        coupon_id: c.id,
        code: c.code,
        leader_id: c.leader_id,
        leader_name: leaderName ?? null,
        organizer_from: organizerFrom,
        organizer_to: organizerTo,
        action: 'update',
      });
    } else {
      const codeConflict = await client.query(
        `SELECT id FROM coupons WHERE code = $1 AND organizer_id = $2`,
        [c.code, organizerTo]
      );
      const codeFinal = codeConflict.rows.length > 0 ? `${c.code}_MIGRADO_${eventId.slice(0, 8)}` : c.code;
      coupons_to_duplicate.push({
        coupon_id_original: c.id,
        code_original: c.code,
        code_final: codeFinal,
        leader_id_original: c.leader_id,
        leader_id_final: newLeaderId,
        leader_name: leaderName ?? null,
        organizer_from: organizerFrom,
        organizer_to: organizerTo,
        action: 'duplicate',
      });
    }
  }

  // 4. Invitations to update
  const invListResult = await client.query(
    `SELECT id, leader_id, status FROM leader_invitations
     WHERE event_id = $1 AND status IN ('available', 'sent')`,
    [eventId]
  );
  const invitations_to_update: InvitationUpdateDebugItem[] = [];
  for (const row of invListResult.rows) {
    const r = row as { id: string; leader_id: string; status: string };
    const newLeaderId = leaderMap.get(r.leader_id) ?? r.leader_id;
    invitations_to_update.push({
      invitation_id: r.id,
      leader_id_old: r.leader_id,
      leader_id_new: newLeaderId,
      status: r.status,
      action: r.leader_id !== newLeaderId ? 'update_leader_id' : 'unchanged',
    });
  }

  return {
    leaders_by_source: {
      coupon: bySourceCoupon,
      invitation: bySourceInvitation,
      leader_event_commission: bySourceLec,
    },
    leaders_deduplicated: { final_leader_ids: finalLeaderIds, removed_duplications },
    leaders_classification: classification,
    leaders_to_create: counts.leaders_to_create,
    leaders_to_reuse: counts.leaders_to_reuse,
    leaders_mapped_to_existing: counts.leaders_mapped_to_existing,
    leaders_to_link: counts.leaders_to_create + counts.leaders_mapped_to_existing,
    coupons_to_update,
    coupons_to_duplicate,
    invitations_to_update,
  };
}

// ---------------------------------------------------------------------------
// Etapa 4: Migração de convites — reassociar leader_id para líder em B
// ---------------------------------------------------------------------------

/**
 * Atualiza convites (available/sent) do evento: leader_id → new_leader_id do mapa;
 * preenche migrated_from_leader_id, migrated_at, migration_id. Só atualiza onde migration_id IS NULL.
 */
async function migrateInvitations(
  client: PgClient,
  eventId: string,
  migrationId: string,
  leaderMap: LeaderIdMap,
  organizerTo: string
): Promise<number> {
  let totalUpdated = 0;
  for (const [oldLeaderId, newLeaderId] of leaderMap.entries()) {
    const result = await client.query(
      `UPDATE leader_invitations
       SET leader_id = $1, updated_at = NOW(),
           migrated_from_leader_id = leader_id, migrated_at = NOW(), migration_id = $2
       WHERE event_id = $3 AND status IN ('available', 'sent') AND leader_id = $4
         AND (migration_id IS NULL)`,
      [newLeaderId, migrationId, eventId, oldLeaderId]
    );
    totalUpdated += result.rowCount ?? 0;
  }
  return totalUpdated;
}

/**
 * Conta convites (available/sent) do evento cujo leader_id não está vinculado ao organizador B.
 * Se > 0, há convites órfãos → deve fazer ROLLBACK.
 */
async function countOrphanInvitations(
  client: PgClient,
  eventId: string,
  organizerTo: string
): Promise<number> {
  const result = await client.query(
    `SELECT COUNT(*)::int AS cnt
     FROM leader_invitations li
     LEFT JOIN organizer_group_leaders ogl
       ON ogl.leader_id = li.leader_id AND ogl.organizer_id = $1
     WHERE li.event_id = $2 AND li.status IN ('available', 'sent') AND ogl.leader_id IS NULL`,
    [organizerTo, eventId]
  );
  return (result.rows[0] as { cnt: number })?.cnt ?? 0;
}

// ---------------------------------------------------------------------------
// Etapa 6 (opcional): Migração de histórico — contact_messages do evento para B
// ---------------------------------------------------------------------------

/**
 * Atualiza mensagens de contato do evento para o novo organizador (B).
 * Decisão: mensagens ligadas ao evento migrado passam a aparecer no painel de B; A deixa de vê-las para este evento.
 */
async function migrateContactMessages(
  client: PgClient,
  eventId: string,
  organizerFrom: string,
  organizerTo: string
): Promise<number> {
  const result = await client.query(
    `UPDATE contact_messages
     SET organizer_id = $1, updated_at = NOW()
     WHERE event_id = $2 AND organizer_id = $3`,
    [organizerTo, eventId, organizerFrom]
  );
  return result.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Etapa 5: Migração de cupons — exclusivos (UPDATE) e compartilhados (duplicar)
// ---------------------------------------------------------------------------

interface EventCouponRow {
  id: string;
  code: string;
  name: string;
  type: string;
  discount_value: string;
  expiration_date: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  leader_id: string | null;
  event_count: number;
}

/** Verifica se já existe cupom com (organizer_id, code). */
async function couponCodeExists(
  client: PgClient,
  organizerId: string,
  code: string
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM coupons WHERE organizer_id = $1 AND code = $2`,
    [organizerId, code]
  );
  return r.rows.length > 0;
}

/** Encontra um code único para o organizador B, resolvendo conflito com sufixo _MIGRADO_ + eventId (e _2, _3 se necessário). */
async function findUniqueCouponCodeForOrganizer(
  client: PgClient,
  organizerTo: string,
  baseCode: string,
  eventId: string
): Promise<{ code: string; hadConflict: boolean }> {
  const exists = await couponCodeExists(client, organizerTo, baseCode);
  if (!exists) return { code: baseCode, hadConflict: false };

  const suffix = `_MIGRADO_${eventId.slice(0, 8)}`;
  let candidate = `${baseCode}${suffix}`;
  let i = 0;
  while (await couponCodeExists(client, organizerTo, candidate)) {
    i += 1;
    candidate = `${baseCode}${suffix}_${i}`;
  }
  return { code: candidate, hadConflict: true };
}

/** Cupons do evento (organizer A) com contagem de eventos por cupom. Apenas os que têm coupon_events para este evento. */
async function loadEventCoupons(
  client: PgClient,
  eventId: string,
  organizerFrom: string
): Promise<EventCouponRow[]> {
  const result = await client.query(
    `WITH event_coupons AS (
       SELECT c.id, c.code, c.name, c.type, c.discount_value, c.expiration_date,
              c.max_uses, c.current_uses, c.is_active, c.leader_id,
              (SELECT COUNT(*)::int FROM coupon_events ce2 WHERE ce2.coupon_id = c.id) AS event_count
       FROM coupons c
       INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
       WHERE c.organizer_id = $2
     )
     SELECT id, code, name, type, discount_value, expiration_date, max_uses, current_uses, is_active, leader_id, event_count
     FROM event_coupons`,
    [eventId, organizerFrom]
  );
  return result.rows as EventCouponRow[];
}

export interface CodeConflictResolved {
  coupon_id_original: string;
  code_original: string;
  code_final: string;
}

export interface MigrateCouponsResult {
  exclusives_updated: number;
  shared_created: number;
  code_conflicts_resolved: number;
  code_conflicts_detail: CodeConflictResolved[];
}

/**
 * Migra cupons do evento: exclusivos (UPDATE organizer_id + leader_id), compartilhados (duplicar para B, current_uses=0, vincular só este evento).
 * Cupons globais (sem coupon_events para este evento) já estão excluídos por loadEventCoupons.
 */
async function migrateCoupons(
  client: PgClient,
  eventId: string,
  organizerFrom: string,
  organizerTo: string,
  leaderMap: LeaderIdMap
): Promise<MigrateCouponsResult> {
  const rows = await loadEventCoupons(client, eventId, organizerFrom);
  let exclusivesUpdated = 0;
  let sharedCreated = 0;
  const codeConflictsDetail: CodeConflictResolved[] = [];

  for (const c of rows) {
    const newLeaderId = c.leader_id ? (leaderMap.get(c.leader_id) ?? c.leader_id) : null;

    if (c.event_count === 1) {
      // Exclusivo: transferir para B (mesmo registro)
      await client.query(
        `UPDATE coupons
         SET organizer_id = $1, leader_id = $2, updated_at = NOW()
         WHERE id = $3`,
        [organizerTo, newLeaderId, c.id]
      );
      exclusivesUpdated += 1;
      continue;
    }

    // Compartilhado: duplicar para B com code único (resolver conflito em loop)
    const { code: codeFinal, hadConflict } = await findUniqueCouponCodeForOrganizer(
      client,
      organizerTo,
      c.code,
      eventId
    );
    if (hadConflict) {
      codeConflictsDetail.push({
        coupon_id_original: c.id,
        code_original: c.code,
        code_final: codeFinal,
      });
    }

    const insertResult = await client.query(
      `INSERT INTO coupons (organizer_id, code, name, type, discount_value, expiration_date, max_uses, current_uses, is_active, leader_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)
       RETURNING id`,
      [
        organizerTo,
        codeFinal,
        c.name,
        c.type,
        c.discount_value,
        c.expiration_date,
        c.max_uses,
        c.is_active,
        newLeaderId,
      ]
    );
    const newCouponId = (insertResult.rows[0] as { id: string }).id;

    await client.query(
      `INSERT INTO coupon_events (coupon_id, event_id) VALUES ($1, $2)
       ON CONFLICT (coupon_id, event_id) DO NOTHING`,
      [newCouponId, eventId]
    );
    await client.query(
      `DELETE FROM coupon_events WHERE coupon_id = $1 AND event_id = $2`,
      [c.id, eventId]
    );
    sharedCreated += 1;
  }

  return {
    exclusives_updated: exclusivesUpdated,
    shared_created: sharedCreated,
    code_conflicts_resolved: codeConflictsDetail.length,
    code_conflicts_detail: codeConflictsDetail,
  };
}

// ---------------------------------------------------------------------------
// Etapa 9: Auditoria e logs — consulta por migration_id ou event_id
// ---------------------------------------------------------------------------

export interface MigrationLogEntry {
  id: string;
  event_id: string;
  organizer_from: string;
  organizer_to: string;
  total_cupons_exclusivos: number;
  total_cupons_compartilhados: number;
  total_lideres_criados: number;
  total_lideres_reutilizados: number;
  total_invitations_updated: number;
  conflitos_codigo_resolvidos: number;
  dry_run: boolean;
  status: MigrationStatus;
  validation_errors: string | null;
  executed_at: Date | null;
  executor_id: string | null;
  created_at: Date;
}

/** Retorna um registro de log de migração pelo id (migration_id). */
export async function getMigrationLogById(migrationId: string): Promise<MigrationLogEntry | null> {
  const result = await query(
    `SELECT id, event_id, organizer_from, organizer_to,
            total_cupons_exclusivos, total_cupons_compartilhados, total_lideres_criados, total_lideres_reutilizados,
            total_invitations_updated, conflitos_codigo_resolvidos, dry_run, status, validation_errors,
            executed_at, executor_id, created_at
     FROM event_organizer_migration_log WHERE id = $1`,
    [migrationId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return row as MigrationLogEntry;
}

/** Retorna os registros de log de migração de um evento (mais recentes primeiro). */
export async function getMigrationLogsByEventId(eventId: string): Promise<MigrationLogEntry[]> {
  const result = await query(
    `SELECT id, event_id, organizer_from, organizer_to,
            total_cupons_exclusivos, total_cupons_compartilhados, total_lideres_criados, total_lideres_reutilizados,
            total_invitations_updated, conflitos_codigo_resolvidos, dry_run, status, validation_errors,
            executed_at, executor_id, created_at
     FROM event_organizer_migration_log WHERE event_id = $1 ORDER BY created_at DESC`,
    [eventId]
  );
  return result.rows as MigrationLogEntry[];
}

// ---------------------------------------------------------------------------
// Etapa 10: Rollback seguro pós-commit
// ---------------------------------------------------------------------------

const ROLLBACK_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h

export interface RollbackMigrationResult {
  ok: true;
  rollback_id: string;
  event_id: string;
  organizer_restored: string; // A
  message: string;
}

export interface RollbackMigrationError {
  ok: false;
  reason: 'not_found' | 'not_success' | 'has_new_registrations' | 'window_expired' | 'error';
  message: string;
}

/**
 * Executa rollback lógico de uma migração bem-sucedida (Etapa 10).
 * Pré-condições: status da migração = success; nenhuma inscrição nova após executed_at; dentro da janela (48h).
 */
export async function executeRollbackMigration(
  migrationId: string,
  executorId: string
): Promise<RollbackMigrationResult | RollbackMigrationError> {
  const log = await getMigrationLogById(migrationId);
  if (!log) {
    return { ok: false, reason: 'not_found', message: 'Registro de migração não encontrado' };
  }
  if (log.status !== 'success') {
    return {
      ok: false,
      reason: 'not_success',
      message: `Rollback permitido apenas para migrações com status success (atual: ${log.status})`,
    };
  }
  if (!log.executed_at) {
    return { ok: false, reason: 'not_success', message: 'Migração sem executed_at (dry_run/skipped)' };
  }

  const executedAt = new Date(log.executed_at);
  const now = new Date();
  if (now.getTime() - executedAt.getTime() > ROLLBACK_WINDOW_MS) {
    return {
      ok: false,
      reason: 'window_expired',
      message: `Janela de rollback expirada (48h). Migração executada em ${executedAt.toISOString()}`,
    };
  }

  const newRegs = await query(
    `SELECT COUNT(*)::int AS cnt FROM registrations WHERE event_id = $1 AND created_at > $2`,
    [log.event_id, executedAt]
  ).then((r) => (r.rows[0] as { cnt: number })?.cnt ?? 0);
  if (newRegs > 0) {
    return {
      ok: false,
      reason: 'has_new_registrations',
      message: `Existem ${newRegs} inscrição(ões) após a migração. Rollback negado para evitar inconsistência.`,
    };
  }

  const eventId = log.event_id;
  const organizerA = log.organizer_from;
  const organizerB = log.organizer_to;

  const client = await getClient();
  try {
    await client.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
    await client.query('BEGIN');

    // 1. Convites: reverter leader_id para migrated_from_leader_id
    await client.query(
      `UPDATE leader_invitations
       SET leader_id = migrated_from_leader_id, migrated_from_leader_id = NULL, migrated_at = NULL, migration_id = NULL, updated_at = NOW()
       WHERE migration_id = $1`,
      [migrationId]
    );

    // 2. Cupons de B vinculados ao evento: exclusivos (UPDATE para A) ou compartilhados (remover cupom B, reinserir vínculo A)
    const bCoupons = await client.query(
      `SELECT c.id, c.code FROM coupons c
       INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
       WHERE c.organizer_id = $2`,
      [eventId, organizerB]
    );
    const rows = bCoupons.rows as { id: string; code: string }[];

    for (const row of rows) {
      if (row.code.includes('_MIGRADO_')) {
        const baseCode = row.code.split('_MIGRADO_')[0]!.trim() || row.code;
        const originalA = await client.query(
          `SELECT id FROM coupons WHERE organizer_id = $1 AND code = $2`,
          [organizerA, baseCode]
        );
        if (originalA.rows.length > 0) {
          const originalId = (originalA.rows[0] as { id: string }).id;
          await client.query(
            `INSERT INTO coupon_events (coupon_id, event_id) VALUES ($1, $2) ON CONFLICT (coupon_id, event_id) DO NOTHING`,
            [originalId, eventId]
          );
        }
        await client.query(`DELETE FROM coupon_events WHERE coupon_id = $1 AND event_id = $2`, [row.id, eventId]);
        await client.query(`DELETE FROM coupons WHERE id = $1`, [row.id]);
      } else {
        await client.query(
          `UPDATE coupons SET organizer_id = $1, updated_at = NOW() WHERE id = $2`,
          [organizerA, row.id]
        );
      }
    }

    // 3. contact_messages do evento de volta para A
    await client.query(
      `UPDATE contact_messages SET organizer_id = $1, updated_at = NOW() WHERE event_id = $2 AND organizer_id = $3`,
      [organizerA, eventId, organizerB]
    );

    // 4. Evento de volta para A
    await client.query(
      `UPDATE events SET organizer_id = $1, updated_at = NOW() WHERE id = $2`,
      [organizerA, eventId]
    );

    // 5. Registrar rollback no log (mesma transação)
    const rollbackId = crypto.randomUUID();
    await client.query(
      `INSERT INTO event_organizer_migration_log (
        id, event_id, organizer_from, organizer_to,
        total_cupons_exclusivos, total_cupons_compartilhados, total_lideres_criados, total_lideres_reutilizados,
        total_invitations_updated, conflitos_codigo_resolvidos,
        status, dry_run, executor_id, executed_at, validation_errors
      ) VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 0, 'rollback', false, $5, NOW(), $6)`,
      [rollbackId, eventId, organizerB, organizerA, executorId, `rollback_of:${migrationId}`]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      rollback_id: rollbackId,
      event_id: eventId,
      organizer_restored: organizerA,
      message: 'Rollback concluído com sucesso. Evento e dados relacionados revertidos para o organizador original.',
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
