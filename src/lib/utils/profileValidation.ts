import { normalizePhoneDigits, normalizePostalCode, normalizePlaceName, normalizeEmail } from './profileNormalization';

export const FULL_NAME_VALIDATION_MESSAGE =
  'Informe o nome completo (nome e sobrenome).';

export const FULL_NAME_CHARACTERS_MESSAGE =
  'O nome deve conter apenas letras e sobrenome.';

export const PHONE_VALIDATION_MESSAGE = 'Telefone inválido.';

export const POSTAL_CODE_VALIDATION_MESSAGE = 'CEP inválido.';

export const CITY_VALIDATION_MESSAGE = 'Cidade inválida.';

export const NEIGHBORHOOD_VALIDATION_MESSAGE = 'Bairro inválido.';

export const BIRTH_DATE_VALIDATION_MESSAGE = 'Data de nascimento inválida.';

export const GENDER_VALIDATION_MESSAGE = 'Sexo inválido.';

export const EMAIL_VALIDATION_MESSAGE = 'E-mail inválido.';

export const ALLOWED_GENDERS = ['M', 'F', 'O'] as const;

export type AllowedGender = (typeof ALLOWED_GENDERS)[number];

/** Letters (incl. accents), spaces, hyphen and apostrophe only. */
const VALID_NAME_CHARACTERS_PATTERN = /^[\p{L}\s'-]+$/u;

export interface ProfileFieldValidationResult {
  valid: boolean;
  message?: string;
}

function collapseNameSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function hasInvalidNameCharacters(value: string): boolean {
  return !VALID_NAME_CHARACTERS_PATTERN.test(value);
}

function isAllSameDigit(digits: string): boolean {
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

function countLetters(value: string): number {
  return (value.match(/\p{L}/gu) ?? []).length;
}

export function validateFullName(
  value: string | null | undefined
): ProfileFieldValidationResult {
  if (value == null || String(value).trim() === '') {
    return { valid: false, message: FULL_NAME_VALIDATION_MESSAGE };
  }

  const normalized = collapseNameSpaces(String(value));

  if (hasInvalidNameCharacters(normalized)) {
    return { valid: false, message: FULL_NAME_CHARACTERS_MESSAGE };
  }

  const words = normalized.split(' ').filter(Boolean);

  if (words.length < 2) {
    return { valid: false, message: FULL_NAME_VALIDATION_MESSAGE };
  }

  for (const word of words) {
    if (word.length < 2) {
      return { valid: false, message: FULL_NAME_VALIDATION_MESSAGE };
    }
  }

  return { valid: true };
}

export function validatePhone(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  const digits = normalizePhoneDigits(value);

  if (!digits) {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message: PHONE_VALIDATION_MESSAGE };
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return { valid: false, message: PHONE_VALIDATION_MESSAGE };
  }

  if (isAllSameDigit(digits)) {
    return { valid: false, message: PHONE_VALIDATION_MESSAGE };
  }

  return { valid: true };
}

export function validatePostalCode(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  const digits = normalizePostalCode(value);

  if (!digits) {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message: POSTAL_CODE_VALIDATION_MESSAGE };
  }

  if (digits.length !== 8) {
    return { valid: false, message: POSTAL_CODE_VALIDATION_MESSAGE };
  }

  if (isAllSameDigit(digits)) {
    return { valid: false, message: POSTAL_CODE_VALIDATION_MESSAGE };
  }

  return { valid: true };
}

function validatePlaceNameCore(
  value: string | null | undefined,
  message: string,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  if (value == null || String(value).trim() === '') {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message };
  }

  const normalized = normalizePlaceName(value);

  if (countLetters(normalized) < 2) {
    return { valid: false, message };
  }

  if (/^[\d\s]+$/.test(normalized)) {
    return { valid: false, message };
  }

  return { valid: true };
}

export function validateCity(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  return validatePlaceNameCore(value, CITY_VALIDATION_MESSAGE, options);
}

export function validateNeighborhood(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  return validatePlaceNameCore(value, NEIGHBORHOOD_VALIDATION_MESSAGE, options);
}

function calculateAgeFromBirthDate(birthDate: Date, referenceDate = new Date()): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

function parseBirthDate(value: string): Date | null {
  const normalized = String(value).trim().split('T')[0];
  const parsed = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function validateBirthDateRange(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean; minAge?: number; maxAge?: number }
): ProfileFieldValidationResult {
  const minAge = options?.minAge ?? 8;
  const maxAge = options?.maxAge ?? 120;

  if (value == null || String(value).trim() === '') {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message: BIRTH_DATE_VALIDATION_MESSAGE };
  }

  const parsed = parseBirthDate(String(value));
  if (!parsed) {
    return { valid: false, message: BIRTH_DATE_VALIDATION_MESSAGE };
  }

  const age = calculateAgeFromBirthDate(parsed);
  if (age < minAge || age > maxAge) {
    return { valid: false, message: BIRTH_DATE_VALIDATION_MESSAGE };
  }

  return { valid: true };
}

export function normalizeGender(
  value: string | null | undefined
): AllowedGender | '' {
  if (value == null) return '';
  const normalized = String(value).trim().toUpperCase();
  return ALLOWED_GENDERS.includes(normalized as AllowedGender)
    ? (normalized as AllowedGender)
    : '';
}

export function validateGender(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  if (value == null || String(value).trim() === '') {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message: GENDER_VALIDATION_MESSAGE };
  }

  if (!normalizeGender(value)) {
    return { valid: false, message: GENDER_VALIDATION_MESSAGE };
  }

  return { valid: true };
}

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactEmail(
  value: string | null | undefined,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  if (value == null || String(value).trim() === '') {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message: EMAIL_VALIDATION_MESSAGE };
  }

  const normalized = normalizeEmail(value);
  if (!EMAIL_FORMAT_PATTERN.test(normalized)) {
    return { valid: false, message: EMAIL_VALIDATION_MESSAGE };
  }

  return { valid: true };
}
