/**
 * Script para processar compras anteriores e gerar convites retroativamente
 * Executa: npm run process-past-invitations
 */

import { query } from '../src/config/database.js';
import { checkAllInvitationBonuses } from '../src/services/leaderBonusService.js';
import { createInvitationFromBonus } from '../src/services/leaderInvitationsService.js';

async function processPastInvitations() {
  console.log('🚀 Iniciando processamento de compras anteriores para gerar convites...\n');

  try {
    // 1. Primeiro, verificar bônus já concedidos mas sem convite criado
    console.log('📋 Passo 1: Verificando bônus já concedidos sem convite...\n');
    const bonusesWithoutInvitation = await query(
      `SELECT 
        lec.id as commission_id,
        lec.leader_id,
        lec.event_id,
        lec.bonus_registration_id,
        lec.bonus_earned_at
       FROM leader_event_commissions lec
       LEFT JOIN leader_invitations li ON lec.bonus_registration_id = li.bonus_registration_id
       WHERE lec.bonus_type IN ('invitation', 'both')
       AND lec.bonus_earned_at IS NOT NULL
       AND lec.bonus_registration_id IS NOT NULL
       AND li.id IS NULL`
    );

    console.log(`📊 Encontrados ${bonusesWithoutInvitation.rows.length} bônus sem convite criado\n`);

    let invitationsCreated = 0;
    for (const bonus of bonusesWithoutInvitation.rows) {
      try {
        console.log(`🔄 Criando convite para bônus ${bonus.commission_id} (líder ${bonus.leader_id}, evento ${bonus.event_id})...`);
        await createInvitationFromBonus(
          bonus.leader_id,
          bonus.bonus_registration_id,
          bonus.event_id,
          bonus.commission_id
        );
        invitationsCreated++;
        console.log(`  ✅ Convite criado`);
      } catch (error: any) {
        console.error(`  ❌ Erro ao criar convite:`, error.message);
      }
    }

    console.log(`\n✅ ${invitationsCreated} convites criados para bônus já concedidos\n`);

    // 2. Processar todas as comissões configuradas para verificar se devem receber bônus
    console.log('📋 Passo 2: Verificando comissões configuradas que podem receber bônus...\n');
    const commissions = await query(
      `SELECT DISTINCT
        lec.leader_id,
        lec.event_id
       FROM leader_event_commissions lec
       WHERE lec.bonus_type IN ('invitation', 'both')
       AND lec.bonus_earned_at IS NULL
       ORDER BY lec.leader_id, lec.event_id`
    );

    console.log(`📊 Encontradas ${commissions.rows.length} comissões configuradas para verificação\n`);

    const processed: Set<string> = new Set();
    let totalProcessed = 0;
    let totalBonusesGranted = 0;

    for (const commission of commissions.rows) {
      const key = `${commission.leader_id}-${commission.event_id}`;
      
      if (processed.has(key)) {
        continue;
      }

      try {
        console.log(`🔄 Verificando líder ${commission.leader_id} no evento ${commission.event_id}...`);
        const result = await checkAllInvitationBonuses(commission.leader_id, commission.event_id);
        processed.add(key);
        totalProcessed++;
        
        // Verificar se um bônus foi concedido
        const bonusCheck = await query(
          `SELECT id as commission_id, bonus_earned_at, bonus_registration_id FROM leader_event_commissions 
           WHERE leader_id = $1 AND event_id = $2 
           AND bonus_type IN ('invitation', 'both')
           AND bonus_earned_at IS NOT NULL
           AND bonus_registration_id IS NOT NULL`,
          [commission.leader_id, commission.event_id]
        );
        
        if (bonusCheck.rows.length > 0) {
          totalBonusesGranted++;
          console.log(`  ✅ Bônus concedido para líder ${commission.leader_id}`);
          
          // Verificar se o convite foi criado
          for (const bonus of bonusCheck.rows) {
            const invitationCheck = await query(
              `SELECT id FROM leader_invitations WHERE bonus_registration_id = $1`,
              [bonus.bonus_registration_id]
            );
            
            if (invitationCheck.rows.length === 0) {
              console.log(`  ⚠️ Bônus concedido mas convite não criado, criando agora...`);
              try {
                await createInvitationFromBonus(
                  commission.leader_id,
                  bonus.bonus_registration_id,
                  commission.event_id,
                  bonus.commission_id
                );
                invitationsCreated++;
                console.log(`  ✅ Convite criado`);
              } catch (error: any) {
                console.error(`  ❌ Erro ao criar convite:`, error.message);
              }
            }
          }
        } else {
          // Contar compras pagas para debug
          const paidCount = await query(
            `SELECT COUNT(DISTINCT r.id) as count
             FROM registrations r
             WHERE r.payment_status = 'paid'
             AND r.event_id = $1
             AND (
               (r.coupon_code IS NOT NULL AND EXISTS (
                 SELECT 1 FROM coupons cp 
                 WHERE cp.code = r.coupon_code AND cp.leader_id = $2
               ))
               OR
               EXISTS (
                 SELECT 1 FROM user_referrals ur 
                 WHERE ur.user_id = r.runner_id AND ur.leader_id = $2
               )
             )`,
            [commission.event_id, commission.leader_id]
          );
          
          const requiredPurchases = await query(
            `SELECT required_purchases FROM leader_event_commissions
             WHERE leader_id = $1 AND event_id = $2
             AND bonus_type IN ('invitation', 'both')
             AND bonus_earned_at IS NULL
             LIMIT 1`,
            [commission.leader_id, commission.event_id]
          );
          
          const count = parseInt(paidCount.rows[0]?.count || '0');
          const required = requiredPurchases.rows[0]?.required_purchases || 0;
          
          console.log(`  ℹ️ Compras pagas: ${count}/${required}`);
        }
      } catch (error: any) {
        console.error(`  ❌ Erro ao processar líder ${commission.leader_id}:`, error.message);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Resumo do processamento:');
    console.log(`   ✅ Líderes/Eventos processados: ${totalProcessed}`);
    console.log(`   🎁 Bônus concedidos: ${totalBonusesGranted}`);
    console.log(`   📨 Convites criados: ${invitationsCreated}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error: any) {
    console.error('❌ Erro ao processar compras anteriores:', error);
    process.exit(1);
  }
}

// Executar script
processPastInvitations()
  .then(() => {
    console.log('✅ Processamento concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

