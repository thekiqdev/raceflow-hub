import { query } from '../config/database.js';
import { getHomePageSettings } from './homePageSettingsService.js';
import { getSystemSettings } from './systemSettingsService.js';

export type WhatsAppSource = 'organizer' | 'admin';

export interface ResolvedWhatsApp {
  phone: string;
  source: WhatsAppSource;
}

/**
 * Normaliza um telefone para uso em wa.me (somente dígitos, com DDI quando aplicável).
 */
export function normalizeWhatsAppDigits(raw?: string | null): string | null {
  if (raw == null) {
    return null;
  }

  const digits = String(raw).replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.length < 10) {
    return null;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  if (digits.length >= 12) {
    return digits;
  }

  return null;
}

async function resolveOrganizerWhatsApp(
  organizerId: string
): Promise<ResolvedWhatsApp | null> {
  const result = await query('SELECT contact_phone FROM profiles WHERE id = $1', [
    organizerId,
  ]);

  const phone = normalizeWhatsAppDigits(result.rows[0]?.contact_phone);
  if (!phone) {
    return null;
  }

  return { phone, source: 'organizer' };
}

async function resolveAdminWhatsApp(): Promise<ResolvedWhatsApp | null> {
  const [homeSettings, systemSettings] = await Promise.all([
    getHomePageSettings(),
    getSystemSettings(),
  ]);

  const candidates = [
    homeSettings?.whatsapp_number,
    systemSettings.support_phone,
    systemSettings.contact_phone,
  ];

  for (const raw of candidates) {
    const phone = normalizeWhatsAppDigits(raw);
    if (phone) {
      return { phone, source: 'admin' };
    }
  }

  return null;
}

/**
 * Resolve o WhatsApp a ser aberto após envio do formulário de contato.
 * Falha retorna null — nunca lança para o controller (try/catch externo como rede de segurança).
 */
export async function resolveWhatsAppForContactMessage(params: {
  type: 'event' | 'platform';
  organizerId?: string | null;
}): Promise<ResolvedWhatsApp | null> {
  if (params.type === 'event' && params.organizerId) {
    const organizerWhatsApp = await resolveOrganizerWhatsApp(params.organizerId);
    if (organizerWhatsApp) {
      return organizerWhatsApp;
    }
  }

  return resolveAdminWhatsApp();
}
