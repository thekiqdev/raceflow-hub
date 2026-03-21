/**
 * Concessão atômica de slot de bônus (registration free_bonus + leader_invitations).
 * Garante que não persista registration sem linha correspondente em leader_invitations.
 */

import { randomUUID } from 'crypto';
import type pg from 'pg';
import { getClient } from '../config/database.js';

export interface GrantInvitationBonusSlotParams {
  eventId: string;
  /** group_leaders.id */
  leaderId: string;
  commissionId: string;
  /** users.id do líder (runner_id / registered_by da registration) */
  leaderUserId: string;
  categoryId: string;
}

export interface GrantInvitationBonusSlotResult {
  registrationId: string;
  invitationId: string;
}

type PgErr = Error & { code?: string; message?: string };

function logInvitationBonusGrantFailure(payload: {
  event_id: string;
  leader_id: string;
  commission_id: string;
  registration_id_attempt?: string | null;
  rollback_applied: boolean;
  error_message: string;
  pg_code?: string;
}): void {
  console.error('[invitation_bonus_grant] concessao_falhou', {
    event_id: payload.event_id,
    leader_id: payload.leader_id,
    commission_id: payload.commission_id,
    registration_id_tentativa: payload.registration_id_attempt ?? null,
    rollback_aplicado: payload.rollback_applied,
    motivo: payload.error_message,
    pg_code: payload.pg_code ?? null,
  });
}

/**
 * Duas inserções no mesmo client (transação externa deve estar em BEGIN).
 * `onRegistrationInserted` permite auditoria antes do INSERT em leader_invitations.
 */
export async function grantInvitationBonusSlotWithClient(
  client: pg.PoolClient,
  params: GrantInvitationBonusSlotParams,
  onRegistrationInserted?: (registrationId: string) => void
): Promise<GrantInvitationBonusSlotResult> {
  const confirmationCode = `REG-${randomUUID().replace(/-/g, '')}`;

  const reg = await client.query(
    `INSERT INTO registrations (
      event_id, runner_id, registered_by, category_id, kit_id, modality_id,
      payment_method, total_amount, platform_fee_amount, registration_edit_fee_amount,
      confirmation_code, status, payment_status, coupon_code
    )
    VALUES ($1, $2, $3, $4, NULL, NULL, 'free_bonus', 0, 0, 0, $5, 'confirmed', 'convidado', NULL)
    RETURNING id::text AS id`,
    [params.eventId, params.leaderUserId, params.leaderUserId, params.categoryId, confirmationCode]
  );
  const registrationId = (reg.rows[0] as { id: string }).id;
  onRegistrationInserted?.(registrationId);

  const inv = await client.query(
    `INSERT INTO leader_invitations (
      leader_id, bonus_registration_id, event_id, status, commission_id
    ) VALUES ($1, $2, $3, 'available', $4)
    RETURNING id::text AS id`,
    [params.leaderId, registrationId, params.eventId, params.commissionId]
  );
  const invitationId = (inv.rows[0] as { id: string }).id;

  return { registrationId, invitationId };
}

/**
 * Concede um par registration + convite em uma única transação.
 * Em qualquer falha após o BEGIN, executa ROLLBACK — nenhuma registration órfã permanece.
 */
export async function grantInvitationBonusSlotAtomic(
  params: GrantInvitationBonusSlotParams
): Promise<GrantInvitationBonusSlotResult> {
  const client = await getClient();
  let registrationIdAttempt: string | null = null;
  try {
    await client.query('BEGIN');
    const out = await grantInvitationBonusSlotWithClient(client, params, (rid) => {
      registrationIdAttempt = rid;
    });
    await client.query('COMMIT');
    return out;
  } catch (err) {
    const e = err as PgErr;
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      console.error('[invitation_bonus_grant] erro_ao_fazer_rollback', (rbErr as Error).message);
    }
    logInvitationBonusGrantFailure({
      event_id: params.eventId,
      leader_id: params.leaderId,
      commission_id: params.commissionId,
      registration_id_attempt: registrationIdAttempt,
      rollback_applied: true,
      error_message: e?.message || String(err),
      pg_code: e?.code,
    });
    throw err;
  } finally {
    client.release();
  }
}
