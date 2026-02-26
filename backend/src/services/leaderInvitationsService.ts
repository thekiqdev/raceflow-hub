import { query } from '../config/database.js';
import { createRunnerByOrganizer, type RunnerDataByOrganizer } from './registrationsService.js';

export interface LeaderInvitation {
  id: string;
  leader_id: string;
  bonus_registration_id: string;
  event_id: string;
  commission_id: string | null;
  runner_id: string | null;
  runner_cpf: string | null;
  status: 'available' | 'sent' | 'used' | 'expired';
  sent_at: Date | null;
  used_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Enriched fields
  event_title?: string;
  event_date?: Date;
  runner_name?: string;
  runner_email?: string;
}

/**
 * Create invitation record when bonus is granted
 */
export const createInvitationFromBonus = async (
  leaderId: string,
  bonusRegistrationId: string,
  eventId: string,
  commissionId?: string
): Promise<LeaderInvitation> => {
  console.log(`📝 [createInvitationFromBonus] Criando convite:`);
  console.log(`   - leader_id: ${leaderId} (tipo: ${typeof leaderId})`);
  console.log(`   - bonus_registration_id: ${bonusRegistrationId}`);
  console.log(`   - event_id: ${eventId}`);
  console.log(`   - commission_id: ${commissionId || 'N/A'}`);
  
  try {
    // Verificar se o convite já existe
    const existingCheck = await query(
      `SELECT id FROM leader_invitations WHERE bonus_registration_id = $1`,
      [bonusRegistrationId]
    );
    
    if (existingCheck.rows.length > 0) {
      console.log(`ℹ️ [createInvitationFromBonus] Convite já existe para este registro: ${existingCheck.rows[0].id}`);
      const existing = await query(
        `SELECT 
          li.*,
          e.title as event_title,
          e.event_date
        FROM leader_invitations li
        JOIN events e ON li.event_id = e.id
        WHERE li.id = $1`,
        [existingCheck.rows[0].id]
      );
      return existing.rows[0] as LeaderInvitation;
    }
    
    const result = await query(
      `INSERT INTO leader_invitations (
        leader_id, bonus_registration_id, event_id, status, commission_id
      ) VALUES ($1, $2, $3, 'available', $4)
      RETURNING *`,
      [leaderId, bonusRegistrationId, eventId, commissionId || null]
    );

    console.log(`✅ [createInvitationFromBonus] Convite criado com sucesso:`, result.rows[0].id);
    console.log(`   - leader_id salvo: ${result.rows[0].leader_id} (tipo: ${typeof result.rows[0].leader_id})`);
    console.log(`   - commission_id salvo: ${result.rows[0].commission_id || 'N/A'}`);
    return result.rows[0] as LeaderInvitation;
  } catch (error: any) {
    console.error(`❌ Erro ao criar convite:`, error.message);
    // Se o convite já existe (constraint unique_bonus_registration), buscar o existente
    if (error.code === '23505' || error.message.includes('unique_bonus_registration')) {
      console.log(`ℹ️ Convite já existe para este registro, buscando...`);
      const existing = await query(
        `SELECT * FROM leader_invitations WHERE bonus_registration_id = $1`,
        [bonusRegistrationId]
      );
      if (existing.rows.length > 0) {
        console.log(`✅ Convite existente encontrado:`, existing.rows[0].id);
        return existing.rows[0] as LeaderInvitation;
      }
    }
    throw error;
  }
};

/**
 * Get available invitations for a leader
 */
export const getAvailableInvitations = async (
  leaderId: string
): Promise<LeaderInvitation[]> => {
  const result = await query(
    `SELECT 
      li.*,
      e.title as event_title,
      e.event_date
    FROM leader_invitations li
    JOIN events e ON li.event_id = e.id
    WHERE li.leader_id = $1 AND li.status = 'available'
    ORDER BY e.event_date ASC, li.created_at ASC`,
    [leaderId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    leader_id: row.leader_id,
    bonus_registration_id: row.bonus_registration_id,
    event_id: row.event_id,
    commission_id: row.commission_id,
    runner_id: row.runner_id,
    runner_cpf: row.runner_cpf,
    status: row.status,
    sent_at: row.sent_at,
    used_at: row.used_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    event_title: row.event_title,
    event_date: row.event_date,
  }));
};

/**
 * Get all invitations for a leader (all statuses)
 */
