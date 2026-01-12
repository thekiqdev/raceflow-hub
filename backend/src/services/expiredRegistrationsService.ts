import { query } from '../config/database.js';
import { cancelRegistration } from './registrationsService.js';

/**
 * Cancela inscrições não pagas que foram criadas há mais de 20 minutos
 * @param expirationMinutes Tempo em minutos para considerar a inscrição expirada (padrão: 20)
 * @returns Número de inscrições canceladas
 */
export async function cancelExpiredRegistrations(expirationMinutes: number = 20): Promise<number> {
  const now = new Date();
  const expirationTime = new Date(now.getTime() - expirationMinutes * 60 * 1000);
  let cancelledCount = 0;

  try {
    // Buscar inscrições pendentes não pagas criadas há mais de 20 minutos
    // Não cancelar inscrições que já foram pagas, confirmadas, canceladas ou são convites
    const expiredRegistrationsResult = await query(
      `SELECT id, created_at, payment_status, status, runner_id, event_id
       FROM registrations
       WHERE payment_status = 'pending'
       AND (status IS NULL OR status = 'pending')
       AND created_at < $1
       AND created_at IS NOT NULL
       ORDER BY created_at ASC`,
      [expirationTime]
    );

    console.log(`🔄 Verificando ${expiredRegistrationsResult.rows.length} inscrições pendentes...`);

    for (const registration of expiredRegistrationsResult.rows) {
      try {
        // Verificar novamente se ainda está pendente (pode ter sido paga enquanto processávamos)
        const currentRegistration = await query(
          `SELECT payment_status, status FROM registrations WHERE id = $1`,
          [registration.id]
        );

        if (currentRegistration.rows.length === 0) {
          continue; // Inscrição já foi excluída
        }

        const currentPaymentStatus = currentRegistration.rows[0].payment_status;
        const currentStatus = currentRegistration.rows[0].status;

        // Pular se já foi paga, confirmada, cancelada ou é convite
        if (
          currentPaymentStatus === 'paid' ||
          currentPaymentStatus === 'convidado' ||
          currentStatus === 'confirmed' ||
          currentStatus === 'cancelled'
        ) {
          continue;
        }

        // Cancelar a inscrição
        await cancelRegistration(registration.id);
        
        console.log(
          `✅ Inscrição ${registration.id} cancelada automaticamente ` +
          `(criada em ${new Date(registration.created_at).toLocaleString('pt-BR')}, ` +
          `corredor: ${registration.runner_id}, evento: ${registration.event_id})`
        );
        
        cancelledCount++;
      } catch (error: any) {
        console.error(`❌ Erro ao cancelar inscrição ${registration.id}:`, error.message);
        // Continuar processando outras inscrições mesmo se uma falhar
      }
    }

    if (cancelledCount > 0) {
      console.log(`✅ Cancelamento automático concluído: ${cancelledCount} inscrição(ões) cancelada(s) de ${expiredRegistrationsResult.rows.length} verificada(s)`);
    } else {
      console.log(`ℹ️ Nenhuma inscrição expirada encontrada`);
    }

    return cancelledCount;
  } catch (error) {
    console.error('❌ Erro ao cancelar inscrições expiradas:', error);
    throw error;
  }
}
