/**
 * Script para verificar se há líderes que deveriam ter recebido bônus mas não receberam
 */

import { query } from '../src/config/database.js';
import { getRegistrationsByLeaderCoupons } from '../src/services/leaderRegistrationsService.js';

async function verifyBonusEligibility() {
  console.log('🔍 Verificando elegibilidade de bônus...\n');

  try {
    // Buscar todos os bônus configurados
    const bonuses = await query(
      `SELECT 
        lec.id,
        lec.leader_id,
        lec.event_id,
        lec.bonus_type,
        lec.required_purchases,
        lec.bonus_earned_at,
        lec.name,
        e.title as event_title,
        gl.referral_code
      FROM leader_event_commissions lec
      JOIN events e ON lec.event_id = e.id
      JOIN group_leaders gl ON lec.leader_id = gl.id
      WHERE lec.bonus_type IN ('invitation', 'both')
        AND lec.bonus_earned_at IS NULL
      ORDER BY lec.created_at DESC`
    );

    console.log(`📊 Bônus configurados (não concedidos): ${bonuses.rows.length}\n`);

    for (const bonus of bonuses.rows) {
      console.log(`\n📋 Bônus: ${bonus.name || 'Sem nome'}`);
      console.log(`   ID: ${bonus.id}`);
      console.log(`   Líder: ${bonus.referral_code} (${bonus.leader_id})`);
      console.log(`   Evento: ${bonus.event_title} (${bonus.event_id})`);
      console.log(`   Meta: ${bonus.required_purchases} compras pagas`);
      console.log(`   Tipo: ${bonus.bonus_type}`);

      // Contar compras pagas
      const registrations = await getRegistrationsByLeaderCoupons(bonus.leader_id, {
        event_id: bonus.event_id,
        payment_status: 'paid',
      });

      const paidCount = registrations.length;
      console.log(`   ✅ Compras pagas: ${paidCount}/${bonus.required_purchases}`);

      if (paidCount >= bonus.required_purchases) {
        console.log(`   ⚠️ LÍDER DEVERIA TER RECEBIDO O BÔNUS!`);
        console.log(`   Compras encontradas:`);
        registrations.forEach((reg, index) => {
          console.log(`     ${index + 1}. ID: ${reg.id}, Valor: R$ ${reg.total_amount.toFixed(2)}, Data: ${reg.created_at}`);
        });
      } else {
        console.log(`   ℹ️ Ainda faltam ${bonus.required_purchases - paidCount} compras`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    process.exit(1);
  }
}

// Executar script
verifyBonusEligibility()
  .then(() => {
    console.log('✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

