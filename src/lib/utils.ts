import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte um valor datetime-local (YYYY-MM-DDTHH:mm) para ISO string
 * preservando o horário exato informado (sem conversão de timezone)
 * Se o horário estiver vazio, usa 00:00
 * 
 * IMPORTANTE: Esta função cria a data em UTC para preservar o horário exato
 * informado pelo usuário, evitando conversões de timezone.
 */
export function datetimeLocalToISO(datetimeLocal: string | null | undefined): string | null {
  if (!datetimeLocal || datetimeLocal.trim() === '') {
    return null;
  }

  // Se não tiver horário, adiciona 00:00
  if (datetimeLocal.length === 10) {
    datetimeLocal = `${datetimeLocal}T00:00`;
  }

  // datetimeLocal está no formato YYYY-MM-DDTHH:mm
  const [datePart, timePart] = datetimeLocal.split('T');
  if (!datePart) {
    return null;
  }

  const [year, month, day] = datePart.split('-').map(Number);
  const [hours = 0, minutes = 0] = (timePart || '00:00').split(':').map(Number);

  // Cria Date object em UTC para preservar o horário exato informado
  // Isso evita conversões de timezone que podem alterar o horário
  // Exemplo: se o usuário digita 00:00, queremos salvar 00:00 UTC, não 03:00 UTC
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  
  // Retorna ISO string (já está em UTC)
  return date.toISOString();
}

/**
 * Converte uma ISO string ou Date para datetime-local (YYYY-MM-DDTHH:mm)
 * preservando o horário exato (usando UTC para evitar conversões)
 * 
 * IMPORTANTE: Como salvamos em UTC, precisamos ler em UTC também
 * para preservar o horário exato que o usuário digitou.
 */
export function isoToDatetimeLocal(isoString: string | Date | null | undefined): string {
  if (!isoString) {
    return '';
  }

  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  
  if (isNaN(date.getTime())) {
    return '';
  }

  // Usa métodos UTC para preservar o horário exato que foi salvo
  // Isso garante que se salvamos 00:00 UTC, exibimos 00:00 no campo
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Processa um valor de datetime-local para salvar
 * Se o horário estiver vazio ou apenas a data for preenchida, usa 00:00
 * 
 * O input type="datetime-local" pode retornar:
 * - Formato completo: YYYY-MM-DDTHH:mm (quando data e hora são preenchidos)
 * - Apenas data: YYYY-MM-DD (quando apenas a data é preenchida, mas isso não é permitido pelo input)
 * - Vazio: "" (quando nada é preenchido)
 * 
 * IMPORTANTE: Se o usuário preencher apenas a data e deixar o horário em branco,
 * o input pode retornar um valor inválido. Esta função garante que sempre
 * adiciona 00:00 quando necessário.
 */
export function processDatetimeLocalForSave(datetimeLocal: string | null | undefined): string | null {
  if (!datetimeLocal || datetimeLocal.trim() === '') {
    return null;
  }

  // Remove espaços em branco
  datetimeLocal = datetimeLocal.trim();
  
  console.log('🔧 processDatetimeLocalForSave - entrada:', datetimeLocal, 'tamanho:', datetimeLocal.length);

  // Se só tiver a data (sem horário), adiciona 00:00
  // O formato YYYY-MM-DD tem exatamente 10 caracteres
  if (datetimeLocal.length === 10 && datetimeLocal.match(/^\d{4}-\d{2}-\d{2}$/)) {
    datetimeLocal = `${datetimeLocal}T00:00`;
    console.log('✅ Adicionado T00:00 para data sem horário:', datetimeLocal);
  }

  // Garante que tem o formato completo YYYY-MM-DDTHH:mm
  if (!datetimeLocal.includes('T')) {
    // Se não tem T mas tem mais de 10 caracteres, pode ser um formato diferente
    if (datetimeLocal.length > 10) {
      console.warn('⚠️ Formato inesperado (sem T mas > 10 chars):', datetimeLocal);
      return null;
    }
    datetimeLocal = `${datetimeLocal}T00:00`;
    console.log('✅ Adicionado T00:00 (sem T):', datetimeLocal);
  }

  // Se o horário estiver vazio ou inválido após o T, adiciona 00:00
  const [datePart, timePart] = datetimeLocal.split('T');
  
  console.log('🔧 datePart:', datePart, 'timePart:', timePart);
  
  // Valida a parte da data
  if (!datePart || !datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
    console.warn('⚠️ Data inválida:', datePart);
    return null;
  }

  // Se não tiver parte do tempo ou estiver vazia/inválida, adiciona 00:00
  if (!timePart || timePart.trim() === '' || !timePart.match(/^\d{2}:\d{2}$/)) {
    datetimeLocal = `${datePart}T00:00`;
    console.log('✅ Horário vazio/inválido, adicionado 00:00:', datetimeLocal);
  }

  // Valida o formato final antes de converter
  if (!datetimeLocal.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    console.warn('⚠️ Formato final inválido:', datetimeLocal);
    return null;
  }

  console.log('✅ Formato válido, convertendo:', datetimeLocal);
  const result = datetimeLocalToISO(datetimeLocal);
  console.log('✅ Resultado final:', result);
  
  return result;
}