import { createHash } from 'crypto';
import { query } from '../config/database.js';
import { normalizeCpfDigits } from '../utils/cpf.js';
import { toDateKey } from '../utils/dateKey.js';

export const CPF_AUDIT_RETENTION_DAYS = 90;
export const CPF_AUDIT_DEFAULT_PERIOD_DAYS = 30;

export type CpfAuditResultCode =
  | 'CPF_LOOKUP_OK'
  | 'CPF_NOT_IN_REGISTRY'
  | 'LOCAL_INVALID_FORMAT'
  | 'EXTERNAL_TIMEOUT'
  | 'EXTERNAL_QUOTA'
  | 'EXTERNAL_AUTH'
  | 'EXTERNAL_PLAN'
  | 'EXTERNAL_BAD_RESPONSE'
  | 'RATE_LIMITED'
  | string;

export type ProviderHealthLevel = 'excellent' | 'good' | 'attention' | 'critical';

const NO_CPF_HASH = createHash('sha256').update('__no_cpf__').digest('hex');

export function hashCpfForAudit(digitsOrMasked: string): string {
  const digits = normalizeCpfDigits(digitsOrMasked);
  return createHash('sha256').update(digits).digest('hex');
}

/** Normaliza códigos do lookup para contadores do dashboard admin. */
export function normalizeAuditResultCode(code: string): string {
  if (code === 'OK') return 'CPF_LOOKUP_OK';
  return code;
}

export function computeApiSuccessRatePct(okCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return Math.round((okCount / totalCount) * 1000) / 10;
}

export function getProviderHealthLevel(successRatePct: number): ProviderHealthLevel {
  if (successRatePct > 98) return 'excellent';
  if (successRatePct >= 95) return 'good';
  if (successRatePct >= 90) return 'attention';
  return 'critical';
}

