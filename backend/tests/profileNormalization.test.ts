import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  normalizePhoneDigits,
  normalizePostalCode,
  normalizePersonName,
  normalizePlaceName,
} from '../src/utils/profileNormalization.js';

describe('profileNormalization — Sprint 1 soft', () => {
  it('normalizeEmail trims and lowercases', () => {
    assert.equal(normalizeEmail(' JOAO@GMAIL.COM '), 'joao@gmail.com');
  });

  it('normalizePhoneDigits removes mask', () => {
    assert.equal(normalizePhoneDigits('(11) 99507-6662'), '11995076662');
  });

  it('normalizePostalCode removes mask', () => {
    assert.equal(normalizePostalCode('11702-110'), '11702110');
  });

  it('normalizePersonName collapses whitespace and title-cases', () => {
    assert.equal(normalizePersonName('   JOAO    DA   SILVA   '), 'Joao da Silva');
  });

  it('normalizePlaceName title-cases with particles', () => {
    assert.equal(normalizePlaceName('  PRAIA     GRANDE  '), 'Praia Grande');
    assert.equal(normalizePlaceName('BOQUEIRAO'), 'Boqueirao');
  });
});
