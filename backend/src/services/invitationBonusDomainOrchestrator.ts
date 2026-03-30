import {
  checkAllInvitationBonuses,
  checkInvitationBonusForCommission,
  triggerInvitationBonusAfterPaidWithCoupon,
  type InvitationBonusTriggerContext,
} from './leaderBonusService.js';
import { runMissingInvitationDelivery } from './missingInvitationDeliveryService.js';
import { runInvitationBonusReconciliation } from './invitationBonusReconciliationService.js';
import {
  buildAssistedCommandLockKey,
  withAssistedCommandPgLock,
} from './invitationBonusDistributedLockService.js';
import type {
  InvitationBonusDomainCommand,
  InvitationBonusDomainCommandResult,
  InvitationBonusDomainMode,
  InvitationBonusDomainCommandType,
} from '../types/invitationBonusDomain.js';
import { query } from '../config/database.js';

type DomainCommandLog = {
  event: 'invitation_bonus_domain_command';
  phase: 'start' | 'end' | 'error';
  type: InvitationBonusDomainCommandType;
  mode: InvitationBonusDomainMode;
  source: string;
  correlation_id?: string;
  leader_id?: string;
  event_id: string;
  commission_id?: string;
  idempotency_key?: string;
  replay_status?: 'none' | 'in_progress' | 'already_processed' | 'retried_after_failure';
  detail?: string;
  message?: string;
  /** Etapa 5 — coordenação distribuída (comandos assistidos) */
  lock_key?: string;
  lock_acquired?: boolean;
  lock_status?: 'acquired' | 'not_acquired' | 'skipped_fast_path' | 'n/a';
};

function logDomainCommand(payload: DomainCommandLog): void {
  console.log(JSON.stringify(payload));
}

function toTriggerCtx(cmd: InvitationBonusDomainCommand): InvitationBonusTriggerContext {
  return {
    source: cmd.source === 'domain_assisted' ? 'unknown' : cmd.source,
    correlation_id: cmd.correlation_id,
    detail: cmd.detail,
  };
}

function ensureNotAutomaticForAssisted(cmd: InvitationBonusDomainCommand): void {
  if ((cmd.type === 'deliver_missing_assisted' || cmd.type === 'reconcile_state') && cmd.mode !== 'assistido') {
    throw new Error('Comando assistido não pode ser executado em modo automático.');
  }
}

function isAssistedCommand(
  cmd: InvitationBonusDomainCommand
): cmd is Extract<InvitationBonusDomainCommand, { mode: 'assistido' }> {
  return cmd.type === 'deliver_missing_assisted' || cmd.type === 'reconcile_state';
}

function ensureOperationalContextForAssisted(cmd: InvitationBonusDomainCommand): void {
  if (!isAssistedCommand(cmd)) return;
  const ctx = cmd.operational_context;
  if (!ctx?.actor_id?.trim() || !ctx?.actor_email?.trim() || !ctx?.reason?.trim()) {
    throw new Error(
      'Comando assistido requer contexto operacional completo: actor_id, actor_email e reason.'
    );
  }
}

async function insertAssistedCommandAuditStart(
  cmd: Extract<InvitationBonusDomainCommand, { mode: 'assistido' }>,
  distributedLockKey: string
): Promise<string> {
  const result = await query(
    `INSERT INTO invitation_bonus_assisted_command_audit (
      command_type, mode, actor_id, actor_email, reason,
      source, correlation_id, leader_id, event_id, commission_id,
      idempotency_key, distributed_lock_key, status, detail, result
    ) VALUES (
      $1,$2,$3,$4,$5,
      $6,$7,$8,$9,$10,
      $11,$12,'started',$13,$14::jsonb
    )
    RETURNING id::text AS id`,
    [
      cmd.type,
      cmd.mode,
      cmd.operational_context.actor_id,
      cmd.operational_context.actor_email,
      cmd.operational_context.reason,
      cmd.source,
      cmd.correlation_id ?? null,
      cmd.leader_id ?? null,
      cmd.event_id,
      cmd.commission_id ?? null,
      cmd.operational_context.idempotency_key,
      distributedLockKey,
      cmd.detail ?? null,
      JSON.stringify({
        command_input: {
          type: cmd.type,
          mode: cmd.mode,
          source: cmd.source,
          correlation_id: cmd.correlation_id ?? null,
          leader_id: cmd.leader_id ?? null,
          event_id: cmd.event_id,
          commission_id: cmd.commission_id ?? null,
          idempotency_key: cmd.operational_context.idempotency_key,
          distributed_lock_key: distributedLockKey,
        },
      }),
    ]
  );
  return String((result.rows[0] as { id: string }).id);
}

