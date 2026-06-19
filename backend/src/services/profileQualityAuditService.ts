import {
  getProfileValidationMetricsInPeriod,
  type ProfileValidationMetricCode,
  type ProfileValidationMetricEvent,
} from '../utils/profileValidationMetrics.js';

export const PROFILE_QUALITY_DEFAULT_PERIOD_DAYS = 30;

export type QualityHealthLevel = 'excellent' | 'good' | 'attention' | 'critical';

export const PROFILE_QUALITY_SOURCE_BUCKETS = [
  'auth.register',
  'profile.update',
  'manual.runner',
  'organizer.settings',
  'system.settings',
] as const;

export type ProfileQualitySourceBucket = (typeof PROFILE_QUALITY_SOURCE_BUCKETS)[number];

const REJECTION_CODES: Exclude<ProfileValidationMetricCode, 'VALIDATION_PASS'>[] = [
  'INVALID_FULL_NAME',
  'INVALID_PHONE',
  'INVALID_CONTACT_PHONE',
  'INVALID_POSTAL_CODE',
  'INVALID_CITY',
  'INVALID_NEIGHBORHOOD',
  'INVALID_BIRTH_DATE',
  'INVALID_GENDER',
  'INVALID_EMAIL',
];

function parsePeriodDays(days: number): number {
  return Number.isFinite(days) && days > 0
    ? Math.min(Math.floor(days), PROFILE_QUALITY_DEFAULT_PERIOD_DAYS)
    : PROFILE_QUALITY_DEFAULT_PERIOD_DAYS;
}

function isRejectionEvent(event: ProfileValidationMetricEvent): boolean {
  return event.code !== 'VALIDATION_PASS';
}

function countByCode(
  events: ProfileValidationMetricEvent[],
  code: ProfileValidationMetricCode
): number {
  return events.filter((event) => event.code === code).length;
}

export function normalizeProfileQualitySource(source: string): ProfileQualitySourceBucket | 'other' {
  if (source === 'auth.register') return 'auth.register';
  if (source.startsWith('profiles.') || source.startsWith('profile.')) return 'profile.update';
  if (source.includes('createManualRunner') || source.includes('manual.runner')) {
    return 'manual.runner';
  }
  if (source.startsWith('registrations.') || source.includes('organizer')) {
    return 'organizer.settings';
  }
  if (source.startsWith('systemSettings.') || source.startsWith('homePageSettings.')) {
    return 'system.settings';
  }
  return 'other';
}

export function computeRejectionRatePct(rejections: number, totalValidations: number): number {
  if (totalValidations <= 0) return 0;
  return Math.round((rejections / totalValidations) * 1000) / 10;
}

export function getQualityHealthLevel(rejectionRatePct: number): QualityHealthLevel {
  if (rejectionRatePct < 2) return 'excellent';
  if (rejectionRatePct < 5) return 'good';
  if (rejectionRatePct < 10) return 'attention';
  return 'critical';
}

export interface ProfileQualityOverview {
  period_days: number;
  total_rejections: number;
  invalid_full_name: number;
  invalid_phone: number;
  invalid_postal_code: number;
  invalid_city: number;
  invalid_neighborhood: number;
  invalid_birth_date: number;
  invalid_gender: number;
  invalid_email: number;
  total_validations: number;
  rejection_rate_pct: number;
  quality_status: QualityHealthLevel;
}

export function getQualityOverview(days = PROFILE_QUALITY_DEFAULT_PERIOD_DAYS): ProfileQualityOverview {
  const periodDays = parsePeriodDays(days);
  const events = getProfileValidationMetricsInPeriod(periodDays);
  const rejections = events.filter(isRejectionEvent);
  const passes = events.filter((event) => event.code === 'VALIDATION_PASS');
  const totalRejections = rejections.length;
  const totalValidations = totalRejections + passes.length;
  const rejectionRatePct = computeRejectionRatePct(totalRejections, totalValidations);

  return {
    period_days: periodDays,
    total_rejections: totalRejections,
    invalid_full_name: countByCode(rejections, 'INVALID_FULL_NAME'),
    invalid_phone: countByCode(rejections, 'INVALID_PHONE') + countByCode(rejections, 'INVALID_CONTACT_PHONE'),
    invalid_postal_code: countByCode(rejections, 'INVALID_POSTAL_CODE'),
    invalid_city: countByCode(rejections, 'INVALID_CITY'),
    invalid_neighborhood: countByCode(rejections, 'INVALID_NEIGHBORHOOD'),
    invalid_birth_date: countByCode(rejections, 'INVALID_BIRTH_DATE'),
    invalid_gender: countByCode(rejections, 'INVALID_GENDER'),
    invalid_email: countByCode(rejections, 'INVALID_EMAIL'),
    total_validations: totalValidations,
    rejection_rate_pct: rejectionRatePct,
    quality_status: getQualityHealthLevel(rejectionRatePct),
  };
}

export interface ProfileQualityDailyRow {
  day: string;
  rejections: number;
  total: number;
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDayRange(periodDays: number): string[] {
  const days: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = periodDays - 1; offset >= 0; offset--) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    days.push(formatDayKey(day));
  }

  return days;
}

export function getQualityDaily(days = PROFILE_QUALITY_DEFAULT_PERIOD_DAYS): ProfileQualityDailyRow[] {
  const periodDays = parsePeriodDays(days);
  const events = getProfileValidationMetricsInPeriod(periodDays);
  const byDay = new Map<string, { rejections: number; total: number }>();

  for (const day of buildDayRange(periodDays)) {
    byDay.set(day, { rejections: 0, total: 0 });
  }

  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const row = byDay.get(day);
    if (!row) continue;
    row.total += 1;
    if (isRejectionEvent(event)) {
      row.rejections += 1;
    }
  }

  return buildDayRange(periodDays).map((day) => {
    const row = byDay.get(day) ?? { rejections: 0, total: 0 };
    return { day, rejections: row.rejections, total: row.total };
  });
}

export interface ProfileQualityTopErrorRow {
  code: string;
  count: number;
}

export function getQualityTopErrors(days = PROFILE_QUALITY_DEFAULT_PERIOD_DAYS): ProfileQualityTopErrorRow[] {
  const periodDays = parsePeriodDays(days);
  const events = getProfileValidationMetricsInPeriod(periodDays).filter(isRejectionEvent);
  const counts = new Map<string, number>();

  for (const code of REJECTION_CODES) {
    counts.set(code, 0);
  }

  for (const event of events) {
    counts.set(event.code, (counts.get(event.code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export interface ProfileQualityBySourceRow {
  source: ProfileQualitySourceBucket;
  count: number;
  pct: number;
}

export function getQualityBySource(days = PROFILE_QUALITY_DEFAULT_PERIOD_DAYS): ProfileQualityBySourceRow[] {
  const periodDays = parsePeriodDays(days);
  const rejections = getProfileValidationMetricsInPeriod(periodDays).filter(isRejectionEvent);
  const total = rejections.length;
  const counts = new Map<ProfileQualitySourceBucket, number>();

  for (const bucket of PROFILE_QUALITY_SOURCE_BUCKETS) {
    counts.set(bucket, 0);
  }

  for (const event of rejections) {
    const bucket = normalizeProfileQualitySource(event.source);
    if (bucket === 'other') continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return PROFILE_QUALITY_SOURCE_BUCKETS.map((source) => {
    const count = counts.get(source) ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    return { source, count, pct };
  });
}
