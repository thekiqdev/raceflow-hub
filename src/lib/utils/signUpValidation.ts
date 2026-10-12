import { normalizePersonName, normalizePhoneDigits } from '@/lib/utils/profileNormalization';
import {
  BIRTH_DATE_VALIDATION_MESSAGE,
  FULL_NAME_VALIDATION_MESSAGE,
  GENDER_VALIDATION_MESSAGE,
  PHONE_VALIDATION_MESSAGE,
  validateBirthDateRange,
  validateFullName,
  validateGender,
  validatePhone,
} from '@/lib/utils/profileValidation';

export type SignUpFormValues = {
  cpfLookupProof?: string | null;
  fullName?: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  lgpdConsent?: boolean;
  requireConfirmPassword?: boolean;
};

/** Lista amigável do que impede criar a conta — usada nos avisos ao clicar em Criar Conta. */
export function collectSignUpIssues(input: SignUpFormValues): string[] {
  const issues: string[] = [];

  if (!input.cpfLookupProof) {
    issues.push('Consulte o CPF (botão Consultar) para continuar.');
  }

  const fullNameCheck = validateFullName(normalizePersonName(input.fullName ?? ''));
  if (!fullNameCheck.valid) {
    issues.push(fullNameCheck.message ?? FULL_NAME_VALIDATION_MESSAGE);
  }

  const birthCheck = validateBirthDateRange(input.birthDate);
  if (!birthCheck.valid) {
    issues.push(birthCheck.message ?? BIRTH_DATE_VALIDATION_MESSAGE);
  }

  const genderCheck = validateGender(input.gender);
  if (!genderCheck.valid) {
    issues.push(genderCheck.message ?? GENDER_VALIDATION_MESSAGE);
  }

  const phoneCheck = validatePhone(input.phone);
  if (!phoneCheck.valid) {
    issues.push(phoneCheck.message ?? PHONE_VALIDATION_MESSAGE);
  } else if (!normalizePhoneDigits(input.phone)) {
    issues.push(PHONE_VALIDATION_MESSAGE);
  }

  if (!String(input.email ?? '').trim()) {
    issues.push('Informe o e-mail.');
  }

  const password = String(input.password ?? '');
  if (password.length < 6) {
    issues.push('A senha deve ter pelo menos 6 caracteres.');
  }

  if (input.requireConfirmPassword) {
    if (!String(input.confirmPassword ?? '')) {
      issues.push('Confirme a senha.');
    } else if (password !== String(input.confirmPassword ?? '')) {
      issues.push('As senhas não coincidem.');
    }
  }

  if (!input.lgpdConsent) {
    issues.push('Aceite os termos de uso e a política de privacidade (LGPD).');
  }

  return issues;
}
