/**
 * Regressão: concessão atômica registration free_bonus + leader_invitations.
 * Execução: npm run test:invitation-bonus-grant
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  grantInvitationBonusSlotWithClient,
  type GrantInvitationBonusSlotParams,
} from '../src/services/invitationBonusGrantService.js';

const PARAMS: GrantInvitationBonusSlotParams = {
  eventId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  leaderId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  commissionId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  leaderUserId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  categoryId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
};

describe('grantInvitationBonusSlotWithClient', () => {
  let calls: string[];
  let regInserted = false;

  beforeEach(() => {
    calls = [];
    regInserted = false;
  });

  function createClient(opts: { failOnInvitation?: boolean }) {
    return {
      query: async (text: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
        calls.push(text.trim().slice(0, 40));
        if (text.includes('INSERT INTO registrations')) {
          regInserted = true;
          return { rows: [{ id: 'reg-uuid-1' }] };
        }
        if (text.includes('INSERT INTO leader_invitations')) {
          if (opts.failOnInvitation) {
            const err = new Error('simulated invitation failure') as Error & { code?: string };
            err.code = '23505';
            throw err;
          }
          return { rows: [{ id: 'inv-uuid-1' }] };
        }
        return { rows: [] };
      },
    } as import('pg').PoolClient;
  }

  it('1. Sucesso: duas inserções e retorno com ambos os IDs', async () => {
    const client = createClient({ failOnInvitation: false });
    const out = await grantInvitationBonusSlotWithClient(client, PARAMS);
    assert.strictEqual(out.registrationId, 'reg-uuid-1');
    assert.strictEqual(out.invitationId, 'inv-uuid-1');
    assert.strictEqual(calls.length, 2);
  });

  it('2. Falha no convite: exceção propagada (transação externa deve dar ROLLBACK)', async () => {
    const client = createClient({ failOnInvitation: true });
    await assert.rejects(
      () => grantInvitationBonusSlotWithClient(client, PARAMS),
      /simulated invitation failure/
    );
    assert.strictEqual(regInserted, true, 'registration INSERT foi tentado antes da falha');
  });

  it('3. Callback após registration: notifica ID antes do convite', async () => {
    const client = createClient({ failOnInvitation: false });
    const seen: string[] = [];
    await grantInvitationBonusSlotWithClient(client, PARAMS, (rid) => seen.push(rid));
    assert.deepStrictEqual(seen, ['reg-uuid-1']);
  });
});
