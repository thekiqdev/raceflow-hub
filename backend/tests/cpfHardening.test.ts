/**
 * Sprint 3 — hardening CPF: algoritmo único (isValidCpfDigits).
 * Execução: npm run test:cpf-hardening
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isValidCpfDigits } from '../src/utils/cpf.js';

describe('CPF hardening — Sprint 3', () => {
  it('rejeita CPFs inválidos conhecidos', () => {
    assert.strictEqual(isValidCpfDigits('11111111111'), false);
    assert.strictEqual(isValidCpfDigits('00000000000'), false);
    assert.strictEqual(isValidCpfDigits('12345678900'), false);
  });

  it('aceita CPFs válidos conhecidos', () => {
    assert.strictEqual(isValidCpfDigits('52998224725'), true);
    assert.strictEqual(isValidCpfDigits('16899535009'), true);
  });
});
