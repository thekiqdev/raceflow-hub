/**
 * Etapa 7 — sinais operacionais leves (sem auto-recovery). Emite logs `invitation_bonus_assisted_signal`.
 */
import type { SupportConsolidatedSnapshot } from './invitationBonusAssistedSupportService.js';
import {
  getPreviousWindowSnapshot,
  getSupportConsolidatedSnapshot,
  postSignalsWebhookOptional,
} from './invitationBonusAssistedSupportService.js';

export type SignalSeverity = 'info' | 'warning' | 'critical';

export interface OperationalSignal {
  signal_type: string;
  severity: SignalSeverity;
  value: number;
  threshold: number;
  detail: string;
  window_hours: number;
}

function envInt(key: string, fallback: number): number {
  const v = parseInt(process.env[key] || '', 10);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return v;
}

function envFloat(key: string, fallback: number): number {
  const v = parseFloat(process.env[key] || '');
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

export function logInvitationBonusAssistedSignal(s: OperationalSignal & { phase?: 'emit' }): void {
  console.log(
    JSON.stringify({
      event: 'invitation_bonus_assisted_signal',
      phase: s.phase ?? 'emit',
      signal_type: s.signal_type,
      severity: s.severity,
      value: s.value,
      threshold: s.threshold,
      detail: s.detail,
      window_hours: s.window_hours,
    })
  );
}

/**
 * Avalia sinais comparando snapshot atual com janela anterior equivalente.
 * Critérios são conservadores e configuráveis por env (ver docs Etapa 7).
 */
export function evaluateOperationalSignals(input: {
  current: SupportConsolidatedSnapshot;
  previous: SupportConsolidatedSnapshot | null;
  window_hours: number;
}): OperationalSignal[] {
  const { current, previous, window_hours } = input;
  const signals: OperationalSignal[] = [];

  const stuckMin = envInt('INVITE_BONUS_ASSISTED_STUCK_ALERT_MIN', 1);
  if (current.stuck_count_now >= stuckMin) {
    signals.push({
      signal_type: 'stuck_above_threshold',
      severity: current.stuck_count_now >= stuckMin + 2 ? 'critical' : 'warning',
      value: current.stuck_count_now,
      threshold: stuckMin,
      detail: `Comandos assistidos presos (started antigo) >= limiar operacional.`,
      window_hours,
    });
  }

  const failedMin = envInt('INVITE_BONUS_ASSISTED_FAILED_ABSOLUTE_ALERT_MIN', 12);
  if (current.counts_by_status.failed >= failedMin) {
    signals.push({
      signal_type: 'failed_volume_high',
      severity: 'warning',
      value: current.counts_by_status.failed,
      threshold: failedMin,
      detail: `Falhas (created_at na janela) acima do mínimo absoluto.`,
      window_hours,
    });
  }

  const ratio = envFloat('INVITE_BONUS_ASSISTED_FAILED_SPIKE_RATIO', 2);
  const spikeMin = envInt('INVITE_BONUS_ASSISTED_FAILED_SPIKE_MIN', 3);
  if (previous) {
    const prevF = Math.max(1, previous.counts_by_status.failed);
    const curF = current.counts_by_status.failed;
    if (curF >= spikeMin && curF >= prevF * ratio) {
      signals.push({
        signal_type: 'failed_spike_vs_previous_window',
        severity: 'warning',
        value: curF,
        threshold: Math.ceil(prevF * ratio),
        detail: `Falhas na janela atual >= ${ratio}x a janela anterior (e >= ${spikeMin}).`,
        window_hours,
      });
    }
  }

  const resMin = envInt('INVITE_BONUS_ASSISTED_RESOLUTION_ALERT_MIN', 8);
  if (current.admin_resolutions_in_window >= resMin) {
    signals.push({
      signal_type: 'admin_resolution_volume_high',
      severity: 'info',
      value: current.admin_resolutions_in_window,
      threshold: resMin,
      detail: `Volume elevado de resoluções administrativas (mark_stuck_as_failed) na janela.`,
      window_hours,
    });
  }

  const dupMin = envInt('INVITE_BONUS_ASSISTED_IDEMPOTENCY_GROUPS_ALERT_MIN', 2);
  if (current.duplicate_idempotency_groups_in_window >= dupMin) {
    signals.push({
      signal_type: 'idempotency_contention_or_retries',
      severity: 'warning',
      value: current.duplicate_idempotency_groups_in_window,
      threshold: dupMin,
      detail: `Grupos de idempotência com 2+ linhas na janela (retries / contenção).`,
      window_hours,
    });
  }

  const startedProxy = envInt('INVITE_BONUS_ASSISTED_IN_FLIGHT_STARTED_ALERT_MIN', 25);
  if (current.counts_by_status.started >= startedProxy) {
    signals.push({
      signal_type: 'in_flight_started_volume_high',
      severity: 'info',
      value: current.counts_by_status.started,
      threshold: startedProxy,
      detail:
        'Muitas linhas "started" criadas na janela (proxy para pressão ou repetição de command_in_progress / tentativas).',
      window_hours,
    });
  }

  return signals;
}

export async function buildSignalsReport(params: {
  hours: number;
  emit_logs: boolean;
  emit_webhook: boolean;
}): Promise<{
  window_hours: number;
  current: SupportConsolidatedSnapshot;
  previous: SupportConsolidatedSnapshot;
  signals: OperationalSignal[];
}> {
  const hours = Math.min(Math.max(params.hours, 1), 24 * 90);
  const [current, previous] = await Promise.all([
    getSupportConsolidatedSnapshot({ hours }),
    getPreviousWindowSnapshot(hours),
  ]);
  const signals = evaluateOperationalSignals({
    current,
    previous,
    window_hours: hours,
  });

  if (params.emit_logs) {
    for (const s of signals) {
      logInvitationBonusAssistedSignal({ ...s, phase: 'emit' });
    }
  }

  if (params.emit_webhook && signals.length > 0) {
    await postSignalsWebhookOptional({
      type: 'invitation_bonus_assisted_signals_batch',
      window_hours: hours,
      signal_count: signals.length,
      current_window: current.window,
      signals,
    });
  }

  return { window_hours: hours, current, previous, signals };
}