export const getLeaderInvitations = async (
  leaderId: string
): Promise<LeaderInvitation[]> => {
  console.log(`🔍 [getLeaderInvitations] Buscando convites para leader_id: ${leaderId} (tipo: ${typeof leaderId})`);
  
  // Debug: verificar todos os convites no banco
  const allInvitations = await query(
    `SELECT leader_id, id, status, created_at FROM leader_invitations ORDER BY created_at DESC LIMIT 10`
  );
  console.log(`📊 [getLeaderInvitations] Últimos 10 convites no banco:`, allInvitations.rows);
  
  // Debug: verificar se há convites no banco para este líder específico
  const debugCheck = await query(
    `SELECT COUNT(*) as total
     FROM leader_invitations 
     WHERE leader_id = $1`,
    [leaderId]
  );
  console.log(`📊 [getLeaderInvitations] Total de convites no banco para este líder: ${debugCheck.rows[0]?.total || 0}`);
  
  // Buscar convites do líder
  const result = await query(
    `SELECT 
      li.*,
      e.title as event_title,
      e.event_date,
      p.full_name as runner_name,
      u.email as runner_email
    FROM leader_invitations li
    JOIN events e ON li.event_id = e.id
    LEFT JOIN users u ON li.runner_id = u.id
    LEFT JOIN profiles p ON u.id = p.id
    WHERE li.leader_id = $1
    ORDER BY li.created_at DESC`,
    [leaderId]
  );
  
  console.log(`✅ [getLeaderInvitations] Convites retornados: ${result.rows.length}`);
  if (result.rows.length > 0) {
    console.log(`📋 [getLeaderInvitations] Primeiro convite:`, {
      id: result.rows[0].id,
      leader_id: result.rows[0].leader_id,
      status: result.rows[0].status,
      event_title: result.rows[0].event_title
    });
  }

  const mapped = result.rows.map((row) => ({
    id: row.id,
    leader_id: row.leader_id,
    bonus_registration_id: row.bonus_registration_id,
    event_id: row.event_id,
    commission_id: row.commission_id,
    runner_id: row.runner_id,
    runner_cpf: row.runner_cpf,
    status: row.status,
    sent_at: row.sent_at,
    used_at: row.used_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    event_title: row.event_title,
    event_date: row.event_date,
    runner_name: row.runner_name,
    runner_email: row.runner_email,
  }));
  
  console.log(`📋 Convites mapeados:`, mapped.map(m => ({ id: m.id, status: m.status, event: m.event_title })));
  
  return mapped;
};

/**
 * Send invitation to runner by CPF.
 * If runner does not exist and runnerData is provided, creates the user (pre-registration) then sends the invite.
 */
