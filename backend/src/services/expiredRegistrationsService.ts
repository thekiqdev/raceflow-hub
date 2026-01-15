import { query } from '../config/database.js';
import { cancelRegistration } from './registrationsService.js';

/**
 * Cancela inscrições não pagas que foram criadas há mais de 20 minutos
 * Verifica o status do pagamento no Asaas antes de cancelar:
 * - Se o pagamento estiver pago, marca a inscrição como paga
 * - Se o pagamento não estiver pago, cancela a fatura no Asaas e depois cancela a inscrição
 * @param expirationMinutes Tempo em minutos para considerar a inscrição expirada (padrão: 20)
 * @returns Número de inscrições canceladas
 */
export async function cancelExpiredRegistrations(expirationMinutes: number = 20): Promise<number> {
  const now = new Date();
  const expirationTime = new Date(now.getTime() - expirationMinutes * 60 * 1000);
  let cancelledCount = 0;
  let markedAsPaidCount = 0;

  try {
    // Buscar inscrições pendentes não pagas criadas há mais de 20 minutos
    // Incluir asaas_payment_id para verificar status no Asaas
    const expiredRegistrationsResult = await query(
      `SELECT id, created_at, payment_status, status, runner_id, event_id, asaas_payment_id
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
          `SELECT payment_status, status, asaas_payment_id FROM registrations WHERE id = $1`,
          [registration.id]
        );

        if (currentRegistration.rows.length === 0) {
          continue; // Inscrição já foi excluída
        }

        const currentPaymentStatus = currentRegistration.rows[0].payment_status;
        const currentStatus = currentRegistration.rows[0].status;
        const asaasPaymentId = currentRegistration.rows[0].asaas_payment_id;

        // Pular se já foi paga, confirmada, cancelada ou é convite
        if (
          currentPaymentStatus === 'paid' ||
          currentPaymentStatus === 'convidado' ||
          currentStatus === 'confirmed' ||
          currentStatus === 'cancelled'
        ) {
          continue;
        }

        // Se há um pagamento no Asaas, verificar o status antes de cancelar
        if (asaasPaymentId) {
          try {
            console.log(`🔍 Verificando status do pagamento no Asaas para inscrição ${registration.id} (pagamento: ${asaasPaymentId})...`);
            
            const { getPaymentStatus, cancelPayment } = await import('./asaasService.js');
            const paymentStatus = await getPaymentStatus(asaasPaymentId);
            
            // Se o pagamento estiver confirmado ou recebido, marcar como pago
            if (paymentStatus.status === 'CONFIRMED' || paymentStatus.status === 'RECEIVED') {
              console.log(`✅ Pagamento confirmado no Asaas! Marcando inscrição ${registration.id} como paga...`);
              
              // Marcar inscrição como paga
              await query(
                `UPDATE registrations 
                 SET payment_status = 'paid', 
                     status = 'confirmed',
                     updated_at = NOW()
                 WHERE id = $1`,
                [registration.id]
              );
              
              // Processar comissões e bônus (similar ao webhook)
              try {
                const registrationData = await query(
                  'SELECT runner_id, event_id, total_amount FROM registrations WHERE id = $1',
                  [registration.id]
                );
                
                if (registrationData.rows.length > 0) {
                  const regData = registrationData.rows[0];
                  
                  // Processar comissões
                  const { processRegistrationCommissions } = await import('./commissionsService.js');
                  await processRegistrationCommissions(registration.id);
                  
                  // Processar bônus de líder
                  const { processRegistrationBonus } = await import('./registrationBonusService.js');
                  await processRegistrationBonus(registration.id);
                  
                  console.log(`✅ Comissões e bônus processados para inscrição ${registration.id}`);
                }
              } catch (bonusError: any) {
                console.error(`⚠️ Erro ao processar comissões/bônus para inscrição ${registration.id}:`, bonusError.message);
                // Não falhar o processo por causa de comissões
              }
              
              markedAsPaidCount++;
              console.log(
                `✅ Inscrição ${registration.id} marcada como paga ` +
                `(criada em ${new Date(registration.created_at).toLocaleString('pt-BR')}, ` +
                `corredor: ${registration.runner_id}, evento: ${registration.event_id})`
              );
              continue; // Não cancelar, já foi marcada como paga
            } else {
              // Pagamento não está pago, cancelar a fatura no Asaas
              console.log(`🗑️ Pagamento não está pago (status: ${paymentStatus.status}). Cancelando fatura no Asaas...`);
              
              try {
                await cancelPayment(asaasPaymentId);
                console.log(`✅ Fatura ${asaasPaymentId} cancelada no Asaas`);
              } catch (cancelError: any) {
                console.error(`⚠️ Erro ao cancelar fatura no Asaas:`, {
                  message: cancelError.message,
                  asaasPaymentId,
                  registrationId: registration.id,
                });
                // Se o erro for porque o pagamento já foi pago, não é um erro crítico
                if (cancelError.message?.includes('já foi pago')) {
                  console.log(`ℹ️ Pagamento já foi pago, não é possível cancelar. Continuando com cancelamento da inscrição.`);
                } else {
                  // Para outros erros, logar mas continuar
                  console.error(`⚠️ Erro ao cancelar fatura, mas continuando com cancelamento da inscrição`);
                }
              }
            }
          } catch (asaasError: any) {
            console.error(`⚠️ Erro ao verificar status do pagamento no Asaas para inscrição ${registration.id}:`, asaasError.message);
            // Se não conseguir verificar, continuar com o cancelamento normal
          }
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
        console.error(`❌ Erro ao processar inscrição ${registration.id}:`, error.message);
        // Continuar processando outras inscrições mesmo se uma falhar
      }
    }

    if (cancelledCount > 0 || markedAsPaidCount > 0) {
      console.log(
        `✅ Processamento automático concluído: ` +
        `${cancelledCount} inscrição(ões) cancelada(s), ` +
        `${markedAsPaidCount} inscrição(ões) marcada(s) como paga(s) ` +
        `de ${expiredRegistrationsResult.rows.length} verificada(s)`
      );
    } else {
      console.log(`ℹ️ Nenhuma inscrição expirada encontrada`);
    }

    return cancelledCount;
  } catch (error) {
    console.error('❌ Erro ao processar inscrições expiradas:', error);
    throw error;
  }
}
