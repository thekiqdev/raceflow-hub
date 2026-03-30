/** Normaliza para 11 dígitos ou string vazia. */
export function normalizeCpfDigits(input: string): string {
  return String(input || '').replace(/\D/g, '').slice(0, 11);
}

/** Máscara para logs (nunca logar CPF completo). */
export function maskCpf(digits: string): string {
  const d = normalizeCpfDigits(digits);
  if (d.length !== 11) return '***';
  return `***.***.***-${d.slice(9, 11)}`;
}

/**
 * Valida CPF brasileiro (11 dígitos + dígitos verificadores).
 * Rejeita sequências óbvias inválidas (todos iguais).
 */
export function isValidCpfDigits(digits: string): boolean {
  const cpf = normalizeCpfDigits(digits);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf[i], 10) * (10 - i);
  }
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf[i], 10) * (11 - i);
  }
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  if (d2 !== parseInt(cpf[10], 10)) return false;

  return true;
}
