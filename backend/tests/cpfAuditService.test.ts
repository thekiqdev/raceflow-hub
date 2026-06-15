/**
 * Sprint 5 — auditoria CPF (sem PII).
 * Execução: npm run test:cpf-audit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  hashCpfForAudit,
  normalizeAuditResultCode,
  computeApiSuccessRatePct,
  getProviderHealthLevel,
} from '../src/services/cpfAuditService.js';
import { isValidCpfDigits } from '../src/utils/cpf.js';

const VALID_CPF = '52998224725';
const VALID_CPF_2 = '16899535009';

describe('CPF audit service — Sprint 5', () => {
  it('nunca armazena CPF puro no hash', () => {
    const hash = hashCpfForAudit(VALID_CPF);
    assert.notStrictEqual(hash, VALID_CPF);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.strictEqual(hashCpfForAudit('52998224725'), hashCpfForAudit('529.982.247-25'));
  });

  it('normaliza OK para CPF_LOOKUP_OK', () => {
    assert.strictEqual(normalizeAuditResultCode('OK'), 'CPF_LOOKUP_OK');
    assert.strictEqual(normalizeAuditResultCode('CPF_NOT_IN_REGISTRY'), 'CPF_NOT_IN_REGISTRY');
    assert.strictEqual(normalizeAuditResultCode('EXTERNAL_TIMEOUT'), 'EXTERNAL_TIMEOUT');
  });

  it('bloqueia CPFs inválidos conhecidos (alinhado com isValidCpfDigits)', () => {
    for (const invalid of ['11111111111', '00000000000', '12345678900']) {
      assert.strictEqual(isValidCpfDigits(invalid), false);
    }
  });

  it('aceita CPFs válidos com e sem máscara', () => {
    assert.strictEqual(isValidCpfDigits(VALID_CPF), true);
    assert.strictEqual(isValidCpfDigits(VALID_CPF_2), true);
    assert.strictEqual(isValidCpfDigits('529.982.247-25'), true);
  });

  it('calcula taxa de sucesso e saúde do provedor', () => {
    assert.strictEqual(computeApiSuccessRatePct(978, 1000), 97.8);
    assert.strictEqual(getProviderHealthLevel(99), 'excellent');
    assert.strictEqual(getProviderHealthLevel(96), 'good');
    assert.strictEqual(getProviderHealthLevel(92), 'attention');
    assert.strictEqual(getProviderHealthLevel(85), 'critical');
  });

  it('mapeia códigos de métricas obrigatórios', () => {
    const codes = [
      'CPF_LOOKUP_OK',
      'CPF_NOT_IN_REGISTRY',
      'LOCAL_INVALID_FORMAT',
      'EXTERNAL_TIMEOUT',
      'EXTERNAL_QUOTA',
      'EXTERNAL_AUTH',
      'EXTERNAL_PLAN',
      'EXTERNAL_BAD_RESPONSE',
      'RATE_LIMITED',
    ] as const;
    for (const code of codes) {
      assert.strictEqual(normalizeAuditResultCode(code), code);
    }
  });
});
