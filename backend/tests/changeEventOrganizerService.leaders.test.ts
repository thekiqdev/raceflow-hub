/**
 * Testes da coleta de líderes impactados na migração de organizador (getLeaderIdsForEvent).
 * Cenários: só LEC, duplicata nas 3 fontes, já em B+LEC, mapeado, regressão.
 * Execução: npx tsx tests/changeEventOrganizerService.leaders.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLeaderIdsForEvent } from '../src/services/changeEventOrganizerService.js';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = '22222222-2222-2222-2222-222222222222';

function createMockClient(opts: {
  couponLeaderIds?: string[];
  invitationLeaderIds?: string[];
  commissionLeaderIds?: string[];
}) {
  return {
    query: async (text: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
      if (text.includes('coupon_events') && text.includes('coupons')) {
        const rows = (opts.couponLeaderIds ?? []).map((id) => ({ leader_id: id }));
        return { rows };
      }
      if (text.includes('leader_invitations')) {
        const rows = (opts.invitationLeaderIds ?? []).map((id) => ({ leader_id: id }));
        return { rows };
      }
      if (text.includes('leader_event_commissions')) {
        const rows = (opts.commissionLeaderIds ?? []).map((id) => ({ leader_id: id }));
        return { rows };
      }
      return { rows: [] };
    },
  };
}

describe('getLeaderIdsForEvent', () => {
  it('1. Líder só em leader_event_commissions: retorna apenas esse líder', async () => {
    const lecOnly = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const client = createMockClient({
      couponLeaderIds: [],
      invitationLeaderIds: [],
      commissionLeaderIds: [lecOnly],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], lecOnly);
  });

  it('2. Líder duplicado nas 3 fontes: retorna lista única (um id)', async () => {
    const id1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const client = createMockClient({
      couponLeaderIds: [id1],
      invitationLeaderIds: [id1],
      commissionLeaderIds: [id1],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], id1);
  });

  it('3. Líder já existente em B + leader_event_commissions: coleta inclui o líder (sem duplicata)', async () => {
    const id1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const client = createMockClient({
      couponLeaderIds: [id1],
      invitationLeaderIds: [],
      commissionLeaderIds: [id1],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], id1);
  });

  it('4. Líder mapeado por email/telefone: coleta retorna todos os ids (convite + LEC)', async () => {
    const invId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const lecId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const client = createMockClient({
      couponLeaderIds: [],
      invitationLeaderIds: [invId],
      commissionLeaderIds: [lecId],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 2);
    assert.ok(ids.includes(invId));
    assert.ok(ids.includes(lecId));
  });

  it('5. Regressão: só cupons retorna só ids de cupons', async () => {
    const c1 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const client = createMockClient({
      couponLeaderIds: [c1],
      invitationLeaderIds: [],
      commissionLeaderIds: [],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], c1);
  });

  it('5b. Regressão: só convites retorna só ids de convites', async () => {
    const i1 = '12345678-1234-1234-1234-123456789012';
    const client = createMockClient({
      couponLeaderIds: [],
      invitationLeaderIds: [i1],
      commissionLeaderIds: [],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], i1);
  });

  it('5c. Regressão: nenhuma fonte retorna lista vazia', async () => {
    const client = createMockClient({
      couponLeaderIds: [],
      invitationLeaderIds: [],
      commissionLeaderIds: [],
    });
    const ids = await getLeaderIdsForEvent(client, EVENT_ID, ORG_ID);
    assert.strictEqual(ids.length, 0);
  });
});
