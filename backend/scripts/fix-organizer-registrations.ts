/**
 * Script para corrigir inscrições criadas por organizadores
 * Atualiza inscrições onde o organizador criou a inscrição para seu próprio evento
 * Zera o total_amount e marca como 'free_bonus' e 'convidado' para excluir do cálculo de receita
 */

import { query } from '../src/config/database.js';

async function fixOrganizerRegistrations() {
  console.log('🔍 Verificando inscrições criadas por organizadores...\n');

  try {
    // Buscar inscrições onde o organizador criou para seu próprio evento
    // registered_by = organizer_id do evento
    const registrations = await query(
      `SELECT 
        r.id,
        r.runner_id,
        r.event_id,
        r.registered_by,
        r.total_amount,
        r.status,
        r.payment_status,
        r.payment_method,
        e.title as event_title,
        e.organizer_id,
        p.full_name as organizer_name
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      LEFT JOIN profiles p ON e.organizer_id = p.id
      WHERE r.registered_by = e.organizer_id
        AND r.registered_by != r.runner_id
        AND (r.total_amount > 0 OR r.payment_status = 'paid' OR r.payment_method != 'free_bonus')
        AND r.status != 'cancelled'
      ORDER BY r.created_at DESC`
    );

    if (registrations.rows.length === 0) {
      console.log('✅ Nenhuma inscrição criada por organizador precisa ser corrigida.');
      return;
    }

    console.log(`📊 Encontradas ${registrations.rows.length} inscrições para corrigir:\n`);

    let updated = 0;
    let errors = 0;
    let totalAmountZeroed = 0;

    for (const reg of registrations.rows) {
      try {
        console.log(`  - Corrigindo inscrição ID ${reg.id}`);
        console.log(`    Evento: ${reg.event_title}`);
        console.log(`    Organizador: ${reg.organizer_name || reg.organizer_id}`);
        console.log(`    Valor atual: R$ ${parseFloat(reg.total_amount || 0).toFixed(2)}`);
        console.log(`    Status atual: ${reg.status} / ${reg.payment_status} / ${reg.payment_method}`);
        console.log(`    Novo status: confirmed / convidado / free_bonus`);
        console.log(`    Novo valor: R$ 0,00`);

        await query(
          `UPDATE registrations 
           SET total_amount = 0,
               payment_method = 'free_bonus',
               payment_status = 'convidado',
               status = 'confirmed',
               updated_at = NOW()
           WHERE id = $1`,
          [reg.id]
        );

        if (parseFloat(reg.total_amount || 0) > 0) {
          totalAmountZeroed++;
        }

        console.log(`    ✅ Corrigida com sucesso!\n`);
        updated++;
      } catch (error: any) {
        console.error(`    ❌ Erro ao corrigir: ${error.message}\n`);
        errors++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo:');
    console.log(`   ✅ Inscrições corrigidas: ${updated}`);
    console.log(`   💰 Valores zerados: ${totalAmountZeroed}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📦 Total processado: ${registrations.rows.length}`);
    console.log('\n💡 Nota: As inscrições corrigidas não serão mais incluídas no cálculo de receita/saque');
    console.log('   do organizador, pois o valor já foi recebido diretamente pelo organizador.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    process.exit(1);
  }
}

// Executar script
fixOrganizerRegistrations()
  .then(() => {
    console.log('✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
