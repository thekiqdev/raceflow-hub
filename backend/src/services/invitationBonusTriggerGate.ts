/**
 * Etapa 2 — serialização por (leader_id, event_id) + log estruturado.
 * Não altera regra canônica; apenas ordena execuções concorrentes e rastreia origem.
 */

export type InvitationBonusTriggerSource =
  | 'asaas_webhook'
  | 'commissions_service_create_commission'
  | 'commissions_service_invitation_only'
  | 'registration_bonus_payment_confirmation'
  | 'registrations_service'
  | 'registrations_controller'
  | 'expired_registrations_job'
  | 'script_grant_missing_bonuses'
  | 'script_process_past_invitations'
  | 'unknown';

export interface InvitationBonusTriggerContext {
  source: InvitationBonusTriggerSource;
  /** Ex.: registration_id, webhook id — opcional */
  correlation_id?: string;
  /** Sub-operação para depuração */
  detail?: string;
}

const chainTails = new Map<string, Promise<unknown>>();

/**
 * Garante uma fila FIFO por líder+evento: chamadas concorrentes aguardam a anterior.
 * Evita corridas entre webhook, criação de comissão e update manual no mesmo contexto.
 */
export function runExclusiveLeaderEventInvitationBonus<T>(
  leaderId: string,
  eventId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${leaderId}:${eventId}`;
  const prev = chainTails.get(key) ?? Promise.resolve();
  const run = prev.then(() => fn());
  const settled = run.catch(() => undefined);
  chainTails.set(key, settled);
  settled.finally(() => {
    // Remove apenas se este ainda for o tail atual da chave.
    if (chainTails.get(key) === settled) {
      chainTails.delete(key);
    }
  });
  return run as Promise<T>;
}

export type InvitationBonusStructuredLog = {
  event: 'invitation_bonus_trigger';
  phase: 'start' | 'end' | 'error';
  op:
    | 'checkAndGrantInvitationBonus'
    | 'checkAllInvitationBonuses'
    | 'checkInvitationBonusForCommission'
    | 'triggerInvitationBonusAfterPaidWithCoupon';
  leader_id: string;
  event_id: string;
  commission_id?: string | null;
  source: InvitationBonusTriggerSource;
  correlation_id?: string;
  detail?: string;
  message?: string;
};

export function logInvitationBonusStructured(payload: InvitationBonusStructuredLog): void {
  console.log(JSON.stringify(payload));
}

export function normalizeTriggerContext(
  ctx?: InvitationBonusTriggerContext
): InvitationBonusTriggerContext {
  return ctx ?? { source: 'unknown' };
}