interface AssistedAuditExistingRow {
  id: string;
  status: 'started' | 'succeeded' | 'failed';
}

async function findLatestAssistedCommandByIdempotency(
  cmd: Extract<InvitationBonusDomainCommand, { mode: 'assistido' }>
): Promise<AssistedAuditExistingRow | null> {
  const result = await query(
    `SELECT id::text AS id, status
     FROM invitation_bonus_assisted_command_audit
     WHERE command_type = $1
       AND mode = $2
       AND event_id = $3
       AND leader_id IS NOT DISTINCT FROM $4::uuid
       AND commission_id IS NOT DISTINCT FROM $5::uuid
       AND idempotency_key = $6
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      cmd.type,
      cmd.mode,
      cmd.event_id,
      cmd.leader_id ?? null,
      cmd.commission_id ?? null,
      cmd.operational_context.idempotency_key,
    ]
  );
  if (!result.rows.length) return null;
  return result.rows[0] as AssistedAuditExistingRow;
}

async function updateAssistedCommandAuditEnd(params: {
  auditId: string;
  status: 'succeeded' | 'failed';
  detail?: string;
  result?: unknown;
}): Promise<void> {
  await query(
    `UPDATE invitation_bonus_assisted_command_audit
     SET status = $2,
         detail = COALESCE($3, detail),
         result = COALESCE($4::jsonb, result),
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [params.auditId, params.status, params.detail ?? null, params.result ? JSON.stringify(params.result) : null]
  );
}

function baseLogFields(cmd: Extract<InvitationBonusDomainCommand, { mode: 'assistido' }>, lockKey: string) {
  return {
    type: cmd.type,
    mode: cmd.mode,
    source: cmd.source,
    correlation_id: cmd.correlation_id,
    leader_id: cmd.leader_id,
    event_id: cmd.event_id,
    commission_id: cmd.commission_id,
    idempotency_key: cmd.operational_context.idempotency_key,
    lock_key: lockKey,
  } as const;
}

