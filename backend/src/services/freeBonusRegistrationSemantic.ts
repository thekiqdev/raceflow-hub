/**
 * Classificação semântica de registrations com payment_method = 'free_bonus'.
 * Etapa 1: heurística em código (sem coluna nova no schema).
 * Migração futura opcional: coluna `free_bonus_origin` ou equivalente — ver docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md
 */

import { query } from '../config/database.js';

export type FreeBonusSemanticKind =
  | 'BONUS_INVITATION_CANONICO'
  | 'FREE_BONUS_ADMINISTRATIVO'
  | 'FREE_BONUS_INVALIDO_SEM_LASTRO'
  | 'FREE_BONUS_LEGADO_OUTRO';

export interface FreeBonusSemanticRow {
  registration_id: string;
  payment_method: string | null;
  runner_id: string | null;
  registered_by: string | null;
  payment_status: string | null;
}

/**
 * Classifica uma linha já carregada (sem query extra).
 * - Com lastro em leader_invitations → BONUS_INVITATION_CANONICO
 * - Sem lastro e registered_by ≠ runner_id → típico de inscrição criada por organizador/admin → FREE_BONUS_ADMINISTRATIVO
 * - Sem lastro e runner_id === registered_by → lixo ou legado ambíguo → FREE_BONUS_INVALIDO_SEM_LASTRO ou LEGADO_OUTRO
 */
export function classifyFreeBonusSemantic(
  row: FreeBonusSemanticRow,
  hasCanonicalInvitationLastro: boolean
): FreeBonusSemanticKind {
  if (row.payment_method !== 'free_bonus') {
    return 'FREE_BONUS_LEGADO_OUTRO';
  }
  if (hasCanonicalInvitationLastro) {
    return 'BONUS_INVITATION_CANONICO';
  }
  const run = row.runner_id;
  const regBy = row.registered_by;
  if (run && regBy && run !== regBy) {
    return 'FREE_BONUS_ADMINISTRATIVO';
  }
  return 'FREE_BONUS_INVALIDO_SEM_LASTRO';
}

/**
 * Classifica por id: consulta registration e existência de leader_invitations.bonus_registration_id.
 */
export async function classifyFreeBonusRegistrationById(registrationId: string): Promise<{
  kind: FreeBonusSemanticKind;
  row: FreeBonusSemanticRow | null;
}> {
  const r = await query(
    `SELECT r.id::text AS registration_id, r.payment_method::text AS payment_method,
            r.runner_id::text AS runner_id, r.registered_by::text AS registered_by,
            r.payment_status::text AS payment_status
     FROM registrations r WHERE r.id = $1`,
    [registrationId]
  );
  if (r.rows.length === 0) {
    return { kind: 'FREE_BONUS_LEGADO_OUTRO', row: null };
  }
  const row = r.rows[0] as FreeBonusSemanticRow;

  const li = await query(
    `SELECT 1 FROM leader_invitations WHERE bonus_registration_id = $1 LIMIT 1`,
    [registrationId]
  );
  const hasLastro = li.rows.length > 0;
  const kind = classifyFreeBonusSemantic(row, hasLastro);
  return { kind, row };
}
