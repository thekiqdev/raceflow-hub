export type EventType = 'NORMAL' | 'EXTERNAL';

export function isExternalEvent(event?: { event_type?: string | null } | null): boolean {
  return event?.event_type === 'EXTERNAL';
}

export const EXTERNAL_EVENT_BADGE_LABEL = 'Evento Externo';
