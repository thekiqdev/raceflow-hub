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

export interface InvitationBonusReconciliationItemA {
  leader_invitation_id: string;
  leader_id: string;
  commission_id: string;
  event_id: string;
  current_status: string;
  justification: string;
  action_proposed: 'set_status_expired';
  reversibility_note: string;
}

export interface InvitationBonusReconciliationItemB {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  leader_invitation_id: string | null;
  current_status: string | null;
  payment_status: string | null;
  /** Flags que disparam o plano Bloco B */
  classification: string[];
  classification_full: string[];
  justification: string;
  action_proposed: 'none_in_v1_apply_blocked';
  action_proposed_human: string;
  reversibility_note: string;
  item_executability: 'executável' | 'dry_run-only';
}

export interface InvitationBonusReconciliationDiagnosticRow {
  leader_id: string;
  commission_id: string;
  required_purchases: number;
  paidCount_correto: number;
  expectedBonuses_correto: number;
  timesGranted_db: number;
  missing_invitations_count: number;
  correct_invitations_count: number;
  excess_invitations_count: number;
  bonus_rule_legible: string;
  calculation_source: 'fase1_audit_canonical';
}

export type BlocoBOperationalGroup = 'ORFA_SEM_CONVITE' | 'EXCESSO_ACIMA_DO_ESPERADO' | 'VALIDA_NAO_MEXER';

export interface BlocoBOperationalItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  leader_invitation_id: string | null;
  status: string | null;
  payment_status: string | null;
  classification: string[];
  motivo_operacional: string;
  grupo_operacional: BlocoBOperationalGroup;
  planejada_para_exclusao: 'sim' | 'não';
}

export interface InvitationBonusReconciliationBlocoBExcluded {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  classification_full: string[];
  reason: string;
}

export interface InvitationBonusReconciliationBlocoBIgnored {
  registration_id: string;
  leader_id: string | null;
  reason: string;
}

export type PhysicalDeleteDecision = 'elegível_para_delete_fisico' | 'bloqueada_por_seguranca';

export interface FreeBonusPhysicalDeleteItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  leader_invitation_id: string | null;
  status: string | null;
  payment_status: string | null;
  classification: string[];
  motivo_operacional: string;
  decision: PhysicalDeleteDecision;
}

export interface FreeBonusPhysicalDeletePlan {
  recorte: {
    must_include_classification: 'sem_convite_correspondente';
    must_have_leader_invitation_id_null: true;
    must_have_leader_id_null: true;
    must_have_commission_id_null: true;
    must_have_payment_method_free_bonus: true;
    must_not_be_classified_as_valida: true;
    must_not_be_classified_as_acima_do_esperado: true;
  };
  totals: {
    total_free_bonus_analisadas: number;
    total_candidatas_exclusao_fisica: number;
    total_elegiveis_para_delete_fisico: number;
    total_excluidas_do_escopo_por_seguranca: number;
  };
  elegiveis_para_delete_fisico: FreeBonusPhysicalDeleteItem[];
  bloqueadas_por_seguranca: FreeBonusPhysicalDeleteItem[];
}

export interface InvitationBonusReconciliationPayload {
  mode: 'dry_run' | 'apply';
  event_id: string;
  leader_id: string | null;
  scope_type: 'single_leader' | 'all_event_leaders';
  free_bonus_block_status: 'executável' | 'dry_run-only';
  free_bonus_block_reason: string;
  audit_snapshot_hash: string;
  dry_run_hash: string;
  consistency_guard: {
    can_apply: boolean;
    reason: string;
    expected_event_id: string;
    expected_leader_scope: string;
    expected_audit_snapshot_hash: string;
    expected_dry_run_hash: string;
  };
  diagnostics_missing_excess: {
    calculation_source: 'fase1_audit_canonical';
    totals: {
      missing_invitations: number;
      correct_invitations: number;
      excess_invitations: number;
    };
    rows: InvitationBonusReconciliationDiagnosticRow[];
  };
  bloco_b_scope: {
    leader_filter_applied: boolean;
    leader_id_filter: string | null;
    note: string;
    excluded_count_orphan_no_leader: number;
    excluded_count_other_leader: number;
  };

