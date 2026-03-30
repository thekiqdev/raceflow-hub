import jwt, { SignOptions } from 'jsonwebtoken';

export const CPF_LOOKUP_PROOF_SUB = 'cpf_lookup_v1' as const;

export interface CpfLookupProofPayload {
  sub: typeof CPF_LOOKUP_PROOF_SUB;
  cpf: string;
  full_name: string;
  birth_date: string;
  gender: string;
}

export function issueCpfLookupProof(payload: {
  cpf: string;
  full_name: string;
  birth_date: string;
  gender: string;
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  const body: CpfLookupProofPayload = {
    sub: CPF_LOOKUP_PROOF_SUB,
    cpf: payload.cpf,
    full_name: payload.full_name.trim(),
    birth_date: payload.birth_date,
    gender: payload.gender.trim(),
  };
  return jwt.sign(body, secret, { expiresIn: '15m' } as SignOptions);
}

export function verifyCpfLookupProof(token: string): CpfLookupProofPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as CpfLookupProofPayload;
    if (decoded.sub !== CPF_LOOKUP_PROOF_SUB) return null;
    if (!decoded.cpf || !decoded.full_name || !decoded.birth_date || !decoded.gender) return null;
    return decoded;
  } catch {
    return null;
  }
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Valida se o corpo do register bate com o JWT emitido após lookup. */
export function proofMatchesRegisterBody(
  proof: CpfLookupProofPayload,
  body: {
    cpf: string;
    full_name: string;
    birth_date: string;
    gender?: string | null;
  }
): boolean {
  const clean = String(body.cpf).replace(/\D/g, '');
  if (clean !== proof.cpf) return false;
  if (normalizeName(body.full_name) !== normalizeName(proof.full_name)) return false;
  if (String(body.birth_date).slice(0, 10) !== String(proof.birth_date).slice(0, 10)) return false;
  const g = (body.gender || '').trim().toUpperCase();
  const pg = proof.gender.trim().toUpperCase();
  return g === pg;
}

/** Cadastro exige prova de lookup quando a integração CPF Brasil está configurada e habilitada. */
export function registerRequiresCpfLookupProof(): boolean {
  if (process.env.CPF_REGISTER_REQUIRES_LOOKUP_PROOF === 'false') {
    return false;
  }
  const base = process.env.CPF_BRASIL_API_BASE_URL?.trim();
  const key = process.env.CPF_BRASIL_API_KEY?.trim();
  if (!base || !key) {
    return false;
  }
  if (process.env.CPF_BRASIL_ENABLED === 'false') {
    return false;
  }
  return true;
}
