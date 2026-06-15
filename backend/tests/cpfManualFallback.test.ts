/**
 * Sprint 1 — fallback CPF manual (backend only).
 * Execução: npm run test:cpf-manual-fallback
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createManualCpfProof,
  verifyManualCpfProof,
  manualProofMatchesRegisterBody,
  isManualCpfWhenNotFoundEnabled,
  issueCpfLookupProof,
  verifyCpfLookupProof,
  proofMatchesRegisterBody,
} from '../src/services/cpfLookupProof.js';
import { buildLookupFailureResult } from '../src/services/cpfLookupService.js';
import { isValidCpfDigits } from '../src/utils/cpf.js';

const VALID_CPF = '52998224725';

describe('CPF manual fallback — Sprint 1', () => {
  const prevJwt = process.env.JWT_SECRET;
  const prevFlag = process.env.CPF_ALLOW_MANUAL_WHEN_NOT_FOUND;

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-cpf-manual-fallback';
  });

  afterEach(() => {
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
    if (prevFlag === undefined) delete process.env.CPF_ALLOW_MANUAL_WHEN_NOT_FOUND;
    else process.env.CPF_ALLOW_MANUAL_WHEN_NOT_FOUND = prevFlag;
  });

  it('Caso 4 — CPF inválido rejeitado localmente', () => {
    assert.strictEqual(isValidCpfDigits('11111111111'), false);
    assert.strictEqual(isValidCpfDigits('00000000000'), false);
    assert.strictEqual(isValidCpfDigits('12345678900'), false);
  });

  it('Caso 2 — EXTERNAL_NOT_FOUND + flag true → CPF_NOT_IN_REGISTRY + proof', () => {
    process.env.CPF_ALLOW_MANUAL_WHEN_NOT_FOUND = 'true';
    assert.strictEqual(isManualCpfWhenNotFoundEnabled(), true);

    const requestId = 'test-req-1';
    const result = buildLookupFailureResult('EXTERNAL_NOT_FOUND', VALID_CPF, requestId);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.code, 'CPF_NOT_IN_REGISTRY');
    assert.strictEqual(result.manual_entry_allowed, true);
    assert.ok(result.proof);
    assert.strictEqual(result.data, null);
    assert.notStrictEqual(result.message, 'CPF inválido');

    const payload = verifyManualCpfProof(result.proof!);
    assert.ok(payload);
    assert.strictEqual(payload!.cpf, VALID_CPF);
    assert.strictEqual(payload!.version, 'manual_proof_v1');
    assert.ok(payload!.issued_at);
    assert.ok(payload!.expires_at);
  });

  it('Caso 3 — EXTERNAL_NOT_FOUND + flag false → comportamento legado', () => {
    process.env.CPF_ALLOW_MANUAL_WHEN_NOT_FOUND = 'false';
    assert.strictEqual(isManualCpfWhenNotFoundEnabled(), false);

    const result = buildLookupFailureResult('EXTERNAL_NOT_FOUND', VALID_CPF, 'test-req-2');

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'EXTERNAL_NOT_FOUND');
    assert.strictEqual(result.message, 'CPF inválido');
    assert.strictEqual(result.proof, undefined);
  });

  it('Caso 1 — cpf_lookup_v1 inalterado (proof API)', () => {
    const proof = issueCpfLookupProof({
      cpf: VALID_CPF,
      full_name: 'Nome Teste',
      birth_date: '1990-05-15',
      gender: 'M',
    });
    const payload = verifyCpfLookupProof(proof);
    assert.ok(payload);
    assert.strictEqual(payload!.sub, 'cpf_lookup_v1');
    assert.strictEqual(
      proofMatchesRegisterBody(payload!, {
        cpf: VALID_CPF,
        full_name: 'Nome Teste',
        birth_date: '1990-05-15',
        gender: 'M',
      }),
      true
    );
  });

  it('manual_proof_v1 — register body match só por CPF', () => {
    const proof = createManualCpfProof(VALID_CPF);
    const payload = verifyManualCpfProof(proof);
    assert.ok(payload);
    assert.strictEqual(
      manualProofMatchesRegisterBody(payload!, { cpf: VALID_CPF }),
      true
    );
    assert.strictEqual(
      manualProofMatchesRegisterBody(payload!, { cpf: '529.982.247-25' }),
      true
    );
    assert.strictEqual(
      manualProofMatchesRegisterBody(payload!, { cpf: '39053344705' }),
      false
    );
  });

  it('coexistência — proofs API e manual são distintos', () => {
    const apiProof = issueCpfLookupProof({
      cpf: VALID_CPF,
      full_name: 'A',
      birth_date: '2000-01-01',
      gender: 'F',
    });
    const manualProof = createManualCpfProof(VALID_CPF);

    assert.ok(verifyCpfLookupProof(apiProof));
    assert.strictEqual(verifyManualCpfProof(apiProof), null);
    assert.ok(verifyManualCpfProof(manualProof));
    assert.strictEqual(verifyCpfLookupProof(manualProof), null);
  });
});
