/**
 * Utility functions for applying masks to input fields
 */

/**
 * Apply CPF mask (000.000.000-00)
 */
export const maskCpf = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length <= 3) {
    return numbers;
  } else if (numbers.length <= 6) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  } else if (numbers.length <= 9) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  } else {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  }
};

/** Campo único de login: e-mail (letras / @) ou apenas CPF com máscara. */
export const maskEmailOrCpf = (value: string): string => {
  if (value.includes('@') || /[a-zA-ZÀ-ÿ]/.test(value)) {
    return value;
  }
  return maskCpf(value);
};

/**
 * Apply phone mask ((00) 00000-0000 or (00) 0000-0000)
 */
export const maskPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length === 0) {
    return '';
  } else if (numbers.length <= 2) {
    return `(${numbers}`;
  } else if (numbers.length <= 7) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  } else if (numbers.length <= 10) {
    // Landline: (00) 0000-0000
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  } else {
    // Mobile: (00) 00000-0000
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  }
};

/**
 * Apply CEP mask (00000-000)
 */
export const maskCep = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length <= 5) {
    return numbers;
  } else {
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  }
};

/**
 * Apply credit card number mask (0000 0000 0000 0000)
 */
export const maskCreditCard = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  // Limit to 16 digits
  const limitedNumbers = numbers.slice(0, 16);
  
  // Add spaces every 4 digits
  return limitedNumbers.replace(/(\d{4})(?=\d)/g, '$1 ');
};

/**
 * Remove all masks from a string (keep only numbers)
 */
export const unmask = (value: string): string => {
  return value.replace(/\D/g, '');
};