export const sendInvitationByCpf = async (
  leaderId: string,
  invitationId: string,
  runnerCpf: string,
  runnerData?: RunnerDataByOrganizer
): Promise<LeaderInvitation> => {
  const cleanCpf = runnerCpf.replace(/\D/g, '');

  if (cleanCpf.length !== 11) {
    throw new Error(`CPF inválido. Deve conter 11 dígitos. Recebido: ${cleanCpf.length} dígitos.`);
  }

  // Find runner by CPF
  const runnerResult = await query(
    `SELECT u.id, p.full_name, u.email
     FROM users u
     JOIN profiles p ON u.id = p.id
     WHERE p.cpf = $1`,
    [cleanCpf]
  );

  let runner: { id: string };
  if (runnerResult.rows.length > 0) {
    runner = runnerResult.rows[0];
  } else {
    // Runner not found: require runner_data for pre-registration
    if (!runnerData?.full_name?.trim()) {
      throw new Error(
        'CPF não cadastrado. Preencha os dados abaixo para pré-cadastro e envio do convite.'
      );
    }
    const created = await createRunnerByOrganizer(cleanCpf, {
      full_name: runnerData.full_name.trim(),
      birth_date: runnerData.birth_date || '',
      city: runnerData.city?.trim() || '',
      gender: runnerData.gender?.trim() || '',
      team: runnerData.team?.trim(),
      email: runnerData.email?.trim() || undefined,
      phone: runnerData.phone?.trim() || undefined,
    });
    runner = { id: created.id };
  }

  // Verify invitation belongs to leader and is available
  const invitationResult = await query(
    `SELECT * FROM leader_invitations 
     WHERE id = $1 AND leader_id = $2 AND status = 'available'`,
    [invitationId, leaderId]
  );

  if (invitationResult.rows.length === 0) {
    throw new Error('Convite não encontrado ou já foi utilizado.');
  }

  const invitation = invitationResult.rows[0];

  // Check if runner already has a registration for this event
  const existingRegistration = await query(
    `SELECT id FROM registrations 
     WHERE event_id = $1 AND runner_id = $2`,
    [invitation.event_id, runner.id]
  );

  if (existingRegistration.rows.length > 0) {
    const existingReg = existingRegistration.rows[0];
    throw new Error(`Este runner já possui uma inscrição para este evento (ID: ${existingReg.id}).`);
  }

  // Update invitation to sent status
  // IMPORTANTE: Usar WHERE com verificação de status 'available' para evitar atualizar convites já enviados
  console.log(`🔄 [sendInvitationByCpf] Atualizando convite ${invitationId} para status 'sent'`);
  const updateResult = await query(
    `UPDATE leader_invitations 
     SET runner_id = $1, 
         runner_cpf = $2,
         status = 'sent',
         sent_at = NOW(),
         updated_at = NOW()
     WHERE id = $3 
       AND leader_id = $4
       AND status = 'available'
     RETURNING *`,
    [runner.id, cleanCpf, invitationId, leaderId]
  );
  
  if (updateResult.rows.length === 0) {
    // Verificar se o convite existe mas já foi enviado
    const checkInvitation = await query(
      `SELECT status FROM leader_invitations WHERE id = $1 AND leader_id = $2`,
      [invitationId, leaderId]
    );
    
    if (checkInvitation.rows.length > 0) {
      const currentStatus = checkInvitation.rows[0].status;
      if (currentStatus !== 'available') {
        throw new Error(`Convite já foi ${currentStatus === 'sent' ? 'enviado' : 'utilizado'}.`);
      }
    }
    
    throw new Error('Erro ao atualizar status do convite. Convite não encontrado ou já foi utilizado.');
  }
  
  console.log(`✅ [sendInvitationByCpf] Convite ${invitationId} atualizado para status 'sent':`, {
    id: updateResult.rows[0].id,
    status: updateResult.rows[0].status,
    runner_id: updateResult.rows[0].runner_id,
  });

  // Transfer the bonus registration to the runner and update status
  await query(
    `UPDATE registrations 
     SET runner_id = $1,
         registered_by = $1,
         status = 'confirmed',
         payment_status = 'convidado',
         updated_at = NOW()
     WHERE id = $2`,
    [runner.id, invitation.bonus_registration_id]
  );

  // Get enriched invitation data
  const enrichedResult = await query(
    `SELECT 
      li.*,
      e.title as event_title,
      e.event_date,
      e.location,
      e.city,
      e.state,
      p.full_name as runner_name,
      u.email as runner_email
    FROM leader_invitations li
    JOIN events e ON li.event_id = e.id
    LEFT JOIN users u ON li.runner_id = u.id
    LEFT JOIN profiles p ON u.id = p.id
    WHERE li.id = $1`,
    [invitationId]
  );

  const enrichedInvitation = enrichedResult.rows[0] as LeaderInvitation;

  // Send email notification to runner who received the invitation
  try {
    const { sendNotificationSafely } = await import('./notificationService.js');
    
    if (enrichedInvitation.runner_email && enrichedInvitation.runner_name) {
      // Format event date
      const eventDate = enrichedInvitation.event_date 
        ? new Date(enrichedInvitation.event_date).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : 'Data não informada';

      // Format event location
      const event = await query(
        'SELECT location, city, state FROM events WHERE id = $1',
        [enrichedInvitation.event_id]
      );
      const eventData = event.rows[0];
      const eventLocation = eventData?.location || 
        `${eventData?.city || ''}${eventData?.city && eventData?.state ? ' - ' : ''}${eventData?.state || ''}`.trim() || 
        'Local não informado';

      // Get leader name
      const leaderResult = await query(
        'SELECT name FROM group_leaders WHERE id = $1',
        [enrichedInvitation.leader_id]
      );
      const leaderName = leaderResult.rows[0]?.name || 'Líder de Grupo';

      await sendNotificationSafely({
        templateKey: 'invitation_received',
        recipient: {
          email: enrichedInvitation.runner_email,
          name: enrichedInvitation.runner_name,
        },
        variables: {
          userName: enrichedInvitation.runner_name,
          leaderName: leaderName,
          eventTitle: enrichedInvitation.event_title || 'Evento',
          eventDate: eventDate,
          eventLocation: eventLocation,
        },
      });
      console.log('✅ Notificação de convite enviada para runner');
    }
  } catch (notificationError: any) {
    // Don't fail the invitation if notification fails
    console.error('❌ Erro ao enviar notificação de convite:', notificationError);
  }

  return enrichedInvitation;
};

/**
 * Get invitation by ID
 */
export const getInvitationById = async (
  invitationId: string
): Promise<LeaderInvitation | null> => {
  const result = await query(
    `SELECT 
      li.*,
      e.title as event_title,
      e.event_date,
      p.full_name as runner_name,
      u.email as runner_email
    FROM leader_invitations li
    JOIN events e ON li.event_id = e.id
    LEFT JOIN users u ON li.runner_id = u.id
    LEFT JOIN profiles p ON u.id = p.id
    WHERE li.id = $1`,
    [invitationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as LeaderInvitation;
};

/**
 * Valida token do link de completar cadastro (convite sem cadastro).
 * Stub: retorna inválido até implementação completa.
 */
export const validateCompletionRegistration = async (
  _token: string
): Promise<{ valid: boolean; error?: string; runnerName?: string; eventTitle?: string }> => {
  return { valid: false, error: 'Token inválido ou expirado.' };
};
