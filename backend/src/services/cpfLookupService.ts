import { randomUUID } from 'crypto';
import { normalizeCpfDigits, isValidCpfDigits, maskCpf } from '../utils/cpf.js';
import { fetchCpfFromBrasilApi, type CpfBrasilInternalCode } from './cpfBrasilClient.js';

export type LookupCpfCode = 'OK' | 'LOCAL_INVALID_FORMAT' | CpfBrasilInternalCode;

export interface LookupCpfSuccessData {
  cpf: string;
  full_name: string;
  birth_date: string;
  gender: string;
  gender_locked: boolean;
}

export interface LookupCpfResult {
  success: boolean;
  /** Sempre "CPF inválido" em falha (política v2). */
  message: string;
  code: LookupCpfCode;
  requestId: string;
  data?: LookupCpfSuccessData;
}

/** Mapeia SEXO da API para texto armazenado em profiles.gender. */
export function mapSexoToProfileGender(sexoRaw: string): { gender: string; locked: boolean } {
  const s = sexoRaw.trim().toUpperCase();
  if (s === 'M' || s.startsWith('MASC')) return { gender: 'M', locked: true };
  if (s === 'F' || s.startsWith('FEM')) return { gender: 'F', locked: true };
  return { gender: '', locked: false };
}

/**
 * Lookup para fluxo de cadastro: valida CPF localmente e consulta CPF Brasil.
 * Logs: requestId + code + CPF mascarado (sem dados pessoais completos).
 */
export async function lookupCpfForRegistration(rawCpf: string): Promise<LookupCpfResult> {
  const requestId = randomUUID();
  const digits = normalizeCpfDigits(rawCpf);

  if (digits.length !== 11 || !isValidCpfDigits(digits)) {
    console.warn('[cpf-lookup] formato/dígitos inválidos', { requestId, cpf: maskCpf(digits) });
    return {
      success: false,
      message: 'CPF inválido',
      code: 'LOCAL_INVALID_FORMAT',
      requestId,
    };
  }

  const api = await fetchCpfFromBrasilApi(digits);

  if (!api.ok || !api.payload) {
    console.error('[cpf-lookup][integration] falha', {
      requestId,
      code: api.internalCode,
      cpf: maskCpf(digits),
      httpStatus: api.httpStatus,
    });
    return {
      success: false,
      message: 'CPF inválido',
      code: api.internalCode,
      requestId,
    };
  }

  const mappedGender = mapSexoToProfileGender(api.payload.sexoRaw);

  return {
    success: true,
    message: 'OK',
    code: 'OK',
    requestId,
    data: {
      cpf: digits,
      full_name: api.payload.nome,
      birth_date: api.payload.nascIso,
      gender: mappedGender.gender,
      gender_locked: mappedGender.locked,
    },
  };
}
