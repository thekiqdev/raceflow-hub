import jwt from 'jsonwebtoken';
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
  runner_preregistered?: boolean;
  /** true = corredor escolhe categoria/modalidade/kit; false = líder definiu. null = convite antigo. */
  runner_chooses_category_modality_kit?: boolean | null;
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

/** Opções opcionais ao enviar convite: líder pode pré-definir categoria, modalidade, kit e variante */
export interface SendInvitationOptions {
  category_id?: string;
  modality_id?: string;
  kit_id?: string;
  product_selections?: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections?: Record<string, string>;
  }>;
  /** true = corredor escolhe categoria/modalidade/kit; false = líder definiu no envio. Não enviado = true (comportamento atual). */
  runner_chooses_category_modality_kit?: boolean;
}

/**
 * Send invitation to runner by CPF.
 * If runner does not exist and runnerData is provided, creates the user (pre-registration) then sends the invite.
 * If options (category_id, modality_id, kit_id, product_selections) are provided, the bonus registration is updated before assigning to the runner.
 */
export const sendInvitationByCpf = async (
  leaderId: string,
  invitationId: string,
  runnerCpf: string,
  runnerData?: RunnerDataByOrganizer,
  options?: SendInvitationOptions
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
  let runnerWasPreregistered = false;
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
    runnerWasPreregistered = true;
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

  // Check if runner already has a registration for this event (permite self-invite: única inscrição pode ser a do bônus)
  const existingRegistration = await query(
    `SELECT id FROM registrations 
     WHERE event_id = $1 AND runner_id = $2`,
    [invitation.event_id, runner.id]
  );

  if (existingRegistration.rows.length > 0) {
    const ids = (existingRegistration.rows as { id: string }[]).map((r) => r.id);
    const isOnlyBonusReg = ids.length === 1 && ids[0] === invitation.bonus_registration_id;
    if (!isOnlyBonusReg) {
      const existingReg = existingRegistration.rows[0] as { id: string };
      throw new Error(`Este runner já possui uma inscrição para este evento (ID: ${existingReg.id}).`);
    }
  }

  // Update invitation to sent status (inclui flag runner_chooses_category_modality_kit – Etapa 2)
  // IMPORTANTE: Usar WHERE com verificação de status 'available' para evitar atualizar convites já enviados
  const runnerChoosesFlag = options?.runner_chooses_category_modality_kit ?? true; // default: corredor escolhe (comportamento atual)
  console.log(`🔄 [sendInvitationByCpf] Atualizando convite ${invitationId} para status 'sent'`);
  const updateResult = await query(
    `UPDATE leader_invitations 
     SET runner_id = $1, 
         runner_cpf = $2,
         status = 'sent',
         sent_at = NOW(),
         updated_at = NOW(),
         runner_chooses_category_modality_kit = $5
     WHERE id = $3 
       AND leader_id = $4
       AND status = 'available'
     RETURNING *`,
    [runner.id, cleanCpf, invitationId, leaderId, runnerChoosesFlag]
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

  const bonusRegId = invitation.bonus_registration_id as string;
  const eventId = invitation.event_id as string;

  // Se "deixar o corredor escolher": limpar categoria/modalidade/kit da inscrição bônus para o corredor ver "Completar convite"
  if (runnerChoosesFlag) {
    await query(
      `UPDATE registrations SET category_id = NULL, modality_id = NULL, kit_id = NULL, updated_at = NOW() WHERE id = $1`,
      [bonusRegId]
    );
    await query(`DELETE FROM registration_product_selections WHERE registration_id = $1`, [bonusRegId]);
  }

  if (runnerWasPreregistered) {
    await query(
      `UPDATE leader_invitations SET runner_preregistered = true, updated_at = NOW() WHERE id = $1`,
      [invitationId]
    );
  }

  const hasLeaderChoices =
    options &&
    (options.category_id != null ||
      options.modality_id != null ||
      options.kit_id != null ||
      (options.product_selections && options.product_selections.length > 0));

  if (hasLeaderChoices) {
    // Validar e atualizar a inscrição bônus com categoria/modalidade/kit/variante definidos pelo líder
    const currentReg = await query(
      `SELECT category_id, modality_id, kit_id FROM registrations WHERE id = $1`,
      [bonusRegId]
    );
    if (currentReg.rows.length === 0) {
      throw new Error('Inscrição bônus do convite não encontrada.');
    }
    const current = currentReg.rows[0] as { category_id: string | null; modality_id: string | null; kit_id: string | null };
    const newCategoryId = options.category_id ?? current.category_id;
    const newModalityId = options.modality_id ?? current.modality_id;
    const newKitId = options.kit_id ?? current.kit_id;

    if (options.category_id) {
      const catCheck = await query(
        `SELECT 1 FROM categories WHERE id = $1 AND event_id = $2`,
        [options.category_id, eventId]
      );
      if (catCheck.rows.length === 0) {
        throw new Error('Categoria inválida ou não pertence a este evento.');
      }
    }
    if (options.modality_id) {
      const modCheck = await query(
        `SELECT 1 FROM modalities m
         WHERE m.id = $1 AND m.event_id = $2
         AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM category_modalities cm WHERE cm.modality_id = m.id AND cm.category_id = $3))`,
        [options.modality_id, eventId, newCategoryId]
      );
      if (modCheck.rows.length === 0) {
        throw new Error('Modalidade inválida, não pertence a este evento ou não está vinculada à categoria selecionada.');
      }
    }
    if (options.kit_id) {
      const kitCheck = await query(
        `SELECT 1 FROM event_kits WHERE id = $1 AND event_id = $2`,
        [options.kit_id, eventId]
      );
      if (kitCheck.rows.length === 0) {
        throw new Error('Kit inválido ou não pertence a este evento.');
      }
      // Etapa 5: kit com produto variável exige seleção de variante
      const kitProductsRows = await query(
        `SELECT id, name, type FROM kit_products WHERE kit_id = $1`,
        [options.kit_id]
      );
      const variableProducts = (kitProductsRows.rows as { id: string; name: string; type: string }[]).filter(
        (p) => p.type === 'variable'
      );
      if (variableProducts.length > 0) {
        const hasProductSelections = options.product_selections && options.product_selections.length > 0;
        if (!hasProductSelections) {
          throw new Error(
            'O kit selecionado possui produto(s) com variação (ex.: tamanho). Selecione a variante para cada um antes de enviar o convite.'
          );
        }
        const selections = options.product_selections!;
        const selectedProductIds = new Set(
          selections.map((s) => s.product_id)
        );
        const missing = variableProducts.filter((p) => !selectedProductIds.has(p.id));
        if (missing.length > 0) {
          const names = missing.map((p) => p.name).join(', ');
          throw new Error(
            `Selecione a variante para: ${names}.`
          );
        }
        for (const sel of selections) {
          const prod = variableProducts.find((p) => p.id === sel.product_id);
          if (prod && !sel.variant_id && (!sel.attribute_selections || Object.keys(sel.attribute_selections).length === 0)) {
            throw new Error(
              `Informe a variante (tamanho) para o produto "${prod.name}".`
            );
          }
        }
      }
    }

    await query(
      `UPDATE registrations 
       SET category_id = COALESCE($1, category_id),
           modality_id = COALESCE($2, modality_id),
           kit_id = COALESCE($3, kit_id),
           updated_at = NOW()
       WHERE id = $4`,
      [newCategoryId, newModalityId, newKitId, bonusRegId]
    );

    const kitIdForProducts = newKitId;
    if (options.product_selections && options.product_selections.length > 0) {
      if (!kitIdForProducts) {
        throw new Error('É necessário informar o kit para definir seleções de produtos/variantes.');
      }
      const { getVariantRemainingStock } = await import('./registrationsService.js');
      const kitProducts = await query(
        `SELECT id FROM kit_products WHERE kit_id = $1`,
        [kitIdForProducts]
      );
      const allowedProductIds = new Set((kitProducts.rows as { id: string }[]).map((r) => r.id));
      for (const sel of options.product_selections) {
        if (!allowedProductIds.has(sel.product_id)) {
          throw new Error('Produto da seleção não pertence ao kit informado.');
        }
        if (sel.variant_id) {
          const remaining = await getVariantRemainingStock(sel.variant_id, eventId, bonusRegId);
          if (remaining !== null && remaining <= 0) {
            throw new Error('Estoque desta variante chegou a zero; não é possível selecioná-la.');
          }
        }
      }
      await query(
        `DELETE FROM registration_product_selections WHERE registration_id = $1`,
        [bonusRegId]
      );
      for (const selection of options.product_selections) {
        if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
          for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
            await query(
              `INSERT INTO registration_product_selections 
               (registration_id, product_id, variant_id, attribute_name, attribute_value)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                bonusRegId,
                selection.product_id,
                selection.variant_id || null,
                attributeName,
                attributeValue,
              ]
            );
          }
        } else if (selection.variant_id) {
          const variantResult = await query(
            `SELECT name, product_id FROM product_variants WHERE id = $1`,
            [selection.variant_id]
          );
          if (variantResult.rows.length > 0) {
            const variant = variantResult.rows[0] as { name: string; product_id: string };
            let inserted = false;
            const productResult = await query(
              `SELECT variant_attributes FROM kit_products WHERE id = $1`,
              [selection.product_id]
            );
            if (productResult.rows.length > 0) {
              const variantAttributes = (productResult.rows[0] as { variant_attributes: string[] | null }).variant_attributes;
              if (variantAttributes && variantAttributes.length > 0) {
                const variantValues = variant.name.split(' - ').map((v: string) => v.trim());
                for (let i = 0; i < variantAttributes.length && i < variantValues.length; i++) {
                  await query(
                    `INSERT INTO registration_product_selections 
                     (registration_id, product_id, variant_id, attribute_name, attribute_value)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                      bonusRegId,
                      selection.product_id,
                      selection.variant_id,
                      variantAttributes[i],
                      variantValues[i],
                    ]
                  );
                  inserted = true;
                }
              }
            }
            // Fallback: sempre persistir variant_id para contagem de estoque (attribute_name/attribute_value NOT NULL)
            if (!inserted) {
              await query(
                `INSERT INTO registration_product_selections 
                 (registration_id, product_id, variant_id, attribute_name, attribute_value)
                 VALUES ($1, $2, $3, 'Variante', $4)`,
                [bonusRegId, selection.product_id, selection.variant_id, variant.name || selection.variant_id]
              );
            }
          }
        }
      }
    }
  }

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
    if (enrichedInvitation.runner_email && enrichedInvitation.runner_name) {
      await sendInvitationEmailToRunner(enrichedInvitation, invitationId);
    } else {
      console.warn(
        '⚠️ [sendInvitationByCpf] Convite enviado mas email não enviado: runner_email ou runner_name ausente',
        {
          invitationId,
          runner_id: enrichedInvitation.runner_id,
          has_email: !!enrichedInvitation.runner_email,
          has_name: !!enrichedInvitation.runner_name,
        }
      );
    }
  } catch (notificationError: any) {
    // Don't fail the invitation if notification fails
    console.error('❌ Erro ao enviar notificação de convite:', notificationError);
  }

  return enrichedInvitation;
};

