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
 * Check if user age meets category minimum age requirement
 * @param birthDate - User's birth date (ISO string)
 * @param minAge - Category minimum age requirement
 * @returns true if user meets age requirement, false otherwise
 */
export const validateAgeRequirement = (birthDate: string | null | undefined, minAge: number | null | undefined): boolean => {
  if (!birthDate || !minAge || minAge === 0) return true; // No requirement
  
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age >= minAge;
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

