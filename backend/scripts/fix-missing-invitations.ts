/**
 * Script para criar convites faltantes para bônus já concedidos
 * Este script verifica todos os bônus concedidos que não têm convite correspondente
 * e cria os convites automaticamente
 */

import { query } from '../src/config/database.js';
import { createInvitationFromBonus } from '../src/services/leaderInvitationsService.js';

async function fixMissingInvitations() {
  console.log('🔍 Verificando bônus concedidos sem convites...\n');

  try {
    // Buscar todos os bônus concedidos que não têm convite
    const bonusesWithoutInvitations = await query(
      `SELECT 
        lec.id as commission_id,
        lec.leader_id,
        lec.event_id,
        lec.bonus_registration_id,
        lec.bonus_earned_at,
        lec.name,
        e.title as event_title
      FROM leader_event_commissions lec
      JOIN events e ON lec.event_id = e.id
      WHERE lec.bonus_earned_at IS NOT NULL
        AND lec.bonus_registration_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM leader_invitations li
          WHERE li.bonus_registration_id = lec.bonus_registration_id
        )
      ORDER BY lec.bonus_earned_at ASC`
    );

    if (bonusesWithoutInvitations.rows.length === 0) {
      console.log('✅ Nenhum bônus sem convite encontrado. Tudo está correto!');
      return;
    }

    console.log(`📊 Encontrados ${bonusesWithoutInvitations.rows.length} bônus sem convite:\n`);

    let created = 0;
    let errors = 0;

    for (const bonus of bonusesWithoutInvitations.rows) {
      try {
        console.log(`  - Criando convite para bônus ID ${bonus.commission_id}`);
        console.log(`    Líder: ${bonus.leader_id}`);
        console.log(`    Evento: ${bonus.event_title} (${bonus.event_id})`);
        console.log(`    Inscrição bônus: ${bonus.bonus_registration_id}`);
        console.log(`    Concedido em: ${bonus.bonus_earned_at}`);

        await createInvitationFromBonus(
          bonus.leader_id,
          bonus.bonus_registration_id,
          bonus.event_id,
          bonus.commission_id
        );

        console.log(`    ✅ Convite criado com sucesso!\n`);
        created++;
      } catch (error: any) {
        console.error(`    ❌ Erro ao criar convite: ${error.message}\n`);
        errors++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo:');
    console.log(`   ✅ Convites criados: ${created}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📦 Total processado: ${bonusesWithoutInvitations.rows.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    process.exit(1);
  }
}

// Executar script
fixMissingInvitations()
  .then(() => {
    console.log('✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

