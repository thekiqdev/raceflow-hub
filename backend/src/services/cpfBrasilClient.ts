import axios, { AxiosError } from 'axios';
import { maskCpf } from '../utils/cpf.js';

export type CpfBrasilInternalCode =
  | 'OK'
  | 'CONFIG_MISSING'
  | 'FEATURE_DISABLED'
  | 'EXTERNAL_NOT_FOUND'
  | 'EXTERNAL_AUTH'
  | 'EXTERNAL_QUOTA'
  | 'EXTERNAL_PLAN'
  | 'EXTERNAL_TIMEOUT'
  | 'EXTERNAL_BAD_RESPONSE'
  | 'EXTERNAL_UNKNOWN';

export interface CpfBrasilSuccessPayload {
  /** 11 dígitos */
  cpf: string;
  nome: string;
  sexoRaw: string;
  /** YYYY-MM-DD quando possível */
  nascIso: string;
}

export interface CpfBrasilCallResult {
  ok: boolean;
  internalCode: CpfBrasilInternalCode;
  httpStatus?: number;
  payload?: CpfBrasilSuccessPayload;
  /** Detalhe técnico curto para log (sem PII) */
  detail?: string;
}

function envBaseUrl(): string | undefined {
  const u = process.env.CPF_BRASIL_API_BASE_URL?.trim();
  return u ? u.replace(/\/$/, '') : undefined;
}

/** Base + chave definidos (sem revelar valores). Fase 6 — config pública. */
export function isCpfBrasilIntegrationConfigured(): boolean {
  return Boolean(envBaseUrl() && envApiKey());
}

function envApiKey(): string | undefined {
  const k = process.env.CPF_BRASIL_API_KEY?.trim();
  return k || undefined;
}

function timeoutMs(): number {
  const n = parseInt(process.env.CPF_BRASIL_TIMEOUT_MS || '10000', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60000) : 10000;
}

/** Flag pública (Fase 6: config exposta ao front sem segredos). */
export function isCpfBrasilFeatureEnabled(): boolean {
  const v = process.env.CPF_BRASIL_ENABLED;
  if (v === undefined || v === '') return true;
  return v === '1' || v.toLowerCase() === 'true';
}

function isEnabled(): boolean {
  return isCpfBrasilFeatureEnabled();
}

/** Extrai string de objeto com chaves flexíveis (maiúsc./minúsc.). */
function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const direct = obj[k];
    if (direct != null && String(direct).trim() !== '') {
      return String(direct).trim();
    }
  }
  const lowerMap = Object.fromEntries(
    Object.entries(obj).map(([key, val]) => [key.toLowerCase(), val])
  );
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

/** Converte NASC da API para YYYY-MM-DD quando possível. */
export function parseNascToIso(nasc: string): string | null {
  const s = nasc.trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (iso) return iso[0];
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function mapErrorCodeFromBody(data: unknown): CpfBrasilInternalCode | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  const code =
    pickStr(o, 'error', 'code', 'erro') ||
    (typeof o.message === 'string' ? o.message : undefined);
  if (!code) return undefined;
  const u = code.toUpperCase();
  if (u.includes('NOT_FOUND') || u === 'CPF_NOT_FOUND') return 'EXTERNAL_NOT_FOUND';
  if (u.includes('INVALID_CPF') || u.includes('INVALID_CPF_FORMAT')) return 'EXTERNAL_BAD_RESPONSE';
  if (u.includes('MISSING_API_KEY') || u.includes('INVALID_API_KEY') || u.includes('TOKEN_EXPIRED'))
    return 'EXTERNAL_AUTH';
  if (u.includes('QUOTA')) return 'EXTERNAL_QUOTA';
  if (u.includes('PLAN_EXPIRED') || u.includes('PLAN_SUSPENDED')) return 'EXTERNAL_PLAN';
  return undefined;
}

