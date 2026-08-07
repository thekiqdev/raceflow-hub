import {
  normalizePhoneDigits,
  normalizePostalCode,
  normalizePlaceName,
  normalizeEmail,
} from './profileNormalization.js';
import {
  recordProfileValidationRejection,
  recordProfileValidationPass,
  type ProfileValidationMetricCode,
} from './profileValidationMetrics.js';

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

export interface ProfileValidationAssertOptions {
  allowEmpty?: boolean;
  source?: string;
}

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

function rejectValidation(
  code: Exclude<ProfileValidationMetricCode, 'VALIDATION_PASS'>,
  source: string | undefined,
  message: string
): never {
  recordProfileValidationRejection(code, source ?? 'unknown');
  throw new Error(message);
}

function acceptValidation(source: string | undefined): void {
  if (source) {
    recordProfileValidationPass(source);
  }
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

/**
 * Validates full_name: at least two words (each ≥ 2 chars), letters only
 * (with accents, hyphen, apostrophe). Collapses duplicate spaces before checking.
 */
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

export function assertValidFullName(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validateFullName(value);
  if (!result.valid) {
    rejectValidation('INVALID_FULL_NAME', options?.source, result.message ?? FULL_NAME_VALIDATION_MESSAGE);
  }
  acceptValidation(options?.source);
}

/** Brazilian phone: 10 or 11 digits; blocks trivial/repeated sequences. */
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

export function assertValidPhone(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validatePhone(value, options);
  if (!result.valid) {
    rejectValidation('INVALID_PHONE', options?.source, result.message ?? PHONE_VALIDATION_MESSAGE);
  }
  acceptValidation(options?.source);
}

export function assertValidContactPhone(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validatePhone(value, options);
  if (!result.valid) {
    rejectValidation(
      'INVALID_CONTACT_PHONE',
      options?.source,
      result.message ?? PHONE_VALIDATION_MESSAGE
    );
  }
  acceptValidation(options?.source);
}

/** Brazilian CEP: exactly 8 digits; blocks trivial/repeated sequences. */
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

export function assertValidPostalCode(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validatePostalCode(value, options);
  if (!result.valid) {
    rejectValidation(
      'INVALID_POSTAL_CODE',
      options?.source,
      result.message ?? POSTAL_CODE_VALIDATION_MESSAGE
    );
  }
  acceptValidation(options?.source);
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

/** @deprecated Use validateCity or validateNeighborhood */
export function validatePlaceName(
  value: string | null | undefined,
  message: string = CITY_VALIDATION_MESSAGE,
  options?: { allowEmpty?: boolean }
): ProfileFieldValidationResult {
  return validatePlaceNameCore(value, message, options);
}

export function assertValidCity(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validateCity(value, options);
  if (!result.valid) {
    rejectValidation('INVALID_CITY', options?.source, result.message ?? CITY_VALIDATION_MESSAGE);
  }
  acceptValidation(options?.source);
}

export function assertValidNeighborhood(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validateNeighborhood(value, options);
  if (!result.valid) {
    rejectValidation(
      'INVALID_NEIGHBORHOOD',
      options?.source,
      result.message ?? NEIGHBORHOOD_VALIDATION_MESSAGE
    );
  }
  acceptValidation(options?.source);
}

export function validateBirthDateRange(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions & { minAge?: number; maxAge?: number }
): ProfileFieldValidationResult {
  // minAge 0: permite crianças/bebês no cadastro; maxAge mantém sanity check.
  const minAge = options?.minAge ?? 0;
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

  const today = new Date();
  const todayNoon = new Date(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T12:00:00`
  );
  if (parsed.getTime() > todayNoon.getTime()) {
    return { valid: false, message: BIRTH_DATE_VALIDATION_MESSAGE };
  }

  const age = calculateAgeFromBirthDate(parsed);
  if (age < minAge || age > maxAge) {
    return { valid: false, message: BIRTH_DATE_VALIDATION_MESSAGE };
  }

  return { valid: true };
}

export function assertValidBirthDateRange(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions & { minAge?: number; maxAge?: number }
): void {
  const result = validateBirthDateRange(value, options);
  if (!result.valid) {
    rejectValidation(
      'INVALID_BIRTH_DATE',
      options?.source,
      result.message ?? BIRTH_DATE_VALIDATION_MESSAGE
    );
  }
  acceptValidation(options?.source);
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
  options?: ProfileValidationAssertOptions
): ProfileFieldValidationResult {
  if (value == null || String(value).trim() === '') {
    if (options?.allowEmpty) {
      return { valid: true };
    }
    return { valid: false, message: GENDER_VALIDATION_MESSAGE };
  }

  const normalized = normalizeGender(value);
  if (!normalized) {
    return { valid: false, message: GENDER_VALIDATION_MESSAGE };
  }

  return { valid: true };
}

export function assertValidGender(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validateGender(value, options);
  if (!result.valid) {
    rejectValidation('INVALID_GENDER', options?.source, result.message ?? GENDER_VALIDATION_MESSAGE);
  }
  acceptValidation(options?.source);
}

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactEmail(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
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

export function assertValidContactEmail(
  value: string | null | undefined,
  options?: ProfileValidationAssertOptions
): void {
  const result = validateContactEmail(value, options);
  if (!result.valid) {
    rejectValidation('INVALID_EMAIL', options?.source, result.message ?? EMAIL_VALIDATION_MESSAGE);
  }
  acceptValidation(options?.source);
}
