/**
 * Utilitários para gerenciar status de inscrições de eventos
 */

import { Event, EventRegistrationStatus } from '@/lib/api/events';

/**
 * Obtém o status efetivo de inscrições do evento
 * - Se modo automático está ativado, calcula baseado nas datas
 * - Se modo automático está desativado, usa o status manual
 * - Se ambos são NULL, retorna NULL (usa lógica antiga)
 */
export function getEffectiveRegistrationStatus(event: Event): EventRegistrationStatus | null {
  // Se modo automático está ativado, calcular baseado nas datas
  if (event.registration_auto_mode && event.registration_start_date && event.registration_end_date) {
    const now = new Date();
    const startDate = new Date(event.registration_start_date);
    const endDate = new Date(event.registration_end_date);
    
    if (now < startDate) {
      return 'not_open';
    } else if (now >= startDate && now <= endDate) {
      return 'open';
    } else {
      return 'closed';
    }
  }
  
  // Caso contrário, usar status manual
  return event.registration_status || null;
}

/**
 * Verifica se as inscrições estão abertas para um evento
 */
export function isRegistrationOpen(event: Event): boolean {
  const status = getEffectiveRegistrationStatus(event);
  return status === 'open';
}

/**
 * Verifica se as inscrições estão em breve
 */
export function isRegistrationNotOpen(event: Event): boolean {
  const status = getEffectiveRegistrationStatus(event);
  return status === 'not_open';
}

/**
 * Verifica se as inscrições estão encerradas
 */
export function isRegistrationClosed(event: Event): boolean {
  const status = getEffectiveRegistrationStatus(event);
  return status === 'closed';
}

/**
 * Obtém mensagem de status de inscrições para exibição
 */
export function getRegistrationStatusMessage(event: Event): string {
  const status = getEffectiveRegistrationStatus(event);
  
  if (status === 'not_open') {
    if (event.registration_auto_mode && event.registration_start_date) {
      const startDate = new Date(event.registration_start_date);
      return `Inscrições abrem em ${startDate.toLocaleString('pt-BR')}`;
    }
    return 'Inscrições em breve. Aguarde o anúncio oficial.';
  }
  
  if (status === 'closed') {
    if (event.registration_auto_mode && event.registration_end_date) {
      const endDate = new Date(event.registration_end_date);
      return `Inscrições encerradas em ${endDate.toLocaleString('pt-BR')}`;
    }
    return 'As inscrições para este evento foram encerradas.';
  }
  
  if (status === 'open') {
    if (event.registration_auto_mode && event.registration_end_date) {
      const endDate = new Date(event.registration_end_date);
      return `Inscrições abertas até ${endDate.toLocaleString('pt-BR')}`;
    }
    return 'Inscrições abertas';
  }
  
  // Status NULL - usar lógica antiga baseada em event.status
  if (event.status === 'published' || event.status === 'ongoing') {
    return 'Inscrições abertas';
  }
  
  return 'Inscrições não disponíveis';
}

/**
 * Obtém badge/label do status de inscrições
 */
export function getRegistrationStatusLabel(event: Event): string {
  const status = getEffectiveRegistrationStatus(event);
  
  switch (status) {
    case 'not_open':
      return 'Inscrições em Breve';
    case 'open':
      return 'Inscrições Abertas';
    case 'closed':
      return 'Inscrições Encerradas';
    default:
      // Status NULL - usar lógica antiga
      if (event.status === 'published' || event.status === 'ongoing') {
        return 'Inscrições Abertas';
      }
      return 'Inscrições Indisponíveis';
  }
}

/**
 * Obtém variante de cor para badge do status
 */
export function getRegistrationStatusVariant(event: Event): 'default' | 'secondary' | 'destructive' | 'outline' {
  const status = getEffectiveRegistrationStatus(event);
  
  switch (status) {
    case 'not_open':
      return 'secondary'; // Amarelo/laranja
    case 'open':
      return 'default'; // Verde
    case 'closed':
      return 'outline'; // Cinza
    default:
      // Status NULL - usar lógica antiga
      if (event.status === 'published' || event.status === 'ongoing') {
        return 'default';
      }
      return 'outline';
  }
}
