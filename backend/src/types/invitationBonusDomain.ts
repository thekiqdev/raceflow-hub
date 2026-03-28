import type { InvitationBonusTriggerContext } from '../services/leaderBonusService.js';
import type { MissingInvitationDeliveryRequest } from '../services/missingInvitationDeliveryService.js';
import type { ReconciliationRequest } from '../services/invitationBonusReconciliationService.js';

export type InvitationBonusDomainMode = 'automatico' | 'operacional' | 'assistido';

export type InvitationBonusDomainCommandType =
  | 'payment_confirmed_with_coupon'
  | 'recheck_leader_event'
  | 'recheck_commission'
  | 'deliver_missing_assisted'
  | 'reconcile_state';

export interface InvitationBonusOperationalContext {
  actor_id: string;
  actor_email: string;
  reason: string;
  idempotency_key: string;
}

interface InvitationBonusDomainCommandBase {
  type: InvitationBonusDomainCommandType;
  mode: InvitationBonusDomainMode;
  source: InvitationBonusTriggerContext['source'] | 'domain_assisted';
  correlation_id?: string;
  detail?: string;
  leader_id?: string;
  event_id: string;
  commission_id?: string;
}

export interface PaymentConfirmedWithCouponCommand extends InvitationBonusDomainCommandBase {
  type: 'payment_confirmed_with_coupon';
  mode: 'automatico' | 'operacional';
  leader_id: string;
  coupon_code: string | null;
}

export interface RecheckLeaderEventCommand extends InvitationBonusDomainCommandBase {
  type: 'recheck_leader_event';
  mode: 'automatico' | 'operacional';
  leader_id: string;
}

export interface RecheckCommissionCommand extends InvitationBonusDomainCommandBase {
  type: 'recheck_commission';
  mode: 'automatico' | 'operacional';
  leader_id: string;
  commission_id: string;
}

export interface DeliverMissingAssistedCommand extends InvitationBonusDomainCommandBase {
  type: 'deliver_missing_assisted';
  mode: 'assistido';
  operational_context: InvitationBonusOperationalContext;
  params: MissingInvitationDeliveryRequest;
}

export interface ReconcileStateCommand extends InvitationBonusDomainCommandBase {
  type: 'reconcile_state';
  mode: 'assistido';
  operational_context: InvitationBonusOperationalContext;
  params: ReconciliationRequest;
}

export type InvitationBonusDomainCommand =
  | PaymentConfirmedWithCouponCommand
  | RecheckLeaderEventCommand
  | RecheckCommissionCommand
  | DeliverMissingAssistedCommand
  | ReconcileStateCommand;

export interface InvitationBonusDomainCommandResult {
  operation: InvitationBonusDomainCommandType;
  mode: InvitationBonusDomainMode;
  leader_id: string | null;
  event_id: string;
  commission_id?: string | null;
  executed: boolean;
  detail?: string;
  /**
   * Payload rico do serviço (ex.: missing delivery / reconciliação) para o cliente HTTP.
   * Não persistir em auditoria assistida — pode ser grande.
   */
  domain_payload?: unknown;
}

