/**
 * Etapa 5 — coordenação distribuída para comandos assistidos do domínio de convites.
 *
 * Usa bloqueio consultivo do PostgreSQL (`pg_try_advisory_lock`) na mesma instância do banco,
 * efetivo entre processos/instâncias da API que compartilham o mesmo cluster.
 *
 * Redis: não está no projeto; se `REDIS_URL` for adicionado no futuro, este módulo pode
 * estender um backend alternativo mantendo o mesmo contrato.
 */
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { getClient } from '../config/database.js';
import type {
  DeliverMissingAssistedCommand,
  ReconcileStateCommand,
} from '../types/invitationBonusDomain.js';

export type AssistedCommandForLock = DeliverMissingAssistedCommand | ReconcileStateCommand;

/** Chave estável e legível para logs/auditoria (não é o par int do advisory lock). */
export function buildAssistedCommandLockKey(cmd: AssistedCommandForLock): string {
  const leader = cmd.leader_id ?? '';
  const commission = cmd.commission_id ?? '';
  return [
    'inv_bonus_assisted',
    cmd.type,
    cmd.event_id,
    leader,
    commission,
    cmd.operational_context.idempotency_key.trim(),
  ].join(':');
}

function lockKeyToAdvisoryIntPair(lockKey: string): [number, number] {
  const hash = createHash('sha256').update(lockKey, 'utf8').digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

export async function tryAcquireAssistedCommandLock(client: PoolClient, lockKey: string): Promise<boolean> {
  const [k1, k2] = lockKeyToAdvisoryIntPair(lockKey);
  const res = await client.query<{ pg_try_advisory_lock: boolean }>(
    'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS pg_try_advisory_lock',
    [k1, k2]
  );
  return Boolean(res.rows[0]?.pg_try_advisory_lock);
}

export async function releaseAssistedCommandLock(client: PoolClient, lockKey: string): Promise<void> {
  const [k1, k2] = lockKeyToAdvisoryIntPair(lockKey);
  await client.query('SELECT pg_advisory_unlock($1::integer, $2::integer)', [k1, k2]);
}

/**
 * Executa fn enquanto mantém um cliente dedicado com lock consultivo adquirido.
 * Libera lock e cliente em finally.
 */
export async function withAssistedCommandPgLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const client = await getClient();
  try {
    const acquired = await tryAcquireAssistedCommandLock(client, lockKey);
    if (!acquired) {
      return { acquired: false };
    }
    try {
      const value = await fn();
      return { acquired: true, value };
    } finally {
      await releaseAssistedCommandLock(client, lockKey);
    }
  } finally {
    client.release();
  }
}
