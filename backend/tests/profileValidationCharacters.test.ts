import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePersonName } from '../src/utils/profileNormalization.js';
import {
  validateFullName,
  FULL_NAME_VALIDATION_MESSAGE,
  FULL_NAME_CHARACTERS_MESSAGE,
} from '../src/utils/profileValidation.js';

describe('profileValidation — Sprint 3 characters', () => {
  const validCases = [
    'João Silva',
    'José dos Santos',
    'Maria Fernanda Costa',
    'Ana Clara Souza',
    "João D'Ávila",
    'Jean-Pierre Moreira',
  ];

  const invalidCharacterCases = [
    '11999999999',
    '123456',
    '000000',
    'Joao123 Silva',
    'Joao 11999999999',
    'Teste 123',
    'A1 B2',
  ];

  for (const name of validCases) {
    it(`accepts "${name}"`, () => {
      const result = validateFullName(name);
      assert.equal(result.valid, true);
    });
  }

  for (const name of invalidCharacterCases) {
    it(`rejects invalid characters in "${name}"`, () => {
      const result = validateFullName(name);
      assert.equal(result.valid, false);
      assert.equal(result.message, FULL_NAME_CHARACTERS_MESSAGE);
    });
  }

  it('accepts accents', () => {
    assert.equal(validateFullName('José Antônio Lima').valid, true);
  });

  it('accepts hyphen within a word', () => {
    assert.equal(validateFullName('Jean-Pierre Dupont').valid, true);
  });

  it('accepts apostrophe within a word', () => {
    assert.equal(validateFullName("Maria D'Angelo").valid, true);
  });

  it('rejects symbols', () => {
    const result = validateFullName('João@ Silva');
    assert.equal(result.valid, false);
    assert.equal(result.message, FULL_NAME_CHARACTERS_MESSAGE);
  });
});

describe('normalizePersonName — Sprint 3 title case', () => {
  it('title-cases all-uppercase names with particles', () => {
    assert.equal(normalizePersonName('JOAO DA SILVA'), 'Joao da Silva');
    assert.equal(normalizePersonName('MARIA DE SOUZA'), 'Maria de Souza');
    assert.equal(normalizePersonName('JOSE DOS SANTOS'), 'Jose dos Santos');
  });

  it('title-cases mixed casing', () => {
    assert.equal(normalizePersonName('jOsE DOS santos'), 'Jose dos Santos');
  });

  it('keeps particles lowercase in the middle', () => {
    assert.equal(normalizePersonName('Ana da Costa'), 'Ana da Costa');
    assert.equal(normalizePersonName('ANA DA COSTA'), 'Ana da Costa');
  });

  it('capitalizes particle at start or end', () => {
    assert.equal(normalizePersonName('DE SOUZA'), 'De Souza');
    assert.equal(normalizePersonName('Maria De'), 'Maria De');
  });

  it('handles hyphenated names', () => {
    assert.equal(
      normalizePersonName('JEAN-PIERRE MOREIRA'),
      'Jean-Pierre Moreira'
    );
  });

  it('handles apostrophe in names', () => {
    assert.equal(normalizePersonName("JOAO D'AVILA"), "Joao D'Avila");
  });

  it('collapses duplicate spaces', () => {
    assert.equal(
      normalizePersonName('   MARIA    FERNANDA   '),
      'Maria Fernanda'
    );
  });
});

describe('validateFullName — structure still enforced', () => {
  it('rejects single-word names with structure message', () => {
    const result = validateFullName('João');
    assert.equal(result.valid, false);
    assert.equal(result.message, FULL_NAME_VALIDATION_MESSAGE);
  });
});
