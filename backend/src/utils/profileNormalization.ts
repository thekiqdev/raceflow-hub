/**
 * Normalização de campos de perfil.
 */

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

const NAME_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function capitalizeSegment(segment: string): string {
  if (!segment) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

function capitalizeWordPart(part: string): string {
  if (!part) return part;
  return part
    .split("'")
    .map((chunk) => capitalizeSegment(chunk))
    .join("'");
}

function capitalizeToken(token: string, isParticlePosition: boolean): string {
  const lower = token.toLowerCase();
  if (isParticlePosition && NAME_PARTICLES.has(lower)) {
    return lower;
  }
  return token
    .split('-')
    .map((part) => capitalizeWordPart(part))
    .join('-');
}

function applyTitleCaseWords(value: string): string {
  const collapsed = collapseWhitespace(value);
  if (!collapsed) return '';

  const tokens = collapsed.split(' ');
  const lastIndex = tokens.length - 1;

  return tokens
    .map((token, index) =>
      capitalizeToken(token, index > 0 && index < lastIndex)
    )
    .join(' ');
}

/** trim + colapsar espaços + Title Case inteligente (partículas em minúsculo). */
export function normalizePersonName(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return applyTitleCaseWords(String(value));
}

/** trim + lowercase */
export function normalizeEmail(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

/** Remove máscara; mantém string vazia se não houver dígitos. */
export function normalizePhoneDigits(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return String(value).replace(/\D/g, '');
}

/** Remove máscara do CEP (8 dígitos quando preenchido). */
export function normalizePostalCode(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return String(value).replace(/\D/g, '');
}

/** Cidade / bairro: trim + colapsar espaços + Title Case inteligente. */
export function normalizePlaceName(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return applyTitleCaseWords(String(value));
}

/** Logradouro: trim + colapsar espaços (números permitidos). */
export function normalizeStreet(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return collapseWhitespace(String(value));
}

export type ProfileNormalizationInput = {
  full_name?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

/** Aplica normalização aos campos de update de perfil presentes no objeto. */
export function normalizeProfileUpdateFields<T extends ProfileNormalizationInput>(data: T): T {
  const result = { ...data };

  if (result.full_name !== undefined && result.full_name !== null) {
    result.full_name = normalizePersonName(result.full_name);
  }
  if (result.phone !== undefined && result.phone !== null) {
    result.phone = normalizePhoneDigits(result.phone);
  }
  if (result.postal_code !== undefined && result.postal_code !== null) {
    result.postal_code = normalizePostalCode(result.postal_code);
  }
  if (result.street !== undefined && result.street !== null) {
    result.street = normalizeStreet(result.street);
  }
  if (result.neighborhood !== undefined && result.neighborhood !== null) {
    result.neighborhood = normalizePlaceName(result.neighborhood);
  }
  if (result.city !== undefined && result.city !== null) {
    result.city = normalizePlaceName(result.city);
  }
  if (result.contact_email !== undefined && result.contact_email !== null) {
    result.contact_email = normalizeEmail(result.contact_email);
  }
  if (result.contact_phone !== undefined && result.contact_phone !== null) {
    result.contact_phone = normalizePhoneDigits(result.contact_phone);
  }

  return result;
}
