/**
 * Fluxo separado: "Corrigir convites não entregues"
 * - Baseado no resultado canônico da auditoria (Fase 1), sem chamar checkAndGrantInvitationBonus.
 * - Gera apenas leader_invitations faltantes (com registrations free_bonus lastro), até expectedBonuses_canonical.
 */

import { createHash } from 'crypto';
import { getClient, query } from '../config/database.js';
import {
  runInvitationBonusAudit,
  type InvitationBonusAuditCommissionRow,
  type InvitationBonusAuditResult,
} from './invitationBonusAuditService.js';
import { getGroupLeaderById } from './groupLeadersService.js';

export type MissingDeliveryMode = 'dry_run' | 'apply';

export interface MissingInvitationDeliveryRequest {
  event_id: string;
  leader_id?: string | null;
  mode: MissingDeliveryMode;
  audit_snapshot_hash?: string | null;
  dry_run_hash?: string | null;
  apply_confirmed?: boolean;
  executed_by?: string;
}

export type MissingDeliveryStatus = 'apto' | 'bloqueado';

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
  status: MissingDeliveryStatus;
  bloqueio_motivos: string[];
  /** Reversibilidade / rastreabilidade (apply cria registrations + leader_invitations) */
  observacao_reversibilidade: string;
}

export interface MissingInvitationDeliveryResult {
  mode: MissingDeliveryMode;
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
  /** 1 — Relatório antes (snapshot canônico agregado) */
  relatorio_antes: {
    total_linhas_comissao_escopo: number;
    total_faltantes_somado: number;
    total_aptos_gerar: number;
    total_bloqueados: number;
    calculation_source: 'fase1_audit_canonical';
  };
  /** 2 — Plano de geração (itens detalhados) */
  plano_geracao: {
    bloco_a_aptos: MissingInvitationPlanItem[];
    bloco_b_bloqueados: MissingInvitationPlanItem[];
  };
  /** 3 — Relatório depois (somente apply) */
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
  };
}