async function executeAssistedInvitationBonusDomainCommand(
  cmd: Extract<InvitationBonusDomainCommand, { mode: 'assistido' }>
): Promise<InvitationBonusDomainCommandResult> {
  const lockKey = buildAssistedCommandLockKey(cmd);
  let replayStatus: DomainCommandLog['replay_status'] = 'none';

  logDomainCommand({
    event: 'invitation_bonus_domain_command',
    phase: 'start',
    ...baseLogFields(cmd, lockKey),
    replay_status: replayStatus,
    lock_status: 'n/a',
    detail: cmd.detail,
  });

  const prev = await findLatestAssistedCommandByIdempotency(cmd);
  if (prev?.status === 'started') {
    replayStatus = 'in_progress';
    const out: InvitationBonusDomainCommandResult = {
      operation: cmd.type,
      mode: cmd.mode,
      leader_id: cmd.leader_id ?? null,
      event_id: cmd.event_id,
      commission_id: cmd.commission_id ?? null,
      executed: false,
      detail: 'command_in_progress',
    };
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'end',
      ...baseLogFields(cmd, lockKey),
      replay_status: replayStatus,
      lock_status: 'skipped_fast_path',
      detail: out.detail,
    });
    return out;
  }
  if (prev?.status === 'succeeded') {
    replayStatus = 'already_processed';
    const out: InvitationBonusDomainCommandResult = {
      operation: cmd.type,
      mode: cmd.mode,
      leader_id: cmd.leader_id ?? null,
      event_id: cmd.event_id,
      commission_id: cmd.commission_id ?? null,
      executed: false,
      detail: 'command_already_processed',
    };
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'end',
      ...baseLogFields(cmd, lockKey),
      replay_status: replayStatus,
      lock_status: 'skipped_fast_path',
      detail: out.detail,
    });
    return out;
  }
  if (prev?.status === 'failed') {
    replayStatus = 'retried_after_failure';
  }

  try {
  const locked = await withAssistedCommandPgLock(lockKey, async () => {
    const prev2 = await findLatestAssistedCommandByIdempotency(cmd);
    if (prev2?.status === 'succeeded') {
      return {
        kind: 'early' as const,
        replay: 'already_processed' as const,
        result: {
          operation: cmd.type,
          mode: cmd.mode,
          leader_id: cmd.leader_id ?? null,
          event_id: cmd.event_id,
          commission_id: cmd.commission_id ?? null,
          executed: false,
          detail: 'command_already_processed',
        } satisfies InvitationBonusDomainCommandResult,
      };
    }
    if (prev2?.status === 'started') {
      return {
        kind: 'early' as const,
        replay: 'in_progress' as const,
        result: {
          operation: cmd.type,
          mode: cmd.mode,
          leader_id: cmd.leader_id ?? null,
          event_id: cmd.event_id,
          commission_id: cmd.commission_id ?? null,
          executed: false,
          detail: 'command_in_progress',
        } satisfies InvitationBonusDomainCommandResult,
      };
    }
    const innerReplay: DomainCommandLog['replay_status'] =
      prev2?.status === 'failed' ? 'retried_after_failure' : 'none';

    const assistedAuditId = await insertAssistedCommandAuditStart(cmd, lockKey);
    try {
      let out: InvitationBonusDomainCommandResult;
      switch (cmd.type) {
        case 'deliver_missing_assisted': {
          const deliveryResult = await runMissingInvitationDelivery(cmd.params);
          out = {
            operation: cmd.type,
            mode: cmd.mode,
            leader_id: cmd.leader_id ?? null,
            event_id: cmd.event_id,
            commission_id: cmd.commission_id ?? null,
            executed: true,
            detail: cmd.detail ?? 'runMissingInvitationDelivery executado',
            domain_payload: deliveryResult,
          };
          break;
        }
        case 'reconcile_state': {
          const reconciliationResult = await runInvitationBonusReconciliation(cmd.params);
          out = {
            operation: cmd.type,
            mode: cmd.mode,
            leader_id: cmd.leader_id ?? null,
            event_id: cmd.event_id,
            commission_id: cmd.commission_id ?? null,
            executed: true,
            detail: cmd.detail ?? 'runInvitationBonusReconciliation executado',
            domain_payload: reconciliationResult,
          };
          break;
        }
        default: {
          const exhaustiveCheck: never = cmd;
          throw new Error(`Comando assistido não suportado: ${String(exhaustiveCheck)}`);
        }
      }
      const { domain_payload: _omitPayload, ...auditResult } = out;
      await updateAssistedCommandAuditEnd({
        auditId: assistedAuditId,
        status: 'succeeded',
        detail: out.detail,
        result: auditResult,
      });
      return { kind: 'done' as const, replay: innerReplay, result: out };
    } catch (error: any) {
      await updateAssistedCommandAuditEnd({
        auditId: assistedAuditId,
        status: 'failed',
        detail: cmd.detail,
        result: { error_message: error?.message },
      });
      throw error;
    }
  });

  if (!locked.acquired) {
    const out: InvitationBonusDomainCommandResult = {
      operation: cmd.type,
      mode: cmd.mode,
      leader_id: cmd.leader_id ?? null,
      event_id: cmd.event_id,
      commission_id: cmd.commission_id ?? null,
      executed: false,
      detail: 'command_in_progress',
    };
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'end',
      ...baseLogFields(cmd, lockKey),
      replay_status: 'in_progress',
      lock_acquired: false,
      lock_status: 'not_acquired',
      detail: out.detail,
    });
    return out;
  }

  const payload = locked.value;
  if (payload.kind === 'early') {
    replayStatus =
      payload.replay === 'already_processed' ? 'already_processed' : 'in_progress';
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'end',
      ...baseLogFields(cmd, lockKey),
      replay_status: replayStatus,
      lock_acquired: true,
      lock_status: 'acquired',
      detail: payload.result.detail,
    });
    return payload.result;
  }

  replayStatus = payload.replay === 'retried_after_failure' ? 'retried_after_failure' : 'none';
  logDomainCommand({
    event: 'invitation_bonus_domain_command',
    phase: 'end',
    ...baseLogFields(cmd, lockKey),
    replay_status: replayStatus,
    lock_acquired: true,
    lock_status: 'acquired',
    detail: payload.result.detail,
  });
  return payload.result;
  } catch (error: any) {
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'error',
      ...baseLogFields(cmd, lockKey),
      replay_status: replayStatus,
      lock_status: 'n/a',
      detail: cmd.detail,
      message: error?.message,
    });
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'end',
      ...baseLogFields(cmd, lockKey),
      replay_status: replayStatus,
      lock_status: 'n/a',
      detail: cmd.detail,
    });
    throw error;
  }
}

