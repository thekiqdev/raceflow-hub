import { query } from '../config/database.js';

export interface EventGeneralStats {
  total_registrations: number;
  confirmed_registrations: number;
  transferred_registrations: number;
  cancelled_registrations: number;
  paid_registrations: number;
  pix_count: number;
  card_count: number;
  free_bonus_count: number;
  invited_count: number;
  from_invitation_count: number;
  free_bonus_admin_count: number;
  normal_paid_count: number;
}

/**
 * Resumo geral do evento (read-only) a partir de registrations.
 * Convites: apenas EXISTS em leader_invitations (sem alterar domínio de convites).
 */
export async function getEventGeneralStats(eventId: string): Promise<EventGeneralStats> {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total_registrations,
       COUNT(*) FILTER (WHERE r.status = 'confirmed')::int AS confirmed_registrations,
       COUNT(*) FILTER (WHERE r.status = 'transferred')::int AS transferred_registrations,
       COUNT(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled_registrations,
       COUNT(*) FILTER (WHERE r.payment_status = 'paid')::int AS paid_registrations,
       COUNT(*) FILTER (
         WHERE r.payment_status = 'paid' AND r.payment_method = 'pix'
       )::int AS pix_count,
       COUNT(*) FILTER (
         WHERE r.payment_status = 'paid' AND r.payment_method = 'credit_card'
       )::int AS card_count,
       COUNT(*) FILTER (WHERE r.payment_method = 'free_bonus')::int AS free_bonus_count,
       COUNT(*) FILTER (WHERE r.payment_status = 'convidado')::int AS invited_count,
       COUNT(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM leader_invitations li
           WHERE li.bonus_registration_id = r.id
         )
       )::int AS from_invitation_count,
       COUNT(*) FILTER (
         WHERE r.payment_method = 'free_bonus'
           AND NOT EXISTS (
             SELECT 1 FROM leader_invitations li
             WHERE li.bonus_registration_id = r.id
           )
       )::int AS free_bonus_admin_count,
       COUNT(*) FILTER (
         WHERE r.payment_status = 'paid'
           AND (r.payment_method IS NULL OR r.payment_method <> 'free_bonus')
           AND NOT EXISTS (
             SELECT 1 FROM leader_invitations li
             WHERE li.bonus_registration_id = r.id
           )
       )::int AS normal_paid_count
     FROM registrations r
     WHERE r.event_id = $1`,
    [eventId]
  );

  const row = result.rows[0] as Record<string, unknown>;

  const int = (key: string) => parseInt(String(row[key] ?? 0), 10) || 0;

  return {
    total_registrations: int('total_registrations'),
    confirmed_registrations: int('confirmed_registrations'),
    transferred_registrations: int('transferred_registrations'),
    cancelled_registrations: int('cancelled_registrations'),
    paid_registrations: int('paid_registrations'),
    pix_count: int('pix_count'),
    card_count: int('card_count'),
    free_bonus_count: int('free_bonus_count'),
    invited_count: int('invited_count'),
    from_invitation_count: int('from_invitation_count'),
    free_bonus_admin_count: int('free_bonus_admin_count'),
    normal_paid_count: int('normal_paid_count'),
  };
}
