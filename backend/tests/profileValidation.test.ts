import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFullName,
  FULL_NAME_VALIDATION_MESSAGE,
} from '../src/utils/profileValidation.js';

describe('profileValidation — Sprint 2 full_name', () => {
  const validCases = [
    'João Silva',
    'Maria Fernanda',
    'José dos Santos',
    'Ana Clara Souza',
    "João D'Ávila",
  ];

  const invalidCases = ['João', 'Maria', 'AAA', 'X', ''];

  for (const name of validCases) {
    it(`accepts "${name}"`, () => {
      const result = validateFullName(name);
      assert.equal(result.valid, true);
    });
  }

  for (const name of invalidCases) {
    it(`rejects "${name || "(empty)"}"`, () => {
      const result = validateFullName(name);
      assert.equal(result.valid, false);
      assert.equal(result.message, FULL_NAME_VALIDATION_MESSAGE);
    });
  }

  it('collapses duplicate spaces', () => {
    const result = validateFullName('  João    Silva  ');
    assert.equal(result.valid, true);
  });
});