  diagnostics_bloco_b_operacional: {
    totals: {
      total_free_bonus_detectadas: number;
      total_free_bonus_orfas_sem_convite: number;
      total_free_bonus_acima_do_esperado: number;
      total_free_bonus_validas: number;
      total_free_bonus_planejadas_para_exclusao: number;
      total_free_bonus_bloqueadas_por_seguranca: number;
    };
    lists: {
      ORFA_SEM_CONVITE: BlocoBOperationalItem[];
      EXCESSO_ACIMA_DO_ESPERADO: BlocoBOperationalItem[];
      VALIDA_NAO_MEXER: BlocoBOperationalItem[];
    };
  };
  reports: {
    before: {
      invitations_available: number;
      invitations_sent: number;
      invitations_used: number;
      invitations_expired: number;
      convites_esperados: number;
      free_bonus_total: number;
      free_bonus_validas: number;
      free_bonus_excesso: number;
      free_bonus_sem_convite: number;
    };
    change_plan: {
      bloco_a_leader_invitations: {
        status: 'executável' | 'dry_run-only';
        items: InvitationBonusReconciliationItemA[];
      };
      bloco_b_registrations_free_bonus: {
        status: 'executável' | 'dry_run-only';
        summary: {
          detected_in_scope: number;
          executable_count: number;
          dry_run_only_count: number;
          ignored_valid_or_neutral_count: number;
          excluded_by_leader_scope_count: number;
          registrations_free_bonus_planned: number;
        };
        items: InvitationBonusReconciliationItemB[];
        excluded_by_leader_scope: InvitationBonusReconciliationBlocoBExcluded[];
        ignored_not_in_plan: InvitationBonusReconciliationBlocoBIgnored[];
        physical_delete_plan: FreeBonusPhysicalDeletePlan;
      };
      summary: {
        invitations_to_change: number;
        registrations_free_bonus_planned: number;
      };
    };
    preview_after: {
      invitations_available: number;
      invitations_expired: number;
      free_bonus_total: number;
      note: string;
    };
    after_apply?: {
      invitations_changed: number;
      invitations_changed_ids: string[];
      free_bonus_changed: number;
      physical_delete?: {
        deleted_count: number;
        deleted_ids: string[];
        backup_saved_ids: string[];
        remaining_free_bonus_registrations_in_event: number;
      };
      note: string;
    };
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

export async function runInvitationBonusReconciliation(params: {
  event_id: string;
  leader_id?: string | null;
  mode: 'dry_run' | 'apply';
  audit_snapshot_hash?: string;
  dry_run_hash?: string;
  apply_confirmed?: boolean;
}): Promise<ApiResponse<InvitationBonusReconciliationPayload>> {
  return apiClient.post<InvitationBonusReconciliationPayload>(
    '/admin/reconcile/invitation-bonus-controlled',
    {
      event_id: params.event_id,
      leader_id: params.leader_id || undefined,
      mode: params.mode,
      audit_snapshot_hash: params.audit_snapshot_hash,
      dry_run_hash: params.dry_run_hash,
      apply_confirmed: params.apply_confirmed,
    }
  );
}

/** Fluxo separado: corrigir convites não entregues (somente geração de faltantes). */
export type MissingInvitationDeliveryStatus = 'apto' | 'bloqueado';

export type MissingDeliveryBlockReasonCode =
  | 'LEADER_INVALIDO'
  | 'TIMES_GRANTED_MAIOR_QUE_EXPECTED'
  | 'BONUS_REGISTRATION_FORA_CANONICO'
  | 'DIVERGENCIA_EXPECTED_BONUSES_PROD_VS_CANONICO'
  | 'BONUS_REPROCESSING'
  | 'COMMISSION_COUPON_MATCHING'
  | 'WRONGFUL_CUPOM_REFERRAL'
  | 'BONUS_TYPE_INELIGIVEL';

export type MissingDeliveryWarningCode =
  | 'BONUS_REGISTRATION_FORA_CANONICO_AGREGADO_SEM_EVIDENCIA_EM_GRANTED'
  | 'BONUS_REPROCESSING_AGREGADO_SEM_EVIDENCIA_EM_GRANTED'
  | 'COUNT_DIVERGENTE_AUDITORIA_VS_DB';

export interface MissingInvitationProvaBlocoAItem {
  leader_invitation_id: string;
  bonus_registration_id: string | null;
  registration_id: string | null;
  status: string;
  created_at: string | null;
  motivo_validade: string;
}

export interface MissingInvitationProvaBlocoBItem {
  leader_invitation_id: string | null;
  bonus_registration_id: string | null;
  registration_id: string | null;
  tipo_inconsistencia: string;
  motivo_detalhado: string;
  created_at: string | null;
  impacta_bloqueio_geracao_futura: boolean;
}

export interface MissingInvitationProvaBlocoC {
  paidCount_correto: number;
  expectedBonuses_correto: number;
  timesGranted_validos: number;
  timesGranted_inconsistentes: number;
  faltantes_teoricos: number;
  faltantes_vs_apenas_validos: number;
  faltantes_liberados_para_apply: number;
}

export interface MissingInvitationProvaBlocoD {
  apto_para_apply: boolean;
  motivos_bloqueio: string[];
  motivos_warning_nao_bloqueantes: string[];
  quantos_convites_seriam_gerados_se_apto: number;
  eligible_to_generate_missing_invitations: number;
  saneamento_sugerido: string[];
  blocking_ids_snapshot?: {
    leader_invitation_ids: string[];
    bonus_registration_ids: string[];
    registration_ids: string[];
  };
}

export interface MissingInvitationProvaExpandida {
  leader_id: string;
  commission_id: string;
  expectedBonuses_correto: number;
  timesGranted_validos: number;
  timesGranted_inconsistentes: number;
  faltantes_teoricos: number;
  faltantes_vs_apenas_validos: number;
  faltantes_liberados_para_apply: number;
  block_reason_codes: MissingDeliveryBlockReasonCode[];
  block_reason_human_readable: string[];
  warning_codes: MissingDeliveryWarningCode[];
  warning_human_readable: string[];
  inconsistent_leader_invitation_ids: string[];
  inconsistent_bonus_registration_ids: string[];
  inconsistent_registration_ids: string[];
  blocking_evidence_count: number;
  eligible_to_generate_missing_invitations: number;
  bloco_a_convites_validos: MissingInvitationProvaBlocoAItem[];
  bloco_b_inconsistentes: MissingInvitationProvaBlocoBItem[];
  bloco_c_resumo: MissingInvitationProvaBlocoC;
  bloco_d_decisao: MissingInvitationProvaBlocoD;
}

export interface MissingInvitationPlanItem {
  leader_id: string;
  commission_id: string;
  event_id: string;
  required_purchases: number;
  paidCount_correto: number;
  expectedBonuses_correto: number;
  timesGranted_db: number;
  faltantes: number;
  acao_proposta: string;
  observacao_seguranca: string;
  status: MissingInvitationDeliveryStatus;
  bloqueio_motivos: string[];
  observacao_reversibilidade: string;
  timesGranted_validos: number;
  timesGranted_inconsistentes: number;
  faltantes_teoricos: number;
  faltantes_vs_apenas_validos: number;
  faltantes_liberados_para_apply: number;
  block_reason_codes: MissingDeliveryBlockReasonCode[];
  block_reason_human_readable: string[];
  warning_codes: MissingDeliveryWarningCode[];
  warning_human_readable: string[];
  inconsistent_leader_invitation_ids: string[];
  inconsistent_bonus_registration_ids: string[];
  inconsistent_registration_ids: string[];
  blocking_evidence_count: number;
  eligible_to_generate_missing_invitations: number;
  prova_expandida: MissingInvitationProvaExpandida;
}

export interface MissingInvitationDeliveryPayload {
  mode: 'dry_run' | 'apply';
  flow: 'missing_invitation_delivery_v1';
  event_id: string;
  leader_id: string | null;
  scope_type: 'single_leader' | 'all_event_leaders';
  audit_snapshot_hash: string;
  dry_run_hash: string;
  consistency_guard: {
    can_apply: boolean;
    reason: string;
    expected_event_id: string;
    expected_leader_scope: string;
    expected_audit_snapshot_hash: string;
    expected_dry_run_hash: string;
  };
  relatorio_antes: {
    total_linhas_comissao_escopo: number;
    total_faltantes_somado: number;
    total_aptos_gerar: number;
    total_bloqueados: number;
    calculation_source: 'fase1_audit_canonical';
  };
  plano_geracao: {
    bloco_a_aptos: MissingInvitationPlanItem[];
    bloco_b_bloqueados: MissingInvitationPlanItem[];
  };
  relatorio_depois?: {
    convites_criados_total: number;
    leader_invitation_ids_criados: string[];
    registration_ids_bonus_criados: string[];
    por_comissao: Array<{
      leader_id: string;
      commission_id: string;
      criados_neste_apply: number;
      leader_invitation_ids: string[];
    }>;
    nota: string;
    equivalencia_logica?: {
      leader_invitations: string;
      registrations_free_bonus: string;
    };
    created?: Array<{
      event_id: string;
      leader_id: string;
      commission_id: string;
      registration_id: string;
      bonus_registration_id: string;
      leader_invitation_id: string;
    }>;
    skipped_existing?: Array<{
      skipped_due_to_existing_record: true;
      already_exists: true;
      matched_existing_id: string | null;
      motivo_skip: string;
      skip_reason_code: string;
      event_id: string;
      leader_id: string;
      commission_id: string;
      constraint_name?: string | null;
      table_name?: string | null;
      pg_detail?: string | null;
    }>;
    blocked?: Array<{
      event_id: string;
      leader_id: string;
      commission_id: string;
      motivo: string;
      motivo_code: string;
    }>;
    failed?: Array<{
      event_id: string;
      leader_id: string;
      commission_id: string;
      error_message: string;
      pg_code?: string;
      constraint_name?: string | null;
    }>;
  };
}

export async function runMissingInvitationDeliveryApi(params: {
  event_id: string;
  leader_id?: string | null;
  mode: 'dry_run' | 'apply';
  audit_snapshot_hash?: string;
  dry_run_hash?: string;
  apply_confirmed?: boolean;
}): Promise<ApiResponse<MissingInvitationDeliveryPayload>> {
  return apiClient.post<MissingInvitationDeliveryPayload>('/admin/reconcile/missing-invitation-delivery', {
    event_id: params.event_id,
    leader_id: params.leader_id || undefined,
    mode: params.mode,
    audit_snapshot_hash: params.audit_snapshot_hash,
    dry_run_hash: params.dry_run_hash,
    apply_confirmed: params.apply_confirmed,
  });
}
