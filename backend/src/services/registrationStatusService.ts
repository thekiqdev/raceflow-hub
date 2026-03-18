import { query } from '../config/database.js';
import { EventRegistrationStatus } from '../types/index.js';

/**
 * Atualiza o status de inscrições de um evento específico baseado nas datas
 * @param eventId ID do evento
 * @returns Status atualizado ou null se não foi possível calcular
 */
export async function updateEventRegistrationStatus(eventId: string): Promise<EventRegistrationStatus | null> {
  try {
    // Buscar evento com modo automático ativado
    const eventResult = await query(
      `SELECT id, registration_start_date, registration_end_date, registration_status, registration_auto_mode, status
       FROM events
       WHERE id = $1 AND registration_auto_mode = true`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      console.log(`⚠️ Evento ${eventId} não encontrado ou modo automático não está ativado`);
      return null;
    }

    const event = eventResult.rows[0];

    // Verificar se evento está publicado
    if (event.status !== 'published' && event.status !== 'ongoing') {
      console.log(`⚠️ Evento ${eventId} não está publicado, pulando atualização`);
      return null;
    }

    // Calcular novo status baseado nas datas
    if (!event.registration_start_date || !event.registration_end_date) {
      console.log(`⚠️ Evento ${eventId} não tem datas de inscrição definidas`);
      return null;
    }

    const now = new Date();
    const startDate = new Date(event.registration_start_date);
    const endDate = new Date(event.registration_end_date);

    let newStatus: EventRegistrationStatus;

    if (now < startDate) {
      newStatus = 'not_open';
    } else if (now >= startDate && now <= endDate) {
      newStatus = 'open';
    } else {
      newStatus = 'closed';
    }

    // Atualizar apenas se status mudou
    if (event.registration_status !== newStatus) {
      await query(
        `UPDATE events 
         SET registration_status = $1, updated_at = NOW() 
         WHERE id = $2`,
        [newStatus, eventId]
      );
      console.log(`✅ Evento ${eventId}: status atualizado de ${event.registration_status || 'NULL'} para ${newStatus}`);
      return newStatus;
    } else {
      console.log(`ℹ️ Evento ${eventId}: status já está correto (${newStatus})`);
      return newStatus;
    }
  } catch (error) {
    console.error(`❌ Erro ao atualizar status do evento ${eventId}:`, error);
    throw error;
  }
}

/**
 * Atualiza o status de inscrições de todos os eventos com modo automático ativado
 * @returns Número de eventos atualizados
 */
export async function updateRegistrationStatuses(): Promise<number> {
  const now = new Date();
  let updatedCount = 0;

  try {
    // Buscar todos os eventos com modo automático ativado e status publicado
    const eventsResult = await query(
      `SELECT id, registration_start_date, registration_end_date, registration_status
       FROM events
       WHERE registration_auto_mode = true
       AND (status = 'published' OR status = 'ongoing')
       AND registration_start_date IS NOT NULL
       AND registration_end_date IS NOT NULL`
    );

    console.log(`🔄 Verificando ${eventsResult.rows.length} eventos com modo automático ativado...`);

    for (const event of eventsResult.rows) {
      try {
        const startDate = new Date(event.registration_start_date);
        const endDate = new Date(event.registration_end_date);

        let newStatus: EventRegistrationStatus;

        if (now < startDate) {
          newStatus = 'not_open';
        } else if (now >= startDate && now <= endDate) {
          newStatus = 'open';
        } else {
          newStatus = 'closed';
        }

        // Atualizar apenas se status mudou
        if (event.registration_status !== newStatus) {
          await query(
            `UPDATE events 
             SET registration_status = $1, updated_at = NOW() 
             WHERE id = $2`,
            [newStatus, event.id]
          );
          console.log(`✅ Evento ${event.id}: status atualizado de ${event.registration_status || 'NULL'} para ${newStatus}`);
          updatedCount++;
        }
      } catch (error) {
        console.error(`❌ Erro ao processar evento ${event.id}:`, error);
        // Continuar processando outros eventos mesmo se um falhar
      }
    }

    console.log(`✅ Atualização concluída: ${updatedCount} evento(s) atualizado(s) de ${eventsResult.rows.length} verificado(s)`);
    return updatedCount;
  } catch (error) {
    console.error('❌ Erro ao atualizar status de inscrições:', error);
    throw error;
  }
}
