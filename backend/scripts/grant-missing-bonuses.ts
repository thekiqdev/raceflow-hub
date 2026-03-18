/**
 * Script para conceder bônus faltantes para líderes que já atingiram a meta
 */

import { query } from '../src/config/database.js';
import { checkAndGrantInvitationBonus } from '../src/services/leaderBonusService.js';
import { getRegistrationsByLeaderCoupons } from '../src/services/leaderRegistrationsService.js';

async function grantMissingBonuses() {
  console.log('🔍 Verificando e concedendo bônus faltantes...\n');

  try {
    // Buscar todos os bônus configurados que ainda não foram concedidos
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

    let granted = 0;
    let errors = 0;

    for (const bonus of bonuses.rows) {
      console.log(`\n📋 Verificando bônus: ${bonus.name || 'Sem nome'}`);
      console.log(`   Líder: ${bonus.referral_code} (${bonus.leader_id})`);
      console.log(`   Evento: ${bonus.event_title}`);
      console.log(`   Meta: ${bonus.required_purchases} compras pagas`);

      // Contar compras pagas
      const registrations = await getRegistrationsByLeaderCoupons(bonus.leader_id, {
        event_id: bonus.event_id,
        payment_status: 'paid',
      });

      const paidCount = registrations.length;
      console.log(`   ✅ Compras pagas: ${paidCount}/${bonus.required_purchases}`);

      if (paidCount >= bonus.required_purchases) {
        console.log(`   🎯 Líder atingiu a meta! Concedendo bônus...`);
        
        try {
          const result = await checkAndGrantInvitationBonus(bonus.leader_id, bonus.event_id);
          
          if (result.granted) {
            console.log(`   ✅ Bônus concedido com sucesso!`);
            console.log(`   📝 ID da inscrição bônus: ${result.registrationId}`);
            granted++;
          } else {
            console.log(`   ℹ️ Bônus não foi concedido (pode já ter sido concedido ou não há configuração válida)`);
          }
        } catch (error: any) {
          console.error(`   ❌ Erro ao conceder bônus: ${error.message}`);
          errors++;
        }
      } else {
        console.log(`   ℹ️ Ainda faltam ${bonus.required_purchases - paidCount} compras`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo:');
    console.log(`   ✅ Bônus concedidos: ${granted}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📦 Total processado: ${bonuses.rows.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('❌ Erro ao executar script:', error.message);
    process.exit(1);
  }
}

// Executar script
grantMissingBonuses()
  .then(() => {
    console.log('✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