/**
 * Internal: send invitation email (template by runner_preregistered). Assumes runner_email and runner_name exist.
 */
async function sendInvitationEmailToRunner(
  enrichedInvitation: LeaderInvitation,
  invitationId: string
): Promise<void> {
  const { sendNotificationSafely } = await import('./notificationService.js');
  const eventDate = enrichedInvitation.event_date
    ? new Date(enrichedInvitation.event_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'Data não informada';
  const event = await query(
    'SELECT location, city, state FROM events WHERE id = $1',
    [enrichedInvitation.event_id]
  );
  const eventData = event.rows[0];
  const eventLocation = eventData?.location ||
    `${eventData?.city || ''}${eventData?.city && eventData?.state ? ' - ' : ''}${eventData?.state || ''}`.trim() ||
    'Local não informado';
  const leaderResult = await query(
    `SELECT p.full_name as name FROM group_leaders gl
     LEFT JOIN profiles p ON gl.user_id = p.id
     WHERE gl.id = $1`,
    [enrichedInvitation.leader_id]
  );
  const leaderName = leaderResult.rows[0]?.name || 'Líder de Grupo';
  const baseVariables = {
    userName: enrichedInvitation.runner_name!,
    leaderName: leaderName,
    eventTitle: enrichedInvitation.event_title || 'Evento',
    eventDate,
    eventLocation,
  };
  let templateKey: string;
  let variables: Record<string, string>;
  if (enrichedInvitation.runner_preregistered && enrichedInvitation.runner_id) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('❌ JWT_SECRET não definido; link de completar cadastro não gerado.');
    }
    const token = secret
      ? jwt.sign(
          { invitationId, runnerId: enrichedInvitation.runner_id },
          secret,
          { expiresIn: '7d' }
        )
      : '';
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8080').replace(/\/$/, '');
    const completeRegistrationLink = token
      ? `${frontendUrl}/completar-cadastro?token=${encodeURIComponent(token)}`
      : frontendUrl + '/completar-cadastro';
    templateKey = 'invitation_received_no_account';
    variables = { ...baseVariables, completeRegistrationLink };
  } else {
    templateKey = 'invitation_received';
    variables = baseVariables;
  }
  await sendNotificationSafely({
    templateKey,
    recipient: {
      email: enrichedInvitation.runner_email!,
      name: enrichedInvitation.runner_name!,
    },
    variables,
  });
  console.log('✅ Notificação de convite enviada para runner');
}

