import { apiClient } from './client.js';

export interface ChangeOrganizerResponse {
  success: boolean;
  status: 'success' | 'skipped' | 'error' | 'inconsistent';
  migration_id?: string;
  event_id?: string;
  organizer_from?: string;
  organizer_to?: string;
  executed_by?: string;
  message?: string;
  idempotent?: boolean;
  dry_run?: boolean;
  summary?: {
    total_coupons?: number;
    exclusivos?: number;
    compartilhados?: number;
    leaders_to_create?: number;
    leaders_to_reuse?: number;
    conflicts?: number;
    invitations_to_update?: number;
  };
  leaders_resolved?: { total: number; added_to_b: number; reused_in_b: number };
  invitations_updated?: number;
  coupons_migrated?: { exclusives: number; shared: number; code_conflicts: number };
  contact_messages_updated?: number;
  validation_errors?: string[];
}

/**
 * Altera o organizador de um evento (migração).
 * POST /api/admin/events/:eventId/change-organizer
 * Body: { new_organizer_id: string, dry_run?: boolean }
 */
export const changeEventOrganizer = async (
  eventId: string,
  newOrganizerId: string,
  dryRun = false
): Promise<ChangeOrganizerResponse> => {
  const response = await apiClient.post<ChangeOrganizerResponse>(
    `/admin/events/${eventId}/change-organizer`,
    { new_organizer_id: newOrganizerId, dry_run: dryRun }
  );
  return response as unknown as ChangeOrganizerResponse;
};
