/**
 * Script para testar a integração com Asaas
 * 
 * Este script testa:
 * - Criação de cliente
 * - Criação de pagamento PIX
 * - Consulta de status
 * - Validação de dados no banco
 * 
 * Uso: npm run test:asaas
 */

import { createCustomer, createPayment, getPaymentStatus, getCustomerByUserId } from '../src/services/asaasService.js';
import { getProfileByUserId } from '../src/services/profilesService.js';
import { query } from '../src/config/database.js';

// Test user ID (substitua por um ID real do seu banco)
const TEST_USER_ID = process.env.TEST_USER_ID || '';

async function testAsaasIntegration() {
  console.log('🧪 Iniciando testes de integração Asaas...\n');

  if (!TEST_USER_ID) {
    console.error('❌ TEST_USER_ID não configurado. Configure a variável de ambiente ou edite o script.');
    process.exit(1);
  }

  try {
    // 1. Testar criação de cliente
    console.log('1️⃣ Testando criação de cliente...');
    const profile = await getProfileByUserId(TEST_USER_ID);
    
    if (!profile) {
      throw new Error('Perfil do usuário não encontrado');
    }

    const customerData = {
      name: profile.full_name || 'Test User',
      email: profile.email || 'test@example.com',
      cpfCnpj: profile.cpf || '00000000000',
      phone: profile.phone || '11999999999',
    };

    const customer = await createCustomer(TEST_USER_ID, customerData);
    console.log('✅ Cliente criado/encontrado:', customer.asaas_customer_id);

    // Verificar no banco
    const dbCustomer = await getCustomerByUserId(TEST_USER_ID);
    if (dbCustomer) {
      console.log('✅ Cliente salvo no banco de dados');
    } else {
      console.error('❌ Cliente não encontrado no banco de dados');
    }

    // 2. Testar criação de pagamento PIX
    console.log('\n2️⃣ Testando criação de pagamento PIX...');
    
    // Criar uma inscrição de teste primeiro (ou usar uma existente)
    const testRegistrationId = process.env.TEST_REGISTRATION_ID;
    
    if (!testRegistrationId) {
      console.log('⚠️ TEST_REGISTRATION_ID não configurado. Pulando teste de pagamento.');
      console.log('   Para testar, crie uma inscrição manualmente e use o ID.');
    } else {
      // Buscar dados do pagamento
      const paymentResult = await query(
        'SELECT * FROM asaas_payments WHERE registration_id = $1',
        [testRegistrationId]
      );

      if (paymentResult.rows.length > 0) {
        const payment = paymentResult.rows[0];
        console.log('✅ Pagamento encontrado:', payment.asaas_payment_id);
        console.log('   Status:', payment.status);
        console.log('   QR Code disponível:', payment.pix_qr_code ? 'Sim' : 'Não');

        // 3. Testar consulta de status
        if (payment.asaas_payment_id) {
          console.log('\n3️⃣ Testando consulta de status...');
          try {
            const status = await getPaymentStatus(payment.asaas_payment_id);
            console.log('✅ Status consultado:', status);
          } catch (error: any) {
            console.error('❌ Erro ao consultar status:', error.message);
          }
        }
      } else {
        console.log('⚠️ Nenhum pagamento encontrado para esta inscrição.');
      }
    }

    // 4. Verificar dados no banco
    console.log('\n4️⃣ Verificando dados no banco de dados...');
    
    const customersCount = await query('SELECT COUNT(*) FROM asaas_customers');
    console.log(`   Clientes no banco: ${customersCount.rows[0].count}`);

    const paymentsCount = await query('SELECT COUNT(*) FROM asaas_payments');
    console.log(`   Pagamentos no banco: ${paymentsCount.rows[0].count}`);

    const webhooksCount = await query('SELECT COUNT(*) FROM asaas_webhook_events');
    console.log(`   Webhooks recebidos: ${webhooksCount.rows[0].count}`);

    const registrationsWithPayment = await query(
      'SELECT COUNT(*) FROM registrations WHERE asaas_payment_id IS NOT NULL'
    );
    console.log(`   Inscrições com pagamento: ${registrationsWithPayment.rows[0].count}`);

    console.log('\n✅ Testes concluídos!');
  } catch (error: any) {
    console.error('\n❌ Erro durante os testes:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Executar testes
testAsaasIntegration()
  .then(() => {
    console.log('\n✨ Todos os testes passaram!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Falha nos testes:', error);
    process.exit(1);
  });


