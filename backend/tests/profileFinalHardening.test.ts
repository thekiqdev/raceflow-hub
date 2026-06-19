import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBirthDateRange,
  validateGender,
  validatePhone,
  validateContactEmail,
  normalizeGender,
  BIRTH_DATE_VALIDATION_MESSAGE,
  GENDER_VALIDATION_MESSAGE,
  PHONE_VALIDATION_MESSAGE,
  EMAIL_VALIDATION_MESSAGE,
} from '../src/utils/profileValidation.js';
import {
  recordProfileValidationRejection,
  getProfileValidationMetrics,
  clearProfileValidationMetrics,
} from '../src/utils/profileValidationMetrics.js';

function birthDateYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().split('T')[0];
}

describe('profileFinalHardening — birth_date', () => {
  it('accepts 8 years old', () => {
    const result = validateBirthDateRange(birthDateYearsAgo(8));
    assert.equal(result.valid, true);
  });

  it('accepts 120 years old', () => {
    const result = validateBirthDateRange(birthDateYearsAgo(120));
    assert.equal(result.valid, true);
  });

  it('rejects 2 years old', () => {
    const result = validateBirthDateRange(birthDateYearsAgo(2));
    assert.equal(result.valid, false);
    assert.equal(result.message, BIRTH_DATE_VALIDATION_MESSAGE);
  });

  it('rejects 130 years old', () => {
    const result = validateBirthDateRange(birthDateYearsAgo(130));
    assert.equal(result.valid, false);
    assert.equal(result.message, BIRTH_DATE_VALIDATION_MESSAGE);
  });
});

describe('profileFinalHardening — gender', () => {
  for (const gender of ['M', 'F', 'O']) {
    it(`accepts ${gender}`, () => {
      assert.equal(validateGender(gender).valid, true);
      assert.equal(normalizeGender(gender), gender);
    });
  }

  for (const gender of ['X', 'Masculino', 'Feminino']) {
    it(`rejects ${gender}`, () => {
      const result = validateGender(gender);
      assert.equal(result.valid, false);
      assert.equal(result.message, GENDER_VALIDATION_MESSAGE);
    });
  }
});

describe('profileFinalHardening — contact_phone', () => {
  it('accepts valid phone', () => {
    assert.equal(validatePhone('13997776655').valid, true);
  });

  it('rejects invalid phone', () => {
    const result = validatePhone('99999999999');
    assert.equal(result.valid, false);
    assert.equal(result.message, PHONE_VALIDATION_MESSAGE);
  });
});

describe('profileFinalHardening — contact_email', () => {
  it('accepts normalized uppercase email', () => {
    const result = validateContactEmail('  JOAO@GMAIL.COM  ');
    assert.equal(result.valid, true);
  });

  it('rejects invalid format', () => {
    const result = validateContactEmail('invalid-email');
    assert.equal(result.valid, false);
    assert.equal(result.message, EMAIL_VALIDATION_MESSAGE);
  });

  it('rejects email with only spaces', () => {
    const result = validateContactEmail('   ');
    assert.equal(result.valid, false);
    assert.equal(result.message, EMAIL_VALIDATION_MESSAGE);
  });
});

describe('profileValidationMetrics', () => {
  it('records rejection without PII', () => {
    clearProfileValidationMetrics();
    recordProfileValidationRejection('INVALID_PHONE', 'test.source');
    const events = getProfileValidationMetrics();
    assert.equal(events.length, 1);
    assert.deepEqual(Object.keys(events[0]).sort(), ['code', 'source', 'timestamp']);
    assert.equal(events[0].code, 'INVALID_PHONE');
    assert.equal(events[0].source, 'test.source');
  });
});
