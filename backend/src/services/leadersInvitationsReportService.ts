import { query } from '../config/database.js';

export interface LeadersInvitationsGrantedRow {
  leader_id: string;
  leader_name: string | null;
  invitations_granted: number;
}

/**
 * Counts leader_invitations for a given event (read-only).
 * "Convites ganhos" = invitations in statuses available/sent/used.
 */
export const getLeadersInvitationsGrantedByEvent = async (
  eventId: string
): Promise<LeadersInvitationsGrantedRow[]> => {
  const result = await query(
    `SELECT
       li.leader_id::text AS leader_id,
       p.full_name AS leader_name,
       COUNT(*)::int AS invitations_granted
     FROM leader_invitations li
     LEFT JOIN group_leaders gl
       ON gl.id = li.leader_id
     LEFT JOIN profiles p
       ON p.id = gl.user_id
     WHERE li.event_id = $1
       AND li.status IN ('available', 'sent', 'used')
     GROUP BY li.leader_id, p.full_name
     ORDER BY invitations_granted DESC`,
    [eventId]
  );

  return (result.rows as { leader_id: string; leader_name: string | null; invitations_granted: number }[]).map(
    (r) => ({
      leader_id: r.leader_id,
      leader_name: r.leader_name ?? null,
      invitations_granted: parseInt(String(r.invitations_granted), 10) || 0,
    })
  );
};

