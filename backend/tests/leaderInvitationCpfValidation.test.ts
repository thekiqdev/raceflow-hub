/**
 * Sprint 4 — CPF hardening em leader invitations.
 * Execução: npm run test:leader-invitation-cpf
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isValidCpfDigits } from '../src/utils/cpf.js';
import { sendInvitationByCpf } from '../src/services/leaderInvitationsService.js';

const VALID_CPF = '52998224725';
const VALID_CPF_2 = '16899535009';

function cleanCpfInput(input: string): string {
  return input.replace(/\D/g, '');
}

/** Mesma regra aplicada em sendInvitationByCpf e no controller Zod. */
function leaderInvitationCpfAccepted(input: string): boolean {
  return isValidCpfDigits(cleanCpfInput(input));
}

describe('Leader invitation CPF validation — Sprint 4', () => {
  it('bloqueia CPF com dígitos repetidos', () => {
    assert.strictEqual(leaderInvitationCpfAccepted('11111111111'), false);
    assert.strictEqual(leaderInvitationCpfAccepted('00000000000'), false);
  });

  it('bloqueia CPF com checksum inválido', () => {
    assert.strictEqual(leaderInvitationCpfAccepted('12345678900'), false);
  });

  it('aceita CPF válido sem máscara', () => {
    assert.strictEqual(leaderInvitationCpfAccepted(VALID_CPF), true);
    assert.strictEqual(leaderInvitationCpfAccepted(VALID_CPF_2), true);
  });

  it('aceita CPF válido com máscara', () => {
    assert.strictEqual(leaderInvitationCpfAccepted('529.982.247-25'), true);
    assert.strictEqual(leaderInvitationCpfAccepted('168.995.350-09'), true);
  });

  it('sendInvitationByCpf rejeita CPF inválido antes de acessar o banco', async () => {
    await assert.rejects(
      () => sendInvitationByCpf('leader-id', 'invitation-id', '11111111111'),
      (err: unknown) => err instanceof Error && err.message === 'CPF inválido'
    );
    await assert.rejects(
      () => sendInvitationByCpf('leader-id', 'invitation-id', '123.456.789-00'),
      (err: unknown) => err instanceof Error && err.message === 'CPF inválido'
    );
  });
});
