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

/** Cidade / bairro: trim + colapsar espaços + Title Case inteligente. */
export function normalizePlaceName(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return applyTitleCaseWords(String(value));
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

/** trim + lowercase */
export function normalizeEmail(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return String(value).trim().toLowerCase();
}
