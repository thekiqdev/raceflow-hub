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
  const result = await query(
    'SELECT contact_phone, phone FROM profiles WHERE id = $1',
    [organizerId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const fromContactPhone = normalizeWhatsAppDigits(row.contact_phone);
  if (fromContactPhone) {
    console.log(
      `[CONTACT_WHATSAPP] source=organizer_contact_phone organizerId=${organizerId}`
    );
    return { phone: fromContactPhone, source: 'organizer' };
  }

  const fromPhone = normalizeWhatsAppDigits(row.phone);
  if (fromPhone) {
    console.log(`[CONTACT_WHATSAPP] source=organizer_phone organizerId=${organizerId}`);
    return { phone: fromPhone, source: 'organizer' };
  }

  return null;
}

async function resolveAdminWhatsApp(
  organizerId?: string | null
): Promise<ResolvedWhatsApp | null> {
  const [homeSettings, systemSettings] = await Promise.all([
    getHomePageSettings(),
    getSystemSettings(),
  ]);

  const organizerSuffix = organizerId ? ` organizerId=${organizerId}` : '';

  const candidates: Array<{ raw: string | null | undefined; logSource: string }> = [
    { raw: homeSettings?.whatsapp_number, logSource: 'admin_home' },
    { raw: systemSettings.support_phone, logSource: 'admin_support' },
    { raw: systemSettings.contact_phone, logSource: 'admin_contact' },
  ];

  for (const { raw, logSource } of candidates) {
    const phone = normalizeWhatsAppDigits(raw);
    if (phone) {
      console.log(`[CONTACT_WHATSAPP] source=${logSource}${organizerSuffix}`);
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

  return resolveAdminWhatsApp(params.organizerId);
}