async function executeNonAssistedInvitationBonusDomainCommand(
  cmd: Exclude<InvitationBonusDomainCommand, { mode: 'assistido' }>
): Promise<InvitationBonusDomainCommandResult> {
  let replayStatus: DomainCommandLog['replay_status'] = 'none';
  logDomainCommand({
    event: 'invitation_bonus_domain_command',
    phase: 'start',
    type: cmd.type,
    mode: cmd.mode,
    source: cmd.source,
    correlation_id: cmd.correlation_id,
    leader_id: cmd.leader_id,
    event_id: cmd.event_id,
    commission_id: cmd.commission_id,
    replay_status: replayStatus,
    lock_status: 'n/a',
    detail: cmd.detail,
  });

  try {
    switch (cmd.type) {
      case 'payment_confirmed_with_coupon': {
        await triggerInvitationBonusAfterPaidWithCoupon(
          cmd.leader_id,
          cmd.event_id,
          cmd.coupon_code,
          toTriggerCtx(cmd)
        );
        const out: InvitationBonusDomainCommandResult = {
          operation: cmd.type,
          mode: cmd.mode,
          leader_id: cmd.leader_id,
          event_id: cmd.event_id,
          commission_id: null,
          executed: true,
          detail: cmd.detail,
        };
        return out;
      }
      case 'recheck_leader_event': {
        await checkAllInvitationBonuses(cmd.leader_id, cmd.event_id, toTriggerCtx(cmd));
        const out: InvitationBonusDomainCommandResult = {
          operation: cmd.type,
          mode: cmd.mode,
          leader_id: cmd.leader_id,
          event_id: cmd.event_id,
          commission_id: null,
          executed: true,
          detail: cmd.detail,
        };
        return out;
      }
      case 'recheck_commission': {
        await checkInvitationBonusForCommission(
          cmd.leader_id,
          cmd.event_id,
          cmd.commission_id,
          toTriggerCtx(cmd)
        );
        const out: InvitationBonusDomainCommandResult = {
          operation: cmd.type,
          mode: cmd.mode,
          leader_id: cmd.leader_id,
          event_id: cmd.event_id,
          commission_id: cmd.commission_id,
          executed: true,
          detail: cmd.detail,
        };
        return out;
      }
      default: {
        const exhaustiveCheck: never = cmd;
        throw new Error(`Comando de domínio não suportado: ${String(exhaustiveCheck)}`);
      }
    }
  } catch (error: any) {
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'error',
      type: cmd.type,
      mode: cmd.mode,
      source: cmd.source,
      correlation_id: cmd.correlation_id,
      leader_id: cmd.leader_id,
      event_id: cmd.event_id,
      commission_id: cmd.commission_id,
      replay_status: replayStatus,
      lock_status: 'n/a',
      detail: cmd.detail,
      message: error?.message,
    });
    throw error;
  } finally {
    logDomainCommand({
      event: 'invitation_bonus_domain_command',
      phase: 'end',
      type: cmd.type,
      mode: cmd.mode,
      source: cmd.source,
      correlation_id: cmd.correlation_id,
      leader_id: cmd.leader_id,
      event_id: cmd.event_id,
      commission_id: cmd.commission_id,
      replay_status: replayStatus,
      lock_status: 'n/a',
      detail: cmd.detail,
    });
  }
}

export async function executeInvitationBonusDomainCommand(
  cmd: InvitationBonusDomainCommand
): Promise<InvitationBonusDomainCommandResult> {
  ensureNotAutomaticForAssisted(cmd);
  ensureOperationalContextForAssisted(cmd);
  if (isAssistedCommand(cmd)) {
    return executeAssistedInvitationBonusDomainCommand(cmd);
  }
  return executeNonAssistedInvitationBonusDomainCommand(cmd);
}
