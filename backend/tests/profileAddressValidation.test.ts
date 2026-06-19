import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaceName } from '../src/utils/profileNormalization.js';
import {
  validatePhone,
  validatePostalCode,
  validateCity,
  validateNeighborhood,
  PHONE_VALIDATION_MESSAGE,
  POSTAL_CODE_VALIDATION_MESSAGE,
  CITY_VALIDATION_MESSAGE,
  NEIGHBORHOOD_VALIDATION_MESSAGE,
} from '../src/utils/profileValidation.js';

describe('profileAddressValidation — Sprint 4 phone', () => {
  for (const phone of ['13997776655', '1333224455']) {
    it(`accepts ${phone}`, () => {
      const result = validatePhone(phone);
      assert.equal(result.valid, true);
    });
  }

  for (const phone of ['123', '99999999999', '00000000000', '11111111111']) {
    it(`rejects ${phone}`, () => {
      const result = validatePhone(phone);
      assert.equal(result.valid, false);
      assert.equal(result.message, PHONE_VALIDATION_MESSAGE);
    });
  }
});

describe('profileAddressValidation — Sprint 4 postal code', () => {
  for (const cep of ['11702500', '01001000']) {
    it(`accepts ${cep}`, () => {
      const result = validatePostalCode(cep);
      assert.equal(result.valid, true);
    });
  }

  for (const cep of ['123', '11111111', '99999999', '00000000']) {
    it(`rejects ${cep}`, () => {
      const result = validatePostalCode(cep);
      assert.equal(result.valid, false);
      assert.equal(result.message, POSTAL_CODE_VALIDATION_MESSAGE);
    });
  }

  it('accepts masked CEP', () => {
    assert.equal(validatePostalCode('11702-500').valid, true);
  });
});

describe('profileAddressValidation — Sprint 4 city', () => {
  for (const city of ['Praia Grande', 'São Paulo', 'Rio de Janeiro']) {
    it(`accepts ${city}`, () => {
      const result = validateCity(city);
      assert.equal(result.valid, true);
    });
  }

  for (const city of ['123456', '99999', '12']) {
    it(`rejects ${city}`, () => {
      const result = validateCity(city);
      assert.equal(result.valid, false);
      assert.equal(result.message, CITY_VALIDATION_MESSAGE);
    });
  }

  it('title-cases on normalization', () => {
    assert.equal(normalizePlaceName('PRAIA GRANDE'), 'Praia Grande');
    assert.equal(normalizePlaceName('RIO DE JANEIRO'), 'Rio de Janeiro');
  });
});

describe('profileAddressValidation — Sprint 4 neighborhood', () => {
  for (const neighborhood of ['Boqueirao', 'Ocian', 'Tupi']) {
    it(`accepts ${neighborhood}`, () => {
      const result = validateNeighborhood(neighborhood);
      assert.equal(result.valid, true);
    });
  }

  for (const neighborhood of ['123456', '99999', '00000']) {
    it(`rejects ${neighborhood}`, () => {
      const result = validateNeighborhood(neighborhood);
      assert.equal(result.valid, false);
      assert.equal(result.message, NEIGHBORHOOD_VALIDATION_MESSAGE);
    });
  }

  it('title-cases neighborhood', () => {
    assert.equal(normalizePlaceName('BOQUEIRAO'), 'Boqueirao');
  });
});