/**
 * Resend invitation email. Convite must belong to leader and have status 'sent'.
 */
export const resendInvitationEmail = async (
  leaderId: string,
  invitationId: string
): Promise<void> => {
  const check = await query(
    'SELECT id FROM leader_invitations WHERE id = $1 AND leader_id = $2 AND status = $3',
    [invitationId, leaderId, 'sent']
  );
  if (check.rows.length === 0) {
    throw new Error('Convite não encontrado ou não está disponível para reenvio.');
  }
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
  if (!enrichedInvitation?.runner_email || !enrichedInvitation?.runner_name) {
    throw new Error('Não é possível reenviar: convite sem email ou nome do corredor.');
  }
  await sendInvitationEmailToRunner(enrichedInvitation, invitationId);
};

/**
 * Validate completion-registration JWT and convite/runner.
 * Used by GET /api/invitations/complete-registration/validate and by set-password-invitation.
 * Returns { valid, runnerName?, eventTitle?, error? }.
 */
export const validateCompletionRegistration = async (token: string): Promise<{
  valid: boolean;
  runnerName?: string;
  eventTitle?: string;
  invitationId?: string;
  runnerId?: string;
  error?: string;
}> => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { valid: false, error: 'Configuração do servidor inválida.' };
  }

  let payload: { invitationId?: string; runnerId?: string };
  try {
    const decoded = jwt.verify(token, secret) as { invitationId?: string; runnerId?: string; exp?: number };
    payload = decoded;
  } catch {
    return { valid: false, error: 'Token inválido ou expirado.' };
  }

  const invitationId = payload.invitationId;
  const runnerId = payload.runnerId;
  if (!invitationId || !runnerId) {
    return { valid: false, error: 'Token inválido.' };
  }

  const result = await query(
    `SELECT 
      li.id,
      li.runner_id,
      e.title as event_title,
      p.full_name as runner_name
    FROM leader_invitations li
    JOIN events e ON li.event_id = e.id
    LEFT JOIN profiles p ON p.id = li.runner_id
    WHERE li.id = $1 AND li.runner_id = $2 AND li.status = 'sent'`,
    [invitationId, runnerId]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'Convite não encontrado ou já utilizado.' };
  }

  const row = result.rows[0];
  return {
    valid: true,
    runnerName: row.runner_name || 'Corredor',
    eventTitle: row.event_title || 'Evento',
    invitationId,
    runnerId,
  };
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
 * Get registration data for an invitation (leader viewing runner's ticket/ingresso).
 * Only for invitations that belong to the leader and have status 'sent'.
 * Returns same shape as GET /registrations/:id (registration + product_selections).
 */
export const getInvitationRegistrationForLeader = async (
  leaderId: string,
  invitationId: string
): Promise<any | null> => {
  const invResult = await query(
    `SELECT id, bonus_registration_id FROM leader_invitations
     WHERE id = $1 AND leader_id = $2 AND status = 'sent'`,
    [invitationId, leaderId]
  );
  if (invResult.rows.length === 0) {
    return null;
  }
  const bonusRegistrationId = invResult.rows[0].bonus_registration_id;
  if (!bonusRegistrationId) {
    return null;
  }
  const { getRegistrationById } = await import('./registrationsService.js');
  const registration = await getRegistrationById(bonusRegistrationId);
  if (!registration) {
    return null;
  }
  let productSelections: any[] = [];
  try {
    const { getRegistrationProductSelections } = await import('./registrationProductSelectionsService.js');
    productSelections = await getRegistrationProductSelections(bonusRegistrationId);
  } catch {
    // optional
  }
  return { ...registration, product_selections: productSelections };
};

