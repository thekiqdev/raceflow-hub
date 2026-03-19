import { apiClient, type ApiResponse } from './client';

export type RegistrationOrigin = 'cupom' | 'referral' | 'ambos';

export interface InvitationBonusAuditCommissionRow {
  leader_id: string;
  commission_id: string;
  event_id: string;
  bonus_type: string;
  required_purchases: number;
  commission_percentage: number | null;
  commission_name: string | null;

  coupon_id: string | null;
  coupon_code: string | null;
  coupon_organizer_id: string | null;
  coupon_resolved: boolean;
  coupon_resolution_rule: string;
  registration_ids_production: string[];
  registration_ids_canonical: string[];
  registration_ids_only_production: string[];
  registration_ids_only_canonical: string[];
  origem_por_registration_id: Record<string, RegistrationOrigin>;
  paidCount_production: number;
  paidCount_canonical: number;
  expectedBonuses_production: number;
  expectedBonuses_canonical: number;
  times_granted_db: number;
  convites_por_status_comissao: Record<string, number>;
  times_available_db: number;
  times_sent_db: number;
  times_used_db: number;
  times_expired_db: number;
  bonus_registration_ids_por_status: Record<string, string[]>;
  registration_ids_canonical_expected_but_missing_invites: string[];
  bonus_registration_ids_in_db_not_in_canonical: string[];
  registration_ids_production_without_equivalent_in_invites: string[];
  diagnostic_hypotheses: string[];
  comparativo_bonus_extras: {
    convites_esperados: number;
    convites_existentes: number;
    inscricoes_bonus_existentes: number;
    inscricoes_bonus_validas: number;
    inscricoes_bonus_excedentes: number;
    inscricoes_bonus_sem_lastro_em_leader_invitations: number;
    convites_sem_inscricao_bonus_correspondente: number;
  };
  registration_ids_bonus_validos: string[];
  registration_ids_bonus_excesso: string[];
  registration_ids_bonus_orfaos: string[];
  registration_ids_bonus_sem_convite: string[];
  leader_invitation_ids_validos: string[];
  leader_invitation_ids_sem_registration: string[];
  leader_invitation_ids_excesso: string[];
  convites_no_evento_por_status: Record<string, number>;
  divergencia_paid_count: number;
  divergencia_expected_bonuses: number;
  error_classification_row: string[];
}

export interface InvitationBonusAuditLeaderScope {
  leader_id: string;
  convites_globais_por_status: Record<string, number>;
  convites_neste_evento_por_status: Record<string, number>;
}

export interface InvitationBonusAuditPayload {
  schema_version: string;
  generated_at: string;
  event_id: string;
  event_title: string | null;
  organizer_id: string | null;
  leader_id_filter: string | null;
  functional_report_markdown: string;
  technical_log: {
    rows: InvitationBonusAuditCommissionRow[];
    leaders_scope: InvitationBonusAuditLeaderScope[];
    bonus_registrations_event: Array<{
      registration_id: string;
      leader_id: string | null;
      commission_id: string | null;
      event_id: string;
      created_at: string | null;
      status: string | null;
      payment_status: string | null;
      coupon_code: string | null;
      bonus_registration_id: string | null;
      leader_invitation_id: string | null;
      classification: string[];
    }>;
    bonus_event_summary: {
      convites_esperados: number;
      convites_existentes: number;
      inscricoes_bonus_existentes: number;
      inscricoes_bonus_validas: number;
      inscricoes_bonus_excedentes: number;
      inscricoes_bonus_sem_lastro_em_leader_invitations: number;
      convites_sem_inscricao_bonus_correspondente: number;
      registration_ids_bonus_validos: string[];
      registration_ids_bonus_excesso: string[];
      registration_ids_bonus_orfaos: string[];
      registration_ids_bonus_sem_convite: string[];
      leader_invitation_ids_validos: string[];
      leader_invitation_ids_sem_registration: string[];
      leader_invitation_ids_excesso: string[];
    };
    diagnostic_conclusion: {
      principal_cause:
        | 'bonus_reprocessing'
        | 'ui_scope_event_vs_global_leader'
        | 'criacao_indevida_real_de_inscricoes_bonus'
        | 'inconclusivo';
      confidence: 'baixa' | 'media' | 'alta';
      evidence: string[];
    };
    error_classification_aggregate: string[];
    notes: string[];
  };
}

export async function runInvitationBonusSimulator(params: {
  event_id: string;
  leader_id?: string | null;
}): Promise<ApiResponse<InvitationBonusAuditPayload>> {
  return apiClient.post<InvitationBonusAuditPayload>('/admin/audit/invitation-bonus-simulator', {
    event_id: params.event_id,
    leader_id: params.leader_id || undefined,
  });
}

export type AuditContextLinkType = 'cupom' | 'comissão' | 'convite';

export interface InvitationBonusAuditContextEvent {
  id: string;
  title: string | null;
  event_date: string | null;
  status: string | null;
  registration_status: string | null;
  organizer_id: string | null;
  organizer_name: string | null;
}

export interface InvitationBonusAuditContextSummary {
  total_leaders_impacted: number;
  leaders_with_coupon: number;
  leaders_with_commission: number;
  leaders_with_invitations: number;
  leaders_in_audit_scope: number;
  total_coupons_for_event: number;
  total_invitation_records_for_event: number;
}

export interface InvitationBonusAuditContextLeader {
  leader_id: string;
  leader_name: string | null;
  referral_code: string | null;
  link_types: AuditContextLinkType[];
  coupon_count: number;
  commission_count: number;
  invitation_count: number;
  commission_bonus_types: string[];
  included_in_audit_scope: boolean;
  notes: string[];
}

export interface InvitationBonusAuditContextResult {
  event: InvitationBonusAuditContextEvent;
  summary: InvitationBonusAuditContextSummary;
  leaders: InvitationBonusAuditContextLeader[];
}

/** GET — somente leitura; dados para UI (não altera a auditoria). */
export async function getInvitationBonusAuditContext(
  eventId: string
): Promise<ApiResponse<InvitationBonusAuditContextResult>> {
  return apiClient.get<InvitationBonusAuditContextResult>(
    `/admin/audit/invitation-bonus-context/${eventId}`
  );
}