function hashStable(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function buildAuditSnapshotHash(audit: InvitationBonusAuditResult): string {
  return hashStable({
    event_id: audit.event_id,
    leader_id_filter: audit.leader_id_filter,
    rows: audit.technical_log.rows,
    bonus_event_summary: audit.technical_log.bonus_event_summary,
  });
}

/**
 * Avalia se a linha pode receber geração controlada de convites faltantes.
 * Não usa a rotina automática antiga (checkAndGrantInvitationBonus).
 */
function evaluateCommissionForMissingDelivery(
  row: InvitationBonusAuditCommissionRow,
  leaderExists: boolean
): { apto: boolean; motivos: string[] } {
  const motivos: string[] = [];

  if (!leaderExists) {
    motivos.push('Líder não encontrado em group_leaders (inválido ou inexistente).');
  }

  if (row.times_granted_db > row.expectedBonuses_canonical) {
    motivos.push(
      'Inconsistência: timesGranted_db maior que expectedBonuses_correto (excesso no DB vs auditoria).'
    );
  }

  if (row.bonus_registration_ids_in_db_not_in_canonical.length > 0) {
    motivos.push(
      'Risco de duplicidade/lastro: existem convites (bonus_registration_id) fora do conjunto canônico de inscrições pagas.'
    );
  }

  if (row.divergencia_expected_bonuses !== 0) {
    motivos.push(
      'Divergência entre expectedBonuses (produção) e canônico — corrigir dados/cupom antes de gerar convites.'
    );
  }

  for (const code of row.error_classification_row) {
    if (code === 'bonus_reprocessing') {
      motivos.push('Classificação bonus_reprocessing: possível reprocessamento — bloqueado até saneamento.');
    }
    if (code === 'commission_coupon_matching') {
      motivos.push('Cupom da comissão não resolvido de forma segura (commission_coupon_matching).');
    }
    if (code === 'wrongful_count_cupom_referral') {
      motivos.push('Inconsistência cupom/referral nas vendas (wrongful_count_cupom_referral).');
    }
  }

  if (!['invitation', 'both'].includes(String(row.bonus_type))) {
    motivos.push(`bonus_type "${row.bonus_type}" não elegível para convite (esperado invitation ou both).`);
  }

  const apto = motivos.length === 0 && leaderExists;
  return { apto, motivos };
}

function rowToPlanItem(
  row: InvitationBonusAuditCommissionRow,
  apto: boolean,
  motivos: string[],
  eventId: string
): MissingInvitationPlanItem {
  const expected = row.expectedBonuses_canonical;
  const granted = row.times_granted_db;
  const faltantes = Math.max(0, expected - granted);

  const acao_proposta = apto
    ? `Gerar ${faltantes} convite(s) faltante(s) (registration free_bonus + leader_invitations) até atingir expected=${expected}.`
    : 'Nenhuma ação automática — resolver bloqueios listados.';

  const observacao_seguranca = apto
    ? 'Planejamento derivado apenas da auditoria canônica; apply rechecará COUNT no banco antes de cada inserção.'
    : motivos.join(' ');

  return {
    leader_id: row.leader_id,
    commission_id: row.commission_id,
    event_id: eventId,
    required_purchases: row.required_purchases,
    paidCount_correto: row.paidCount_canonical,
    expectedBonuses_correto: expected,
    timesGranted_db: granted,
    faltantes,
    acao_proposta,
    observacao_seguranca,
    status: apto ? 'apto' : 'bloqueado',
    bloqueio_motivos: apto ? [] : motivos,
    observacao_reversibilidade:
      'Convites criados ficam em leader_invitations; inscrições free_bonus podem ser expiradas/canceladas por fluxos existentes (não automático neste serviço).',
  };
}

async function buildDryRunCore(params: {
  event_id: string;
  leader_id?: string | null;
}): Promise<{
  audit: InvitationBonusAuditResult;
  audit_snapshot_hash: string;
  dry_run_hash: string;
  plano: MissingInvitationDeliveryResult['plano_geracao'];
  relatorio_antes: MissingInvitationDeliveryResult['relatorio_antes'];
  leaderScopeKey: string;
  scope_type: MissingInvitationDeliveryResult['scope_type'];
}> {
  const scope_type: MissingInvitationDeliveryResult['scope_type'] = params.leader_id
    ? 'single_leader'
    : 'all_event_leaders';
  const leaderScopeKey = params.leader_id ?? '__all__';

  const audit = await runInvitationBonusAudit({
    event_id: params.event_id,
    leader_id: params.leader_id ?? undefined,
  });

  const audit_snapshot_hash = buildAuditSnapshotHash(audit);

  const bloco_a: MissingInvitationPlanItem[] = [];
  const bloco_b: MissingInvitationPlanItem[] = [];

  let totalFaltantes = 0;

  for (const row of audit.technical_log.rows) {
    const faltantesPre = Math.max(0, row.expectedBonuses_canonical - row.times_granted_db);
    if (faltantesPre <= 0) continue;

    const leaderRes = await query(`SELECT id FROM group_leaders WHERE id = $1`, [row.leader_id]);
    const leaderExists = leaderRes.rows.length > 0;

    const { apto, motivos } = evaluateCommissionForMissingDelivery(row, leaderExists);
    const item = rowToPlanItem(row, apto, motivos, params.event_id);

    if (apto) {
      bloco_a.push(item);
      totalFaltantes += item.faltantes;
    } else {
      bloco_b.push(item);
    }
  }

  const dry_run_hash = hashStable({
    flow: 'missing_invitation_delivery_v1',
    event_id: params.event_id,
    leader_scope: leaderScopeKey,
    audit_snapshot_hash,
    bloco_a: bloco_a.map((x) => ({
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      faltantes: x.faltantes,
    })),
    bloco_b: bloco_b.map((x) => ({
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      faltantes: x.faltantes,
      motivos: x.bloqueio_motivos,
    })),
  });

  const relatorio_antes = {
    total_linhas_comissao_escopo: audit.technical_log.rows.length,
    total_faltantes_somado: totalFaltantes,
    total_aptos_gerar: bloco_a.length,
    total_bloqueados: bloco_b.length,
    calculation_source: 'fase1_audit_canonical' as const,
  };

  return {
    audit,
    audit_snapshot_hash,
    dry_run_hash,
    plano: { bloco_a_aptos: bloco_a, bloco_b_bloqueados: bloco_b },
    relatorio_antes,
    leaderScopeKey,
    scope_type,
  };
}

async function countTimesGrantedDb(
  client: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  leaderId: string,
  eventId: string,
  commissionId: string
): Promise<number> {
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM leader_invitations
     WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3
       AND status IN ('available', 'sent', 'used')`,
    [leaderId, eventId, commissionId]
  );
  return ((r.rows[0] as { c: number }).c ?? 0) as number;
}

/**
 * Insere registration free_bonus + leader_invitation na mesma conexão (transação externa).
 */
async function insertOneMissingInviteSlot(
  client: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  params: {
    eventId: string;
    groupLeaderId: string;
    leaderUserId: string;
    categoryId: string;
    commissionId: string;
  }
): Promise<{ registrationId: string; invitationId: string }> {
  const confirmationCode = `REG-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
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

  const inv = await client.query(
    `INSERT INTO leader_invitations (
      leader_id, bonus_registration_id, event_id, status, commission_id
    ) VALUES ($1, $2, $3, 'available', $4)
    RETURNING id::text AS id`,
    [params.groupLeaderId, registrationId, params.eventId, params.commissionId]
  );
  const invitationId = (inv.rows[0] as { id: string }).id;
  return { registrationId, invitationId };
}

export async function runMissingInvitationDelivery(
  params: MissingInvitationDeliveryRequest
): Promise<MissingInvitationDeliveryResult> {
  const core = await buildDryRunCore({
    event_id: params.event_id,
    leader_id: params.leader_id ?? undefined,
  });

  const base: MissingInvitationDeliveryResult = {
    mode: 'dry_run',
    flow: 'missing_invitation_delivery_v1',
    event_id: params.event_id,
    leader_id: params.leader_id ?? null,
    scope_type: core.scope_type,
    audit_snapshot_hash: core.audit_snapshot_hash,
    dry_run_hash: core.dry_run_hash,
    consistency_guard: {
      can_apply: core.plano.bloco_a_aptos.length > 0,
      reason:
        core.plano.bloco_a_aptos.length > 0
          ? 'Existem comissões aptas com faltantes > 0; apply exige hashes + confirmação.'
          : 'Nenhuma comissão apta para geração no escopo atual (ver bloco bloqueados).',
      expected_event_id: params.event_id,
      expected_leader_scope: core.leaderScopeKey,
      expected_audit_snapshot_hash: core.audit_snapshot_hash,
      expected_dry_run_hash: core.dry_run_hash,
    },
    relatorio_antes: core.relatorio_antes,
    plano_geracao: core.plano,
  };

  if (params.mode === 'dry_run') {
    return base;
  }

  if (!params.audit_snapshot_hash || !params.dry_run_hash) {
    throw appError('Para apply, audit_snapshot_hash e dry_run_hash são obrigatórios.', 400);
  }

  const sameAudit = params.audit_snapshot_hash === core.audit_snapshot_hash;
  const sameDry = params.dry_run_hash === core.dry_run_hash;
  if (!sameAudit || !sameDry) {
    throw appError(
      'Divergência de consistência. Execute novo dry_run no mesmo evento/escopo antes do apply.',
      409
    );
  }

  if (!params.apply_confirmed) {
    throw appError('apply_confirmed é obrigatório para mode=apply.', 400);
  }
  if (!params.executed_by) {
    throw appError('executed_by é obrigatório para mode=apply.', 400);
  }

  if (core.plano.bloco_a_aptos.length === 0) {
    throw appError('Não há itens aptos para apply.', 400);
  }

  // Default category for event (mesma lógica conceitual do leaderBonusService)
  const catRes = await query(
    `SELECT id::text AS id FROM categories
     WHERE event_id = $1
     ORDER BY is_default DESC, price ASC, created_at ASC
     LIMIT 1`,
    [params.event_id]
  );
  if (catRes.rows.length === 0) {
    throw appError('Nenhuma categoria disponível para o evento.', 400);
  }
  const defaultCategoryId = (catRes.rows[0] as { id: string }).id;

  const allInvitationIds: string[] = [];
  const allRegistrationIds: string[] = [];
  type PorComissaoRow = {
    leader_id: string;
    commission_id: string;
    criados_neste_apply: number;
    leader_invitation_ids: string[];
  };
  const porComissaoList: PorComissaoRow[] = [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const item of core.plano.bloco_a_aptos) {
      const leader = await getGroupLeaderById(item.leader_id);
      if (!leader?.user_id) {
        throw appError(`Líder ${item.leader_id} inválido no momento do apply.`, 400);
      }

      const expected = item.expectedBonuses_correto;
      let createdHere = 0;
      const idsHere: string[] = [];
      const regsHere: string[] = [];

      // Limite: nunca ultrapassar expected; rechecagem a cada passo evita duplicidade
      let safety = 0;
      const maxLoops = item.faltantes + 5;

      while (safety < maxLoops) {
        safety++;
        const current = await countTimesGrantedDb(client, item.leader_id, params.event_id, item.commission_id);
        if (current >= expected) break;

        const { registrationId, invitationId } = await insertOneMissingInviteSlot(client, {
          eventId: params.event_id,
          groupLeaderId: item.leader_id,
          leaderUserId: leader.user_id,
          categoryId: defaultCategoryId,
          commissionId: item.commission_id,
        });
        createdHere++;
        idsHere.push(invitationId);
        regsHere.push(registrationId);
        allInvitationIds.push(invitationId);
        allRegistrationIds.push(registrationId);

        const after = await countTimesGrantedDb(client, item.leader_id, params.event_id, item.commission_id);
        if (after > expected) {
          throw appError(
            `Segurança: após inserção, timesGranted (${after}) > expected (${expected}) para comissão ${item.commission_id}.`,
            500
          );
        }
      }

      if (createdHere > 0) {
        porComissaoList.push({
          leader_id: item.leader_id,
          commission_id: item.commission_id,
          criados_neste_apply: createdHere,
          leader_invitation_ids: idsHere,
        });
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    ...base,
    mode: 'apply',
    relatorio_depois: {
      convites_criados_total: allInvitationIds.length,
      leader_invitation_ids_criados: allInvitationIds,
      registration_ids_bonus_criados: allRegistrationIds,
      por_comissao: porComissaoList,
      nota: `Apply executado por usuário ${params.executed_by}; geração idempotente por COUNT leader_invitations (available|sent|used) vs expectedBonuses_correto.`,
    },
  };
}
