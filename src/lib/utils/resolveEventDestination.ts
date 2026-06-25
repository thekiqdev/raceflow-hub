import type { NavigateFunction } from 'react-router-dom';
import { isExternalEvent } from '@/lib/utils/eventType';
import { getEffectiveRegistrationStatus } from '@/lib/utils/eventRegistration';
import type { Event } from '@/lib/api/events';

export type EventDestination =
  | { type: 'event_page'; path: string }
  | { type: 'external_url'; url: string }
  | { type: 'results'; url: string }
  | { type: 'paused' };

export interface EventNavigationInput {
  id: string;
  slug?: string | null;
  event_type?: string | null;
  external_url?: string | null;
  result_url?: string | null;
  registration_status?: Event['registration_status'];
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
  status?: Event['status'];
}

export function normalizeResolvableUrl(url: string): string {
  let resolved = url.trim();
  if (!resolved.includes('${')) {
    return resolved;
  }

  const port = typeof window !== 'undefined' ? window.location.port || '3001' : '3001';
  resolved = resolved.replace(/\$\{API_PORT\}/g, port);
  if (resolved.includes('${')) {
    resolved = resolved.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
  }
  return resolved;
}

export function hasPublishedResults(event: Pick<EventNavigationInput, 'result_url'>): boolean {
  return Boolean(event.result_url?.trim());
}

/**
 * Decide para onde o atleta deve ir ao interagir com um card de evento.
 * Eventos externos nunca retornam página pública interna (/evento/:slug).
 */
export function resolveEventDestination(event: EventNavigationInput): EventDestination {
  if (isExternalEvent(event)) {
    if (hasPublishedResults(event)) {
      return { type: 'results', url: normalizeResolvableUrl(event.result_url!) };
    }

    if (getEffectiveRegistrationStatus(event as Event) === 'closed') {
      return { type: 'paused' };
    }

    const externalUrl = event.external_url?.trim();
    if (externalUrl) {
      return { type: 'external_url', url: normalizeResolvableUrl(externalUrl) };
    }

    return { type: 'external_url', url: '/' };
  }

  const path = event.slug ? `/evento/${event.slug}` : `/events/${event.id}`;
  return { type: 'event_page', path };
}

export function applyEventDestination(
  destination: EventDestination,
  navigate: NavigateFunction,
  options?: { replace?: boolean }
): void {
  switch (destination.type) {
    case 'event_page':
      navigate(destination.path, { replace: options?.replace });
      break;
    case 'external_url':
      window.open(destination.url, '_blank', 'noopener,noreferrer');
      break;
    case 'results':
      window.open(destination.url, '_blank', 'noopener,noreferrer');
      break;
    case 'paused':
      break;
  }
}

export function openEventFromCard(
  event: EventNavigationInput,
  navigate: NavigateFunction,
  options?: { replace?: boolean }
): void {
  applyEventDestination(resolveEventDestination(event), navigate, options);
}

export function openPublishedResults(event: Pick<EventNavigationInput, 'result_url'>): void {
  if (!hasPublishedResults(event)) return;
  window.open(normalizeResolvableUrl(event.result_url!), '_blank', 'noopener,noreferrer');
}

export function openExternalRegistrationUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  window.open(normalizeResolvableUrl(trimmed), '_blank', 'noopener,noreferrer');
}
