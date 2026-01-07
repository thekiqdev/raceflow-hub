/**
 * Utility functions for field validation
 */

/**
 * Validate CPF
 * @param cpf - CPF with or without mask
 * @returns true if valid, false otherwise
 */
export const validateCpf = (cpf: string): boolean => {
  const cleanCpf = cpf.replace(/\D/g, '');
  
  // Check if has 11 digits
  if (cleanCpf.length !== 11) {
    return false;
  }
  
  // Check if all digits are the same (invalid CPF)
  if (/^(\d)\1{10}$/.test(cleanCpf)) {
    return false;
  }
  
  // Validate CPF algorithm
  let sum = 0;
  let remainder: number;
  
  // Validate first digit
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCpf.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf.substring(9, 10))) {
    return false;
  }
  
  // Validate second digit
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCpf.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCpf.substring(10, 11))) {
    return false;
  }
  
  return true;
};

/**
 * Validate credit card number using Luhn algorithm
 * @param cardNumber - Card number with or without spaces
 * @returns true if valid, false otherwise
 */
export const validateCreditCardNumber = (cardNumber: string): boolean => {
  const numbers = cardNumber.replace(/\D/g, '');
  
  // Check if has between 13 and 19 digits
  if (numbers.length < 13 || numbers.length > 19) {
    return false;
  }
  
  // Luhn algorithm
  let sum = 0;
  let isEven = false;
  
  // Process from right to left
  for (let i = numbers.length - 1; i >= 0; i--) {
    let digit = parseInt(numbers[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

/**
 * Get credit card brand from number
 * @param cardNumber - Card number (with or without spaces)
 * @returns Brand name or 'unknown'
 */
export const getCreditCardBrand = (cardNumber: string): string => {
  const numbers = cardNumber.replace(/\D/g, '');
  const firstDigit = numbers[0];
  const firstTwoDigits = numbers.slice(0, 2);
  const firstFourDigits = numbers.slice(0, 4);
  
  // Visa: starts with 4
  if (firstDigit === '4') {
    return 'visa';
  }
  
  // Mastercard: starts with 51-55 or 2221-2720
  if (
    (parseInt(firstTwoDigits) >= 51 && parseInt(firstTwoDigits) <= 55) ||
    (parseInt(firstFourDigits) >= 2221 && parseInt(firstFourDigits) <= 2720)
  ) {
    return 'mastercard';
  }
  
  // Amex: starts with 34 or 37
  if (firstTwoDigits === '34' || firstTwoDigits === '37') {
    return 'amex';
  }
  
  // Elo: starts with 401178, 401179, 431274, 438935, 451416, 457393, 457631, 457632, 504175, 627780, 636297, 636368, 650031, 650033, 650035, 650051, 650405, 650439, 650485, 650488, 650489, 650490, 650491, 650492, 650493, 650494, 650495, 650496, 650497, 650498, 650499, 506699, 509000, 509999, 650531, 650538, 650539, 650540, 650541, 650542, 650543, 650544, 650545, 650546, 650547, 650548, 650549, 650550, 650551, 650552, 650553, 650554, 650555, 650556, 650557, 650558, 650559, 650560, 650561, 650562, 650563, 650564, 650565, 650566, 650567, 650568, 650569, 650570, 650571, 650572, 650573, 650574, 650575, 650576, 650577, 650578, 650579, 650580, 650581, 650582, 650583, 650584, 650585, 650586, 650587, 650588, 650589, 650590, 650591, 650592, 650593, 650594, 650595, 650596, 650597, 650598, 650599, 636297, 636368
  // Simplificando: Elo geralmente começa com 50, 63, 65, 40, 43, 45
  if (
    firstTwoDigits === '50' ||
    firstTwoDigits === '63' ||
    firstTwoDigits === '65' ||
    firstTwoDigits === '40' ||
    firstTwoDigits === '43' ||
    firstTwoDigits === '45'
  ) {
    return 'elo';
  }
  
  // Hipercard: starts with 38 or 60
  if (firstTwoDigits === '38' || firstTwoDigits === '60') {
    return 'hipercard';
  }
  
  return 'unknown';
};

/**
 * Validate credit card expiry date
 * @param month - Month (MM)
 * @param year - Year (YYYY)
 * @returns true if valid, false otherwise
 */
export const validateCreditCardExpiry = (month: string, year: string): boolean => {
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);
  
  // Check if month is valid (01-12)
  if (monthNum < 1 || monthNum > 12) {
    return false;
  }
  
  // Check if year is valid (current year or future)
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  if (yearNum < currentYear) {
    return false;
  }
  
  // If same year, check if month is not in the past
  if (yearNum === currentYear && monthNum < currentMonth) {
    return false;
  }
  
  return true;
};

/**
 * Validate CVV
 * @param cvv - CVV code (3 or 4 digits)
 * @returns true if valid, false otherwise
 */
export const validateCVV = (cvv: string): boolean => {
  const numbers = cvv.replace(/\D/g, '');
  return numbers.length === 3 || numbers.length === 4;
};

/**
 * Validate CEP (Brazilian postal code)
 * @param cep - CEP with or without mask
 * @returns true if valid, false otherwise
 */
export const validateCep = (cep: string): boolean => {
  const cleanCep = cep.replace(/\D/g, '');
  return cleanCep.length === 8;
};

/**
 * Validate phone number
 * @param phone - Phone with or without mask
 * @returns true if valid, false otherwise
 */
export const validatePhone = (phone: string): boolean => {
  const cleanPhone = phone.replace(/\D/g, '');
  // Brazilian phone: 10 digits (landline) or 11 digits (mobile)
  return cleanPhone.length === 10 || cleanPhone.length === 11;
};

/**
 * Validate email
 * @param email - Email address
 * @returns true if valid, false otherwise
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param password - Password
 * @returns object with isValid and requirements
 */
export const validatePassword = (password: string): { isValid: boolean; requirements: string[] } => {
  const requirements: string[] = [];
  
  if (password.length < 6) {
    requirements.push('Mínimo de 6 caracteres');
  }
  
  return {
    isValid: password.length >= 6,
    requirements,
  };
};

/**
 * Validate minimum age
 * @param minAge - Minimum age value
 * @returns true if valid (0 or positive integer), false otherwise
 */
export const validateMinAge = (minAge: number | null | undefined): boolean => {
  if (minAge === null || minAge === undefined) return true; // Optional field
  return Number.isInteger(minAge) && minAge >= 0 && minAge <= 120;
};

/**
 * Validate category gender
 * @param gender - Gender value
 * @returns true if valid, false otherwise
 */
export const validateCategoryGender = (gender: string): boolean => {
  const validGenders = ['ambos', 'masculino', 'feminino'];
  return validGenders.includes(gender.toLowerCase());
};

/**
 * Validate category type
 * @param categoryType - Category type value
 * @returns true if valid, false otherwise
 */
export const validateCategoryType = (categoryType: string): boolean => {
  const validTypes = ['visitante', 'local', 'geral', 'PCD', 'militar', 'civil', 'outro'];
  return validTypes.includes(categoryType.toLowerCase());
};

/**
 * Check if user age meets category age requirements (min_age and max_age)
 * @param birthDate - User's birth date (ISO string)
 * @param minAge - Category minimum age requirement
 * @param maxAge - Category maximum age requirement
 * @returns true if user meets age requirements, false otherwise
 */
export const validateAgeRequirement = (
  birthDate: string | null | undefined, 
  minAge: number | null | undefined,
  maxAge?: number | null | undefined
): boolean => {
  if (!birthDate) return false; // Need birth date to validate age
  
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  // Check min_age
  if (minAge !== null && minAge !== undefined && minAge > 0) {
    if (age < minAge) return false;
  }
  
  // Check max_age
  if (maxAge !== null && maxAge !== undefined && maxAge > 0) {
    if (age > maxAge) return false;
  }
  
  return true;
};

/**
 * Check if user gender matches category gender requirement
 * @param userGender - User's gender ('M', 'F', 'masculino', 'feminino', etc.)
 * @param categoryGender - Category gender requirement ('ambos', 'masculino', 'feminino')
 * @returns true if user matches gender requirement, false otherwise
 */
export const validateGenderRequirement = (userGender: string | null | undefined, categoryGender: string): boolean => {
  if (categoryGender === 'ambos') return true;
  
  if (!userGender) return false;
  
  const normalizedUserGender = userGender.toLowerCase();
  const normalizedCategoryGender = categoryGender.toLowerCase();
  
  // Map various gender formats to standard format
  const genderMap: { [key: string]: 'masculino' | 'feminino' } = {
    'm': 'masculino',
    'masculino': 'masculino',
    'male': 'masculino',
    'f': 'feminino',
    'feminino': 'feminino',
    'female': 'feminino',
  };
  
  const mappedUserGender = genderMap[normalizedUserGender];
  if (!mappedUserGender) return false;
  
  return mappedUserGender === normalizedCategoryGender;
};

