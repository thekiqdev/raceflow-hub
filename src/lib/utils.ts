import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TIMEZONE_BRASILIA = 'America/Sao_Paulo';

/**
 * Formata uma data/hora ISO para exibição em Brasília (data por extenso em pt-BR).
 * Use para exibir event_date na página do evento.
 */
export function formatDateBrasilia(isoString: string | Date | null | undefined): string {
  if (!isoString) return '';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formata apenas o horário em Brasília (HH:mm).
 */
export function formatTimeBrasilia(isoString: string | Date | null | undefined): string {
  if (!isoString) return '';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Formata data em Brasília no formato dd 'de' MMMM 'de' yyyy (para uso com locale pt-BR em componentes).
 */
export function formatDateOnlyBrasilia(isoString: string | Date | null | undefined): string {
  if (!isoString) return '';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formata data em Brasília no formato curto (ex.: "15 de mar. de 2025").
 */
export function formatDateShortBrasilia(isoString: string | Date | null | undefined): string {
  if (!isoString) return '';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formata data e hora em Brasília no formato "dd 'de' MMMM 'de' yyyy 'às' HH:mm".
 */
export function formatDateTimeBrasilia(isoString: string | Date | null | undefined): string {
  if (!isoString) return '';
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) return '';
  const dateStr = date.toLocaleDateString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateStr} às ${timeStr}`;
}

/**
 * Converte um valor datetime-local (YYYY-MM-DDTHH:mm) para ISO string.
 * O horário informado é interpretado como horário de Brasília; a função retorna o instante em UTC.
 * Ex.: 15/03/2025 14:00 (Brasília) → 2025-03-15T17:00:00.000Z
 */
export function datetimeLocalToISO(datetimeLocal: string | null | undefined): string | null {
  if (!datetimeLocal || datetimeLocal.trim() === '') {
    return null;
  }

  if (datetimeLocal.length === 10) {
    datetimeLocal = `${datetimeLocal}T00:00`;
  }

  const [datePart, timePart] = datetimeLocal.split('T');
  if (!datePart) {
    return null;
  }

  // Interpreta como horário de Brasília (UTC-3) e obtém o instante UTC
  const isoWithOffset = `${datePart}T${(timePart || '00:00').slice(0, 5)}:00-03:00`;
  const date = new Date(isoWithOffset);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Converte uma ISO string ou Date para datetime-local (YYYY-MM-DDTHH:mm)
 * exibindo o horário em Brasília (mesmo que o usuário digitou na criação).
 */
export function isoToDatetimeLocal(isoString: string | Date | null | undefined): string {
  if (!isoString) {
    return '';
  }

  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  if (isNaN(date.getTime())) {
    return '';
  }

  const s = date.toLocaleString('sv-SE', { timeZone: TIMEZONE_BRASILIA });
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  }
  const [datePart, timePart] = s.split(' ');
  if (datePart && timePart) {
    return `${datePart}T${timePart.slice(0, 5)}`;
  }
  return '';
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