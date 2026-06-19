import { query } from '../config/database.js';
import { toDateKey } from '../utils/dateKey.js';

export interface CpfLookupMetricDayRow {
  day: string;
  success_count: number;
  failure_count: number;
  total: number;
  failure_rate_pct: number;
}

/**
 * Incrementa contadores do dia (UTC date do servidor PostgreSQL).
 * Falhas silenciosas em log para não quebrar o fluxo de lookup.
 */
export async function recordCpfLookupOutcome(success: boolean): Promise<void> {
  try {
    const incOk = success ? 1 : 0;
    const incFail = success ? 0 : 1;
    await query(
      `INSERT INTO cpf_lookup_metrics_daily (day, success_count, failure_count, updated_at)
       VALUES (CURRENT_DATE, $1, $2, NOW())
       ON CONFLICT (day) DO UPDATE SET
         success_count = cpf_lookup_metrics_daily.success_count + EXCLUDED.success_count,
         failure_count = cpf_lookup_metrics_daily.failure_count + EXCLUDED.failure_count,
         updated_at = NOW()`,
      [incOk, incFail]
    );
  } catch (e) {
    console.error('[cpf-lookup-metrics] falha ao gravar contador', e);
  }
}

export interface CpfLookupMetricsSummary {
  days: CpfLookupMetricDayRow[];
  period_success: number;
  period_failure: number;
  period_total: number;
  period_failure_rate_pct: number;
}

export async function getCpfLookupMetricsSummary(days: number): Promise<CpfLookupMetricsSummary> {
  const d = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 366) : 30;
  const result = await query(
    `SELECT day, success_count, failure_count
     FROM cpf_lookup_metrics_daily
     WHERE day >= CURRENT_DATE - $1::integer
     ORDER BY day ASC`,
    [d]
  );

  let period_success = 0;
  let period_failure = 0;
  const rows: CpfLookupMetricDayRow[] = result.rows.map((row) => {
    const success_count = parseInt(String(row.success_count), 10) || 0;
    const failure_count = parseInt(String(row.failure_count), 10) || 0;
    const total = success_count + failure_count;
    period_success += success_count;
    period_failure += failure_count;
    const failure_rate_pct =
      total > 0 ? Math.round((failure_count / total) * 1000) / 10 : 0;
    return {
      day: toDateKey(row.day),
      success_count,
      failure_count,
      total,
      failure_rate_pct,
    };
  });

  const period_total = period_success + period_failure;
  const period_failure_rate_pct =
    period_total > 0 ? Math.round((period_failure / period_total) * 1000) / 10 : 0;

  return {
    days: rows,
    period_success,
    period_failure,
    period_total,
    period_failure_rate_pct,
  };
}
