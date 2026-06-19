export type ProfileValidationMetricCode =
  | 'INVALID_PHONE'
  | 'INVALID_POSTAL_CODE'
  | 'INVALID_CITY'
  | 'INVALID_NEIGHBORHOOD'
  | 'INVALID_FULL_NAME'
  | 'INVALID_BIRTH_DATE'
  | 'INVALID_GENDER'
  | 'INVALID_CONTACT_PHONE'
  | 'INVALID_EMAIL'
  | 'VALIDATION_PASS';

export interface ProfileValidationMetricEvent {
  code: ProfileValidationMetricCode;
  source: string;
  timestamp: string;
}

const MAX_METRICS = 20000;
const RETENTION_DAYS = 30;
const metrics: ProfileValidationMetricEvent[] = [];

function pruneOldMetrics(): void {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  while (metrics.length > 0 && new Date(metrics[0].timestamp).getTime() < cutoff) {
    metrics.shift();
  }
}

/** Observabilidade apenas — não bloqueia fluxo por si só. */
export function recordProfileValidationRejection(
  code: Exclude<ProfileValidationMetricCode, 'VALIDATION_PASS'>,
  source: string
): void {
  pruneOldMetrics();
  metrics.push({
    code,
    source,
    timestamp: new Date().toISOString(),
  });
  if (metrics.length > MAX_METRICS) {
    metrics.shift();
  }
}

export function recordProfileValidationPass(source: string): void {
  pruneOldMetrics();
  metrics.push({
    code: 'VALIDATION_PASS',
    source,
    timestamp: new Date().toISOString(),
  });
  if (metrics.length > MAX_METRICS) {
    metrics.shift();
  }
}

export function getProfileValidationMetrics(): ProfileValidationMetricEvent[] {
  return [...metrics];
}

export function getProfileValidationMetricsInPeriod(days = 30): ProfileValidationMetricEvent[] {
  const periodDays = Math.max(1, Math.min(days, RETENTION_DAYS));
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  return metrics.filter((event) => new Date(event.timestamp).getTime() >= cutoff);
}

export function clearProfileValidationMetrics(): void {
  metrics.length = 0;
}
