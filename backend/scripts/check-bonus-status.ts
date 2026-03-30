/**
 * Script para verificar o status de todos os bônus e convites
 */

import { query } from '../src/config/database.js';

async function checkBonusStatus() {
  console.log('🔍 Verificando status de bônus e convites...\n');

  try {
    // Buscar todos os bônus configurados
    const allBonuses = await query(
      `SELECT 
        lec.id,
        lec.leader_id,
        lec.event_id,
        lec.bonus_type,
        lec.required_purchases,
        lec.bonus_registration_id,
        lec.bonus_earned_at,
        lec.name,
        e.title as event_title
      FROM leader_event_commissions lec
      JOIN events e ON lec.event_id = e.id
      WHERE lec.bonus_type IN ('invitation', 'both')
      ORDER BY lec.bonus_earned_at DESC NULLS LAST, lec.created_at DESC`
    );

    console.log(`📊 Total de bônus configurados: ${allBonuses.rows.length}\n`);

    let withBonus = 0;
    let withoutBonus = 0;
    let withInvitation = 0;
    let withoutInvitation = 0;

    for (const bonus of allBonuses.rows) {
      const hasBonus = bonus.bonus_earned_at !== null && bonus.bonus_registration_id !== null;
      
      if (hasBonus) {
        withBonus++;
        
        // Verificar se tem convite
        const invitationCheck = await query(
          `SELECT id, status FROM leader_invitations WHERE bonus_registration_id = $1`,
          [bonus.bonus_registration_id]
        );
        
        if (invitationCheck.rows.length > 0) {
          withInvitation++;
          console.log(`✅ Bônus ID ${bonus.id} - ${bonus.name || 'Sem nome'}`);
          console.log(`   Evento: ${bonus.event_title}`);
          console.log(`   Concedido em: ${bonus.bonus_earned_at}`);
          console.log(`   Convite ID: ${invitationCheck.rows[0].id} (Status: ${invitationCheck.rows[0].status})`);
        } else {
          withoutInvitation++;
          console.log(`⚠️ Bônus ID ${bonus.id} - ${bonus.name || 'Sem nome'}`);
          console.log(`   Evento: ${bonus.event_title}`);
          console.log(`   Concedido em: ${bonus.bonus_earned_at}`);
          console.log(`   ❌ SEM CONVITE!`);
        }
        console.log('');
      } else {
        withoutBonus++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo:');
    console.log(`   Total de bônus configurados: ${allBonuses.rows.length}`);
    console.log(`   Bônus concedidos: ${withBonus}`);
    console.log(`   Bônus não concedidos: ${withoutBonus}`);
    console.log(`   Bônus com convite: ${withInvitation}`);
    console.log(`   Bônus SEM convite: ${withoutInvitation}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (withoutInvitation > 0) {
      console.log('⚠️ Existem bônus concedidos sem convite!');
      console.log('Execute: npm run fix-missing-invitations\n');
    }

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    process.exit(1);
  }
}

// Executar script
checkBonusStatus()
  .then(() => {
    console.log('✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

