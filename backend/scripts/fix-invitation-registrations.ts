/**
 * Script para atualizar inscrições de convite para status correto
 * Atualiza inscrições de bônus (free_bonus) para status 'confirmed' e payment_status 'convidado'
 */

import { query } from '../src/config/database.js';

async function fixInvitationRegistrations() {
  console.log('🔍 Verificando inscrições de convite...\n');

  try {
    // Buscar inscrições de bônus que precisam ser atualizadas
    const registrations = await query(
      `SELECT 
        r.id,
        r.runner_id,
        r.event_id,
        r.status,
        r.payment_status,
        r.payment_method,
        e.title as event_title
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.payment_method = 'free_bonus'
        AND (r.status != 'confirmed' OR r.payment_status != 'convidado')
      ORDER BY r.created_at DESC`
    );

    if (registrations.rows.length === 0) {
      console.log('✅ Nenhuma inscrição de convite precisa ser atualizada.');
      return;
    }

    console.log(`📊 Encontradas ${registrations.rows.length} inscrições para atualizar:\n`);

    let updated = 0;
    let errors = 0;

    for (const reg of registrations.rows) {
      try {
        console.log(`  - Atualizando inscrição ID ${reg.id}`);
        console.log(`    Evento: ${reg.event_title}`);
        console.log(`    Status atual: ${reg.status} / ${reg.payment_status}`);
        console.log(`    Novo status: confirmed / convidado`);

        await query(
          `UPDATE registrations 
           SET status = 'confirmed',
               payment_status = 'convidado',
               updated_at = NOW()
           WHERE id = $1`,
          [reg.id]
        );

        console.log(`    ✅ Atualizada com sucesso!\n`);
        updated++;
      } catch (error: any) {
        console.error(`    ❌ Erro ao atualizar: ${error.message}\n`);
        errors++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo:');
    console.log(`   ✅ Inscrições atualizadas: ${updated}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📦 Total processado: ${registrations.rows.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    process.exit(1);
  }
}

// Executar script
fixInvitationRegistrations()
  .then(() => {
    console.log('✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

