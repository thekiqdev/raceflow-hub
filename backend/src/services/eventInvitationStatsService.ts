import { query } from '../config/database.js';

export const EVENT_INVITATION_STATS_RULES_VERSION = 'canonical-v1';

export interface EventInvitationStats {
  event_id: string;
  total_invitations: number;
  available_invitations: number;
  sent_invitations: number;
  used_invitations: number;
  expired_invitations: number;
  conversion_rate: number | null;
  revenue_from_invitations: number;
  paid_registrations_from_invitations: number;
  valid_invitations: number;
  orphan_free_bonus_count: number;
  inconsistent_invitations: number;
  computed_at: string;
  rules_version: string;
}

/**
 * Estatísticas agregadas de convites do evento (read-only).
 * Fonte: leader_invitations; lastro via bonus_registration_id → registrations.
 */
export async function getEventInvitationStats(eventId: string): Promise<EventInvitationStats> {
  const [
    statusResult,
    validResult,
    revenueResult,
    orphanResult,
    inconsistentResult,
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE li.status = 'available')::int AS available,
         COUNT(*) FILTER (WHERE li.status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE li.status = 'used')::int AS used,
         COUNT(*) FILTER (WHERE li.status = 'expired')::int AS expired
       FROM leader_invitations li
       WHERE li.event_id = $1`,
      [eventId]
    ),
    query(
      `SELECT COUNT(*)::int AS valid_count
       FROM leader_invitations li
       INNER JOIN registrations r ON r.id = li.bonus_registration_id
       WHERE li.event_id = $1
         AND li.status IN ('available', 'sent', 'used')`,
      [eventId]
    ),
    query(
      `SELECT
         COUNT(*)::int AS paid_count,
         COALESCE(SUM(r.total_amount), 0)::numeric AS revenue_gross
       FROM leader_invitations li
       INNER JOIN registrations r ON r.id = li.bonus_registration_id
       WHERE li.event_id = $1
         AND r.payment_status = 'paid'
         AND NOT (
           r.status = 'transferred'
           AND r.transferred_to_registration_id IS NOT NULL
         )`,
      [eventId]
    ),
    query(
      `SELECT COUNT(*)::int AS orphan_count
       FROM registrations r
       WHERE r.event_id = $1
         AND r.payment_method = 'free_bonus'
         AND NOT EXISTS (
           SELECT 1 FROM leader_invitations li
           WHERE li.bonus_registration_id = r.id
         )`,
      [eventId]
    ),
    query(
      `SELECT COUNT(*)::int AS inconsistent_count
       FROM leader_invitations li
       LEFT JOIN registrations r ON r.id = li.bonus_registration_id
       WHERE li.event_id = $1
         AND r.id IS NULL`,
      [eventId]
    ),
  ]);

  const statusRow = statusResult.rows[0] as {
    available: number;
    sent: number;
    used: number;
    expired: number;
  };

  const available_invitations = parseInt(String(statusRow?.available ?? 0), 10) || 0;
  const sent_invitations = parseInt(String(statusRow?.sent ?? 0), 10) || 0;
  const used_invitations = parseInt(String(statusRow?.used ?? 0), 10) || 0;
  const expired_invitations = parseInt(String(statusRow?.expired ?? 0), 10) || 0;
  const total_invitations = available_invitations + sent_invitations + used_invitations;

  const valid_invitations =
    parseInt(String((validResult.rows[0] as { valid_count?: number })?.valid_count ?? 0), 10) || 0;

  const revenueRow = revenueResult.rows[0] as {
    paid_count?: number;
    revenue_gross?: string | number;
  };
  const paid_registrations_from_invitations =
    parseInt(String(revenueRow?.paid_count ?? 0), 10) || 0;
  const revenue_from_invitations = Math.round(parseFloat(String(revenueRow?.revenue_gross ?? 0)) * 100) / 100;

  const orphan_free_bonus_count =
    parseInt(String((orphanResult.rows[0] as { orphan_count?: number })?.orphan_count ?? 0), 10) || 0;

  const inconsistent_invitations =
    parseInt(
      String((inconsistentResult.rows[0] as { inconsistent_count?: number })?.inconsistent_count ?? 0),
      10
    ) || 0;

  const conversion_rate =
    total_invitations > 0 ? Math.round((sent_invitations / total_invitations) * 10000) / 10000 : null;

  return {
    event_id: eventId,
    total_invitations,
    available_invitations,
    sent_invitations,
    used_invitations,
    expired_invitations,
    conversion_rate,
    revenue_from_invitations,
    paid_registrations_from_invitations,
    valid_invitations,
    orphan_free_bonus_count,
    inconsistent_invitations,
    computed_at: new Date().toISOString(),
    rules_version: EVENT_INVITATION_STATS_RULES_VERSION,
  };
}