export interface RecordCpfLookupMetricInput {
  cpf?: string | null;
  resultCode: string;
  source?: string;
  provider?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordCpfLookupMetric(input: RecordCpfLookupMetricInput): Promise<void> {
  try {
    const digits = input.cpf ? normalizeCpfDigits(input.cpf) : '';
    const cpfHash = digits.length === 11 ? hashCpfForAudit(digits) : NO_CPF_HASH;
    const resultCode = normalizeAuditResultCode(input.resultCode);

    await query(
      `INSERT INTO cpf_lookup_metrics (cpf_hash, source, result_code, provider, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        cpfHash,
        input.source ?? 'lookup-cpf',
        resultCode,
        input.provider ?? 'cpf_brasil',
        input.requestId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
  } catch (e) {
    console.error('[cpf-audit] falha ao gravar métrica', e);
  }
}

export interface CpfAuditOverviewKpis {
  CPF_LOOKUP_OK: number;
  CPF_NOT_IN_REGISTRY: number;
  LOCAL_INVALID_FORMAT: number;
  EXTERNAL_TIMEOUT: number;
  EXTERNAL_QUOTA: number;
  EXTERNAL_AUTH: number;
  EXTERNAL_PLAN: number;
  EXTERNAL_BAD_RESPONSE: number;
  RATE_LIMITED: number;
  total_lookups: number;
  api_success_rate_pct: number;
  manual_count: number;
  manual_pct: number;
  provider_health: ProviderHealthLevel;
  period_days: number;
}

function countByCode(rows: Array<{ result_code: string; count: number }>, code: string): number {
  const row = rows.find((r) => r.result_code === code);
  return row?.count ?? 0;
}

export async function getCpfAuditOverview(days = CPF_AUDIT_DEFAULT_PERIOD_DAYS): Promise<CpfAuditOverviewKpis> {
  const periodDays =
    Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), CPF_AUDIT_RETENTION_DAYS) : CPF_AUDIT_DEFAULT_PERIOD_DAYS;

  const result = await query(
    `SELECT result_code, COUNT(*)::int AS count
     FROM cpf_lookup_metrics
     WHERE created_at >= NOW() - ($1::integer || ' days')::interval
     GROUP BY result_code`,
    [periodDays]
  );

  const rows = result.rows.map((row) => ({
    result_code: String(row.result_code),
    count: parseInt(String(row.count), 10) || 0,
  }));

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const ok = countByCode(rows, 'CPF_LOOKUP_OK');
  const manual = countByCode(rows, 'CPF_NOT_IN_REGISTRY');
  const apiSuccessRate = computeApiSuccessRatePct(ok, total);

  return {
    CPF_LOOKUP_OK: ok,
    CPF_NOT_IN_REGISTRY: manual,
    LOCAL_INVALID_FORMAT: countByCode(rows, 'LOCAL_INVALID_FORMAT'),
    EXTERNAL_TIMEOUT: countByCode(rows, 'EXTERNAL_TIMEOUT'),
    EXTERNAL_QUOTA: countByCode(rows, 'EXTERNAL_QUOTA'),
    EXTERNAL_AUTH: countByCode(rows, 'EXTERNAL_AUTH'),
    EXTERNAL_PLAN: countByCode(rows, 'EXTERNAL_PLAN'),
    EXTERNAL_BAD_RESPONSE: countByCode(rows, 'EXTERNAL_BAD_RESPONSE'),
    RATE_LIMITED: countByCode(rows, 'RATE_LIMITED'),
    total_lookups: total,
    api_success_rate_pct: apiSuccessRate,
    manual_count: manual,
    manual_pct: total > 0 ? Math.round((manual / total) * 1000) / 10 : 0,
    provider_health: getProviderHealthLevel(apiSuccessRate),
    period_days: periodDays,
  };
}

export interface CpfAuditDailyRow {
  day: string;
  success: number;
  manual: number;
  invalid: number;
  timeout: number;
  total: number;
}

export async function getCpfAuditDaily(days = CPF_AUDIT_DEFAULT_PERIOD_DAYS): Promise<CpfAuditDailyRow[]> {
  const periodDays =
    Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), CPF_AUDIT_RETENTION_DAYS) : CPF_AUDIT_DEFAULT_PERIOD_DAYS;

  const result = await query(
    `SELECT
       created_at::date AS day,
       SUM(CASE WHEN result_code = 'CPF_LOOKUP_OK' THEN 1 ELSE 0 END)::int AS success,
       SUM(CASE WHEN result_code = 'CPF_NOT_IN_REGISTRY' THEN 1 ELSE 0 END)::int AS manual,
       SUM(CASE WHEN result_code = 'LOCAL_INVALID_FORMAT' THEN 1 ELSE 0 END)::int AS invalid,
       SUM(CASE WHEN result_code = 'EXTERNAL_TIMEOUT' THEN 1 ELSE 0 END)::int AS timeout,
       COUNT(*)::int AS total
     FROM cpf_lookup_metrics
     WHERE created_at >= NOW() - ($1::integer || ' days')::interval
     GROUP BY created_at::date
     ORDER BY day ASC`,
    [periodDays]
  );

  return result.rows.map((row) => ({
    day: toDateKey(row.day),
    success: parseInt(String(row.success), 10) || 0,
    manual: parseInt(String(row.manual), 10) || 0,
    invalid: parseInt(String(row.invalid), 10) || 0,
    timeout: parseInt(String(row.timeout), 10) || 0,
    total: parseInt(String(row.total), 10) || 0,
  }));
}

export interface CpfAuditRecentErrorRow {
  created_at: string;
  result_code: string;
  request_id: string | null;
  source: string;
  provider: string | null;
}

export async function getCpfRecentErrors(limit = 50): Promise<CpfAuditRecentErrorRow[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

  const result = await query(
    `SELECT created_at, result_code, request_id, source, provider
     FROM cpf_lookup_metrics
     WHERE result_code NOT IN ('CPF_LOOKUP_OK', 'CPF_NOT_IN_REGISTRY')
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    created_at: new Date(row.created_at).toISOString(),
    result_code: String(row.result_code),
    request_id: row.request_id ? String(row.request_id) : null,
    source: String(row.source),
    provider: row.provider ? String(row.provider) : null,
  }));
}

/** Remove registros com mais de N dias (retenção operacional). */
export async function purgeCpfLookupMetricsOlderThan(days = CPF_AUDIT_RETENTION_DAYS): Promise<number> {
  const retention =
    Number.isFinite(days) && days > 0 ? Math.floor(days) : CPF_AUDIT_RETENTION_DAYS;
  const result = await query(
    `DELETE FROM cpf_lookup_metrics
     WHERE created_at < NOW() - ($1::integer || ' days')::interval`,
    [retention]
  );
  return result.rowCount ?? 0;
}
