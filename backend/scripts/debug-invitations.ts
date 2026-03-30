/**
 * Script de debug para verificar convites no banco de dados
 * Executa: npm run debug-invitations
 */

import { query } from '../src/config/database.js';

async function debugInvitations() {
  console.log('🔍 Verificando convites no banco de dados...\n');

  try {
    // 1. Verificar todos os convites
    const allInvitations = await query(
      `SELECT 
        li.id,
        li.leader_id,
        li.event_id,
        li.status,
        li.bonus_registration_id,
        li.created_at,
        gl.user_id as leader_user_id,
        gl.referral_code,
        e.title as event_title
       FROM leader_invitations li
       LEFT JOIN group_leaders gl ON li.leader_id = gl.id
       LEFT JOIN events e ON li.event_id = e.id
       ORDER BY li.created_at DESC`
    );

    console.log(`📊 Total de convites no banco: ${allInvitations.rows.length}\n`);

    if (allInvitations.rows.length > 0) {
      console.log('📋 Lista de convites:');
      allInvitations.rows.forEach((inv, index) => {
        console.log(`\n${index + 1}. Convite ID: ${inv.id}`);
        console.log(`   - Leader ID: ${inv.leader_id}`);
        console.log(`   - Leader User ID: ${inv.leader_user_id}`);
        console.log(`   - Referral Code: ${inv.referral_code}`);
        console.log(`   - Event: ${inv.event_title} (${inv.event_id})`);
        console.log(`   - Status: ${inv.status}`);
        console.log(`   - Criado em: ${inv.created_at}`);
      });
    } else {
      console.log('⚠️ Nenhum convite encontrado no banco de dados');
    }

    // 2. Verificar bônus concedidos
    const bonuses = await query(
      `SELECT 
        lec.id,
        lec.leader_id,
        lec.event_id,
        lec.bonus_type,
        lec.required_purchases,
        lec.bonus_registration_id,
        lec.bonus_earned_at,
        gl.user_id as leader_user_id,
        gl.referral_code,
        e.title as event_title
       FROM leader_event_commissions lec
       LEFT JOIN group_leaders gl ON lec.leader_id = gl.id
       LEFT JOIN events e ON lec.event_id = e.id
       WHERE lec.bonus_type IN ('invitation', 'both')
       AND lec.bonus_earned_at IS NOT NULL
       ORDER BY lec.bonus_earned_at DESC`
    );

    console.log(`\n\n📊 Total de bônus concedidos: ${bonuses.rows.length}\n`);

    if (bonuses.rows.length > 0) {
      console.log('🎁 Lista de bônus concedidos:');
      for (let index = 0; index < bonuses.rows.length; index++) {
        const bonus = bonuses.rows[index];
        console.log(`\n${index + 1}. Bônus ID: ${bonus.id}`);
        console.log(`   - Leader ID: ${bonus.leader_id}`);
        console.log(`   - Leader User ID: ${bonus.leader_user_id}`);
        console.log(`   - Referral Code: ${bonus.referral_code}`);
        console.log(`   - Event: ${bonus.event_title} (${bonus.event_id})`);
        console.log(`   - Tipo: ${bonus.bonus_type}`);
        console.log(`   - Compras necessárias: ${bonus.required_purchases}`);
        console.log(`   - Bonus Registration ID: ${bonus.bonus_registration_id}`);
        console.log(`   - Concedido em: ${bonus.bonus_earned_at}`);
        
        // Verificar se tem convite
        const invitationCheck = await query(
          `SELECT id, status FROM leader_invitations WHERE bonus_registration_id = $1`,
          [bonus.bonus_registration_id]
        );
        
        if (invitationCheck.rows.length > 0) {
          console.log(`   - ✅ Convite criado: ${invitationCheck.rows[0].id} (status: ${invitationCheck.rows[0].status})`);
        } else {
          console.log(`   - ❌ Convite NÃO criado`);
        }
      }
    }

    // 3. Verificar líderes
    const leaders = await query(
      `SELECT 
        gl.id,
        gl.user_id,
        gl.referral_code,
        gl.is_active,
        COUNT(li.id) as total_invitations
       FROM group_leaders gl
       LEFT JOIN leader_invitations li ON gl.id = li.leader_id
       GROUP BY gl.id, gl.user_id, gl.referral_code, gl.is_active
       ORDER BY total_invitations DESC`
    );

    console.log(`\n\n📊 Total de líderes: ${leaders.rows.length}\n`);

    if (leaders.rows.length > 0) {
      console.log('👥 Lista de líderes:');
      leaders.rows.forEach((leader, index) => {
        console.log(`\n${index + 1}. Leader ID: ${leader.id}`);
        console.log(`   - User ID: ${leader.user_id}`);
        console.log(`   - Referral Code: ${leader.referral_code}`);
        console.log(`   - Ativo: ${leader.is_active}`);
        console.log(`   - Total de convites: ${leader.total_invitations}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Erro ao verificar convites:', error);
    process.exit(1);
  }
}

// Executar script
debugInvitations()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