function parseSuccessBody(data: unknown, cpfDigits: string): CpfBrasilSuccessPayload | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const nested =
    o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : o;

  const nome = pickStr(nested, 'NOME', 'nome', 'name', 'full_name', 'NOME_COMPLETO');
  const sexoRaw = pickStr(nested, 'SEXO', 'sexo', 'gender') || '';
  const nascRaw = pickStr(nested, 'NASC', 'nasc', 'birth_date', 'data_nascimento', 'DATA_NASCIMENTO');
  if (!nome || !nascRaw || !sexoRaw.trim()) return null;
  const nascIso = parseNascToIso(nascRaw);
  if (!nascIso) return null;

  return {
    cpf: cpfDigits,
    nome,
    sexoRaw,
    nascIso,
  };
}

/**
 * Chama GET {base}/cpf/{cpf} com X-API-Key. Não logar corpo completo nem chave.
 */
export async function fetchCpfFromBrasilApi(cleanCpf: string): Promise<CpfBrasilCallResult> {
  if (!isEnabled()) {
    return { ok: false, internalCode: 'FEATURE_DISABLED', detail: 'CPF_BRASIL_ENABLED=false' };
  }

  const base = envBaseUrl();
  const key = envApiKey();
  if (!base || !key) {
    return { ok: false, internalCode: 'CONFIG_MISSING', detail: 'missing CPF_BRASIL_API_BASE_URL or CPF_BRASIL_API_KEY' };
  }

  const url = `${base}/cpf/${cleanCpf}`;
  const started = Date.now();

  try {
    const res = await axios.get<unknown>(url, {
      headers: { 'X-API-Key': key },
      timeout: timeoutMs(),
      validateStatus: () => true,
    });

    const ms = Date.now() - started;

    if (res.status === 200) {
      const payload = parseSuccessBody(res.data, cleanCpf);
      if (!payload) {
        console.warn('[cpf-brasil] resposta 200 sem campos obrigatórios', {
          ms,
          cpf: maskCpf(cleanCpf),
        });
        return {
          ok: false,
          internalCode: 'EXTERNAL_BAD_RESPONSE',
          httpStatus: 200,
          detail: 'missing NOME/NASC',
        };
      }
      return { ok: true, internalCode: 'OK', httpStatus: 200, payload };
    }

    const fromBody = mapErrorCodeFromBody(res.data);
    const internalCode: CpfBrasilInternalCode =
      fromBody ||
      (res.status === 404 ? 'EXTERNAL_NOT_FOUND' : 'EXTERNAL_UNKNOWN');

    console.warn('[cpf-brasil] HTTP não OK', {
      ms,
      status: res.status,
      internalCode,
      cpf: maskCpf(cleanCpf),
    });

    return { ok: false, internalCode, httpStatus: res.status };
  } catch (err) {
    const ms = Date.now() - started;
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<unknown>;
      if (ax.code === 'ECONNABORTED') {
        console.warn('[cpf-brasil] timeout', { ms, cpf: maskCpf(cleanCpf) });
        return { ok: false, internalCode: 'EXTERNAL_TIMEOUT', detail: 'ECONNABORTED' };
      }
      const status = ax.response?.status;
      const fromBody = mapErrorCodeFromBody(ax.response?.data);
      const internalCode: CpfBrasilInternalCode =
        fromBody ||
        (status === 404 ? 'EXTERNAL_NOT_FOUND' : 'EXTERNAL_UNKNOWN');
      console.warn('[cpf-brasil] axios error', {
        ms,
        status,
        internalCode,
        cpf: maskCpf(cleanCpf),
        code: ax.code,
      });
      return { ok: false, internalCode, httpStatus: status };
    }
    console.error('[cpf-brasil] erro inesperado', err);
    return { ok: false, internalCode: 'EXTERNAL_UNKNOWN', detail: 'throw' };
  }
}

/** GET {base}/health — monitoramento; não exige corpo com PII. */
export async function fetchCpfBrasilHealth(): Promise<{
  ok: boolean;
  status?: number;
  internalCode?: string;
}> {
  const base = envBaseUrl();
  const key = envApiKey();
  if (!base || !key) {
    return { ok: false, internalCode: 'CONFIG_MISSING' };
  }
  const url = `${base}/health`;
  try {
    const res = await axios.get(url, {
      headers: { 'X-API-Key': key },
      timeout: Math.min(timeoutMs(), 5000),
      validateStatus: () => true,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch {
    return { ok: false, internalCode: 'UNREACHABLE' };
  }
}
