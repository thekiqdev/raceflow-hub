import { query } from '../config/database.js';
import { RegistrationStatus, PaymentStatus, PaymentMethod } from '../types/index.js';

// Credit Card Data Types
export interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string; // MM (01-12)
  expiryYear: string; // YYYY
  ccv: string; // 3 or 4 digits
}

export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
  phone: string;
  mobilePhone?: string;
}

export interface ProductSelection {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>; // { attributeName: attributeValue }
}

export interface CreateRegistrationData {
  event_id: string;
  runner_id: string;
  registered_by: string;
  category_id: string;
  kit_id?: string;
  payment_method?: PaymentMethod;
  total_amount: number;
  coupon_code?: string;
  status?: RegistrationStatus; // Optional status (used when organizer creates registration)
  payment_status?: PaymentStatus; // Optional payment_status (used when organizer creates registration)
  // Product and variant selections
  product_selections?: ProductSelection[];
  // Credit card data (only when payment_method is 'credit_card')
  credit_card?: CreditCardData;
  credit_card_holder_info?: CreditCardHolderInfo;
}

export interface UpdateRegistrationData {
  status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  payment_method?: PaymentMethod;
}

// Get registrations with filters
export const getRegistrations = async (filters?: {
  event_id?: string;
  runner_id?: string;
  registered_by?: string;
  organizer_id?: string;
  status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  search?: string;
}) => {
  let queryText = `
    SELECT DISTINCT ON (r.id)
      r.*,
      e.title as event_title,
      e.event_date,
      e.organizer_id as event_organizer_id,
      c.name as category_name,
      c.category_type as category_type,
      c.gender as category_gender,
      c.min_age as category_min_age,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      p.gender as runner_gender,
      p.birth_date as runner_birth_date,
      p.city as runner_city,
      p.state as runner_state,
      p.team as runner_team,
      u.email as runner_email,
      ek.name as kit_name,
      -- Modalidades associadas à categoria (usando subquery)
      (
        SELECT COALESCE(
          ARRAY_AGG(DISTINCT m2.distance) FILTER (WHERE m2.distance IS NOT NULL),
          ARRAY[]::TEXT[]
        )
        FROM category_modalities cm2
        LEFT JOIN modalities m2 ON cm2.modality_id = m2.id
        WHERE cm2.category_id = c.id
      ) as modality_distances,
      (
        SELECT COALESCE(
          ARRAY_AGG(DISTINCT m2.name) FILTER (WHERE m2.name IS NOT NULL),
          ARRAY[]::TEXT[]
        )
        FROM category_modalities cm2
        LEFT JOIN modalities m2 ON cm2.modality_id = m2.id
        WHERE cm2.category_id = c.id
      ) as modality_names,
      -- Se a inscrição foi transferida:
      -- - Se o runner_id atual é diferente do registered_by, mostrar como 'confirmed' para o novo titular
      -- - Se o registered_by está visualizando (será calculado no map), mostrar como 'transferred'
      -- - Caso contrário, manter o status original
      CASE 
        WHEN r.status = 'transferred' AND r.runner_id != r.registered_by THEN 'confirmed'
        ELSE r.status
      END as display_status,
      -- Flag para identificar se esta é uma inscrição transferida visualizada pelo antigo titular
      (r.status = 'transferred' AND r.runner_id != r.registered_by) as is_transferred,
      -- Informações do cupom (se houver)
      cp.code as coupon_code,
      cp.leader_id as coupon_leader_id,
      -- Informações do líder (se o cupom pertence a um líder)
      gl.id as leader_id,
      lp.full_name as leader_name
    FROM registrations r
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN event_kits ek ON r.kit_id = ek.id
    LEFT JOIN coupons cp ON r.coupon_code = cp.code
    LEFT JOIN group_leaders gl ON cp.leader_id = gl.id
    LEFT JOIN profiles lp ON gl.user_id = lp.id
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.event_id) {
    conditions.push(`r.event_id = $${params.length + 1}`);
    params.push(filters.event_id);
  }

  if (filters?.runner_id) {
    // Include registrations where:
    // 1. runner_id matches (current owner)
    // 2. OR registered_by matches AND status is 'transferred' (transferred by this user)
    conditions.push(`(
      r.runner_id = $${params.length + 1} OR 
      (r.registered_by = $${params.length + 1} AND r.status = 'transferred')
    )`);
    params.push(filters.runner_id);
  }

  if (filters?.registered_by) {
    conditions.push(`r.registered_by = $${params.length + 1}`);
    params.push(filters.registered_by);
  }

  if (filters?.organizer_id) {
    conditions.push(`e.organizer_id = $${params.length + 1}`);
    params.push(filters.organizer_id);
  }

  if (filters?.status) {
    // When filtering by status, also check display_status for transferred registrations
    if (filters.status === 'confirmed') {
      conditions.push(`(
        r.status = $${params.length + 1} OR 
        (r.status = 'transferred' AND r.runner_id != r.registered_by)
      )`);
      params.push(filters.status);
    } else {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(filters.status);
    }
  }

  if (filters?.payment_status) {
    conditions.push(`r.payment_status = $${params.length + 1}`);
    params.push(filters.payment_status);
  }

  if (filters?.search) {
    conditions.push(`(
      p.full_name ILIKE $${params.length + 1} OR
      p.cpf ILIKE $${params.length + 1} OR
      e.title ILIKE $${params.length + 1}
    )`);
    params.push(`%${filters.search}%`);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  // DISTINCT ON requires the first ORDER BY column to match DISTINCT ON column
  // So we order by r.id first, then created_at DESC
  queryText += ' ORDER BY r.id, r.created_at DESC';
  
  // Wrap query to apply final ordering by created_at DESC (most recent first)
  queryText = `
    SELECT * FROM (
      ${queryText}
    ) AS distinct_registrations
    ORDER BY created_at DESC
  `;

  const result = await query(queryText, params);
  
  // Replace status with display_status in the results
  // If this is a transferred registration viewed by the original owner (registered_by),
  // show as 'transferred' instead of 'confirmed'
  return result.rows.map(row => {
    let finalStatus = row.display_status || row.status;
    
    // If filtering by runner_id and this is a transferred registration
    // where the runner_id filter matches registered_by, show as 'transferred'
    if (filters?.runner_id && row.is_transferred && row.registered_by === filters.runner_id) {
      finalStatus = 'transferred';
    }
    
    return {
      ...row,
      status: finalStatus,
    };
  });
};

// Get registration by ID
export const getRegistrationById = async (registrationId: string, viewerId?: string) => {
  const result = await query(
    `SELECT 
      r.*,
      e.title as event_title,
      e.event_date,
      e.location,
      e.city,
      e.state,
      c.name as category_name,
      c.category_type as category_type,
      c.gender as category_gender,
      c.min_age as category_min_age,
      -- Modalidades associadas à categoria
      COALESCE(
        ARRAY_AGG(DISTINCT m.id) FILTER (WHERE m.id IS NOT NULL),
        ARRAY[]::UUID[]
      ) as modality_ids,
      COALESCE(
        ARRAY_AGG(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL),
        ARRAY[]::TEXT[]
      ) as modality_names,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      p.phone as runner_phone,
      p.birth_date as runner_birth_date,
      u.email as runner_email,
      ek.name as kit_name,
      -- Informações do cupom (se houver)
      cp.code as coupon_code,
      cp.name as coupon_name,
      cp.type as coupon_type,
      cp.discount_value as coupon_discount_value,
      cp.leader_id as coupon_leader_id,
      -- Informações do líder (se o cupom pertence a um líder)
      gl.id as leader_id,
      gl.referral_code as leader_referral_code,
      lp.full_name as leader_name,
      -- Se a inscrição foi transferida:
      -- - Se o viewer é o novo titular (runner_id), mostrar como 'confirmed'
      -- - Se o viewer é o antigo titular (registered_by), mostrar como 'transferred'
      -- - Caso contrário, manter o status original
      CASE 
        WHEN r.status = 'transferred' AND r.runner_id != r.registered_by THEN
          CASE 
            WHEN $2::uuid IS NOT NULL AND r.runner_id = $2::uuid THEN 'confirmed'
            WHEN $2::uuid IS NOT NULL AND r.registered_by = $2::uuid THEN 'transferred'
            ELSE r.status
          END
        ELSE r.status
      END as display_status
    FROM registrations r
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN category_modalities cm ON c.id = cm.category_id
    LEFT JOIN modalities m ON cm.modality_id = m.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN event_kits ek ON r.kit_id = ek.id
    LEFT JOIN coupons cp ON r.coupon_code = cp.code
    LEFT JOIN group_leaders gl ON cp.leader_id = gl.id
    LEFT JOIN profiles lp ON gl.user_id = lp.id
    WHERE r.id = $1
    GROUP BY r.id, e.id, c.id, p.id, u.id, ek.id, cp.id, gl.id, lp.id`,
    [registrationId, viewerId || null]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    status: row.display_status || row.status,
  };
};

// Create registration
export const createRegistration = async (data: CreateRegistrationData) => {
  // Validate category and runner eligibility
  const { getCategoryById } = await import('./categoriesService.js');
  const category = await getCategoryById(data.category_id);
  
  if (!category) {
    throw new Error('Categoria não encontrada');
  }

  // Get runner profile to validate eligibility
  const runnerProfile = await query(
    `SELECT id, birth_date, gender FROM profiles WHERE id = $1`,
    [data.runner_id]
  );

  if (runnerProfile.rows.length === 0) {
    throw new Error('Perfil do corredor não encontrado');
  }

  const runner = runnerProfile.rows[0];

  // Validate age (if category has min_age or max_age requirement)
  const birthDate = new Date(runner.birth_date);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  
  const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
  
  // Validate min_age
  if (category.min_age !== null && category.min_age > 0) {
    if (actualAge < category.min_age) {
      throw new Error(`Idade mínima para esta categoria é ${category.min_age} anos. Você tem ${actualAge} anos.`);
    }
  }
  
  // Validate max_age
  if (category.max_age !== null && category.max_age > 0) {
    if (actualAge > category.max_age) {
      throw new Error(`Idade máxima para esta categoria é ${category.max_age} anos. Você tem ${actualAge} anos.`);
    }
  }

  // Validate gender (if category has gender restriction)
  if (category.gender !== 'ambos') {
    const runnerGender = runner.gender?.toLowerCase();
    const categoryGender = category.gender.toLowerCase();
    
    // Map common gender values
    const genderMap: { [key: string]: string } = {
      'm': 'masculino',
      'masculino': 'masculino',
      'f': 'feminino',
      'feminino': 'feminino',
      'o': 'ambos',
      'outro': 'ambos',
    };
    
    const normalizedRunnerGender = genderMap[runnerGender || ''] || 'ambos';
    
    if (normalizedRunnerGender !== categoryGender && normalizedRunnerGender !== 'ambos') {
      throw new Error(`Esta categoria é exclusiva para ${categoryGender === 'masculino' ? 'homens' : 'mulheres'}.`);
    }
  }

  // Verificar se o corredor já tem uma inscrição ativa neste evento
  const existingRegistration = await query(
    `SELECT id, status, payment_status FROM registrations 
     WHERE event_id = $1 AND runner_id = $2 AND status != 'cancelled'`,
    [data.event_id, data.runner_id]
  );

  if (existingRegistration.rows.length > 0) {
    throw new Error('Você já possui uma inscrição ativa neste evento. Cada corredor pode se inscrever apenas uma vez por evento.');
  }

  // Check max_participants if set
  if (category.max_participants !== null && category.max_participants > 0) {
    const currentRegistrations = await query(
      `SELECT COUNT(*) as count FROM registrations 
       WHERE category_id = $1 AND status != 'cancelled'`,
      [data.category_id]
    );
    
    const count = parseInt(currentRegistrations.rows[0].count);
    if (count >= category.max_participants) {
      throw new Error(`Esta categoria atingiu o limite máximo de ${category.max_participants} participantes.`);
    }
  }

  // Generate confirmation code
  const confirmationCode = `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // Validate and apply coupon if provided
  if (data.coupon_code) {
    try {
      const { getEventById } = await import('./eventsService.js');
      const { validateCoupon, incrementCouponUsage } = await import('./couponsService.js');
      
      const event = await getEventById(data.event_id);
      if (event) {
        const validation = await validateCoupon(
          data.coupon_code, 
          event.organizer_id, 
          data.event_id
        );
        
        if (!validation.valid || !validation.coupon) {
          throw new Error(validation.error || 'Cupom inválido');
        }
        
        // Increment coupon usage
        await incrementCouponUsage(validation.coupon.id);
        console.log(`✅ Cupom ${data.coupon_code} aplicado e uso incrementado`);
      }
    } catch (error: any) {
      // Log error but don't fail registration if coupon validation fails
      console.error('⚠️ Erro ao validar/aplicar cupom (não bloqueia inscrição):', error.message);
      // Remove coupon_code if validation failed
      data.coupon_code = undefined;
    }
  }

  console.log('📝 Criando inscrição com dados:', {
    event_id: data.event_id,
    runner_id: data.runner_id,
    coupon_code: data.coupon_code,
    total_amount: data.total_amount,
  });

  // Set payment_status and status
  // If status/payment_status are explicitly provided (e.g., when organizer creates registration), use them
  // Otherwise, use default logic: confirmed for free_bonus, pending otherwise
  const paymentStatus = data.payment_status || (data.payment_method === 'free_bonus' ? 'convidado' : 'pending');
  const registrationStatus = data.status || (data.payment_method === 'free_bonus' ? 'confirmed' : 'pending');

  const result = await query(
    `INSERT INTO registrations (
      event_id, runner_id, registered_by, category_id, kit_id,
      payment_method, total_amount, confirmation_code, status, payment_status, coupon_code
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      data.event_id,
      data.runner_id,
      data.registered_by,
      data.category_id,
      data.kit_id || null,
      data.payment_method || null,
      data.total_amount,
      confirmationCode,
      registrationStatus,
      paymentStatus,
      data.coupon_code || null,
    ]
  );

  console.log('✅ Inscrição criada:', {
    id: result.rows[0].id,
    coupon_code: result.rows[0].coupon_code,
  });

  const registration = result.rows[0];

  // Save product and variant selections if provided
  if (data.product_selections && data.product_selections.length > 0) {
    try {
      for (const selection of data.product_selections) {
        // Priority 1: If attribute_selections is provided directly, use it (most reliable)
        if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
          // If attribute_selections is provided directly (for manual registration or when sent from frontend)
          for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
            await query(
              `INSERT INTO registration_product_selections 
               (registration_id, product_id, variant_id, attribute_name, attribute_value)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                registration.id,
                selection.product_id,
                selection.variant_id || null,
                attributeName,
                attributeValue,
              ]
            );
          }
        } else if (selection.variant_id) {
          // Priority 2: If variant_id is provided but no attribute_selections, get variant details to extract attributes
          const variantResult = await query(
            `SELECT name, product_id FROM product_variants WHERE id = $1`,
            [selection.variant_id]
          );
          
          if (variantResult.rows.length > 0) {
            const variant = variantResult.rows[0];
            
            // Get product variant_attributes to parse variant name
            const productResult = await query(
              `SELECT variant_attributes FROM kit_products WHERE id = $1`,
              [selection.product_id]
            );
            
            if (productResult.rows.length > 0) {
              const variantAttributes = productResult.rows[0].variant_attributes as string[] | null;
              
              if (variantAttributes && variantAttributes.length > 0) {
                // Parse variant name (format: "Value1 - Value2 - ...")
                const variantValues = variant.name.split(' - ').map((v: string) => v.trim());
                
                // Save each attribute selection
                for (let i = 0; i < variantAttributes.length && i < variantValues.length; i++) {
                  await query(
                    `INSERT INTO registration_product_selections 
                     (registration_id, product_id, variant_id, attribute_name, attribute_value)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                      registration.id,
                      selection.product_id,
                      selection.variant_id,
                      variantAttributes[i],
                      variantValues[i],
                    ]
                  );
                }
              }
            }
          }
        }
      }
      console.log(`✅ Seleções de produtos/variantes salvas para inscrição ${registration.id}`);
    } catch (error: any) {
      // Log error but don't fail registration if product selection save fails
      console.error('⚠️ Erro ao salvar seleções de produtos/variantes (não bloqueia inscrição):', error.message);
    }
  }

  // Check if user has a referral OR if coupon belongs to a leader, and create commission if applicable
  // Only create commission if payment is already paid (free registrations or instant payments)
  // For pending payments, commission will be created when payment is confirmed
  try {
    const { getUserReferral } = await import('./referralsService.js');
    const { getCouponByCodeOnly } = await import('./couponsService.js');
    const { createCommission } = await import('./commissionsService.js');
    
    // Only create commission if payment is already paid
    if (registration.payment_status === 'paid') {
      let leaderId: string | null = null;
      
      // Priority: check coupon first (coupon determines commission type)
      if (data.coupon_code) {
        try {
          const coupon = await getCouponByCodeOnly(data.coupon_code);
          if (coupon && coupon.leader_id) {
            leaderId = coupon.leader_id;
            console.log(`✅ Cupom ${data.coupon_code} pertence ao líder ${leaderId}`);
          }
        } catch (couponError: any) {
          console.log(`ℹ️ Erro ao buscar cupom ${data.coupon_code}:`, couponError.message);
        }
      }
      
      // If no coupon leader, check if user has a referral
      if (!leaderId) {
        const userReferral = await getUserReferral(data.runner_id);
        if (userReferral) {
          leaderId = userReferral.leader_id;
        }
      }
      
      if (leaderId) {
        // User was referred by a leader or used leader's coupon, create commission (only if event commission is configured)
        try {
          await createCommission({
            leader_id: leaderId,
            registration_id: registration.id,
            referred_user_id: data.runner_id,
            event_id: data.event_id,
            registration_amount: data.total_amount,
          });
          
          console.log(`✅ Comissão criada para líder ${leaderId} na inscrição ${registration.id}`);
        } catch (commissionError: any) {
          // If no commission is configured (invitation type only) or amount is 0, just check for bonuses
          if (commissionError.message.includes('No commission configured') || 
              commissionError.message.includes('invitation type only')) {
            console.log(`ℹ️ Tipo de bônus é apenas 'invitation', verificando bônus de convite...`);
            // Check for invitation bonuses even if no commission was created
            try {
              const { checkAllInvitationBonuses } = await import('./leaderBonusService.js');
              await checkAllInvitationBonuses(leaderId, data.event_id);
            } catch (bonusError: any) {
              console.error('❌ Erro ao verificar bônus de convite:', bonusError.message);
            }
          } else if (commissionError.message.includes('must be greater than 0')) {
            console.log(`ℹ️ Valor da comissão é 0, verificando apenas bônus de convite...`);
            // Check for invitation bonuses even if commission amount is 0
            try {
              const { checkAllInvitationBonuses } = await import('./leaderBonusService.js');
              await checkAllInvitationBonuses(leaderId, data.event_id);
            } catch (bonusError: any) {
              console.error('❌ Erro ao verificar bônus de convite:', bonusError.message);
            }
          } else {
            console.error('❌ Erro ao criar comissão:', commissionError.message);
          }
        }
      }
    } else {
      // Payment is pending - commission will be created when payment is confirmed
      console.log(`ℹ️ Pagamento pendente - comissão será criada quando o pagamento for confirmado`);
    }
  } catch (error: any) {
    // Log error but don't fail registration if commission creation fails
    console.error('❌ Erro ao verificar referência/cupom para inscrição:', error.message);
  }

  return registration;
};

// Update registration
export const updateRegistration = async (
  registrationId: string,
  data: UpdateRegistrationData
) => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(registrationId);

  const result = await query(
    `UPDATE registrations 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Find user by CPF
export const findUserByCpf = async (cpf: string) => {
  // Remove formatting from CPF
  const cleanCpf = cpf.replace(/[^0-9]/g, '');
  
  const result = await query(
    'SELECT id, full_name, cpf FROM profiles WHERE cpf = $1',
    [cleanCpf]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Find user by email
export const findUserByEmail = async (email: string) => {
  const result = await query(
    `SELECT p.id, p.full_name, p.cpf 
     FROM profiles p
     JOIN users u ON p.id = u.id
     WHERE u.email = $1`,
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Find user by CPF or email (tries CPF first, then email)
export const findUserByCpfOrEmail = async (cpf?: string, email?: string) => {
  if (cpf && cpf.trim()) {
    const userByCpf = await findUserByCpf(cpf);
    if (userByCpf) {
      return userByCpf;
    }
  }
  
  if (email && email.trim()) {
    const userByEmail = await findUserByEmail(email);
    if (userByEmail) {
      return userByEmail;
    }
  }
  
  return null;
};

/**
 * Get registrations with missing attribute selections for a user
 * Returns registrations that have products with variants but missing attribute selections
 */
export const getRegistrationsWithMissingAttributes = async (userId: string) => {
  console.log(`🔍 getRegistrationsWithMissingAttributes - Buscando para userId: ${userId}`);
  
  // Get all active registrations for the user
  const registrations = await getRegistrations({
    runner_id: userId,
    status: 'confirmed',
  });

  console.log(`🔍 getRegistrationsWithMissingAttributes - Inscrições confirmadas encontradas: ${registrations.length}`);

  // Also get pending registrations
  const pendingRegistrations = await getRegistrations({
    runner_id: userId,
    status: 'pending',
  });

  console.log(`🔍 getRegistrationsWithMissingAttributes - Inscrições pendentes encontradas: ${pendingRegistrations.length}`);

  // Combine and filter unique registrations
  const allRegistrations = [...registrations, ...pendingRegistrations].filter(
    (reg, index, self) => index === self.findIndex((r) => r.id === reg.id)
  );

  console.log(`🔍 getRegistrationsWithMissingAttributes - Total de inscrições únicas: ${allRegistrations.length}`);

  const result = [];

  for (const registration of allRegistrations) {
    console.log(`🔍 Processando inscrição ${registration.id} - Status: ${registration.status}, Kit: ${registration.kit_id}`);
    
    // Skip if no kit selected
    if (!registration.kit_id) {
      console.log(`⚠️ Inscrição ${registration.id} não tem kit, pulando`);
      continue;
    }

    // Get all products for this kit that have variants (variant_attributes is not null)
    const productsWithVariants = await query(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        p.variant_attributes,
        p.type
      FROM kit_products p
      WHERE p.kit_id = $1
        AND p.type = 'variable'
        AND p.variant_attributes IS NOT NULL
        AND jsonb_typeof(p.variant_attributes) = 'array'
        AND jsonb_array_length(p.variant_attributes) > 0`,
      [registration.kit_id]
    );

    console.log(`🔍 Inscrição ${registration.id} - Produtos com variações encontrados: ${productsWithVariants.rows.length}`);
    
    if (productsWithVariants.rows.length === 0) {
      // Debug: verificar todos os produtos do kit
      const allProducts = await query(
        `SELECT id, name, type, variant_attributes FROM kit_products WHERE kit_id = $1`,
        [registration.kit_id]
      );
      console.log(`🔍 Inscrição ${registration.id} - Todos os produtos do kit:`, allProducts.rows.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        variant_attributes: p.variant_attributes,
        has_variants: p.variant_attributes && Array.isArray(p.variant_attributes) && p.variant_attributes.length > 0
      })));
      continue; // No products with variants, skip
    }

    // For each product with variants, check if all required attributes are selected
    const productsWithMissingAttributes = [];

    for (const product of productsWithVariants.rows) {
      const variantAttributes = product.variant_attributes as string[];
      console.log(`🔍 Produto ${product.product_name} (${product.product_id}) - Atributos necessários:`, variantAttributes);

      // Get existing selections for this product in this registration
      const existingSelections = await query(
        `SELECT DISTINCT attribute_name
        FROM registration_product_selections
        WHERE registration_id = $1
          AND product_id = $2`,
        [registration.id, product.product_id]
      );

      console.log(`🔍 Produto ${product.product_name} - Seleções existentes:`, existingSelections.rows.map(r => r.attribute_name));

      const selectedAttributeNames = new Set(
        existingSelections.rows.map((row) => row.attribute_name)
      );

      // Check if all required attributes are selected
      const missingAttributes = variantAttributes.filter(
        (attrName) => !selectedAttributeNames.has(attrName)
      );

      console.log(`🔍 Produto ${product.product_name} - Atributos faltando:`, missingAttributes);

      if (missingAttributes.length > 0) {
        // Get available variants for this product
        const availableVariants = await query(
          `SELECT 
            pv.id as variant_id,
            pv.name as variant_name,
            pv.price
          FROM product_variants pv
          WHERE pv.product_id = $1
          ORDER BY pv.name`,
          [product.product_id]
        );

        // Parse variant names to extract attribute values
        const variantsWithAttributes = availableVariants.rows.map((variant) => {
          const variantValues = variant.variant_name.split(' - ').map((v: string) => v.trim());
          const attributeValues: Record<string, string> = {};

          variantAttributes.forEach((attrName, index) => {
            if (index < variantValues.length) {
              attributeValues[attrName] = variantValues[index];
            }
          });

          return {
            variant_id: variant.variant_id,
            variant_name: variant.variant_name,
            attribute_values: attributeValues,
          };
        });

        productsWithMissingAttributes.push({
          product_id: product.product_id,
          product_name: product.product_name,
          variant_attributes: variantAttributes,
          available_variants: variantsWithAttributes,
        });
      }
    }

    // If there are products with missing attributes, add to result
    if (productsWithMissingAttributes.length > 0) {
      result.push({
        registration_id: registration.id,
        event_title: registration.event_title,
        event_date: registration.event_date,
        kit_id: registration.kit_id,
        kit_name: registration.kit_name,
        products_with_missing_attributes: productsWithMissingAttributes,
      });
    }
  }

  return result;
};

/**
 * Complete missing attribute selections for a registration
 * Saves attribute selections for products that have variants
 */
export const completeRegistrationAttributes = async (
  registrationId: string,
  userId: string,
  productSelections: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections: Record<string, string>; // { attributeName: attributeValue }
  }>
) => {
  // Validate input parameters
  if (!registrationId || typeof registrationId !== 'string') {
    throw new Error('Registration ID is required');
  }

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required');
  }

  if (!productSelections || !Array.isArray(productSelections) || productSelections.length === 0) {
    throw new Error('At least one product selection is required');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(registrationId)) {
    throw new Error('Invalid registration ID format');
  }

  if (!uuidRegex.test(userId)) {
    throw new Error('Invalid user ID format');
  }

  // Validate product IDs format
  for (const selection of productSelections) {
    if (!selection.product_id || !uuidRegex.test(selection.product_id)) {
      throw new Error(`Invalid product ID format: ${selection.product_id}`);
    }
    if (selection.variant_id && !uuidRegex.test(selection.variant_id)) {
      throw new Error(`Invalid variant ID format: ${selection.variant_id}`);
    }
  }

  // Get registration and validate ownership
  const registration = await getRegistrationById(registrationId);
  
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Check if user is owner
  if (registration.runner_id !== userId && registration.registered_by !== userId) {
    throw new Error('You do not have permission to update this registration');
  }

  // Check if registration is active (not cancelled)
  if (registration.status === 'cancelled') {
    throw new Error('Cannot update attributes for cancelled registration');
  }

  // Validate that kit exists
  if (!registration.kit_id) {
    throw new Error('Registration does not have a kit');
  }

  // Get kit products to validate product_ids
  const kitProducts = await query(
    `SELECT id, name, variant_attributes, type
    FROM kit_products
    WHERE kit_id = $1`,
    [registration.kit_id]
  );

  const validProductIds = new Set(kitProducts.rows.map((p) => p.id));
  const productMap = new Map(kitProducts.rows.map((p) => [p.id, p]));

  // Validate all products belong to the kit
  for (const selection of productSelections) {
    if (!validProductIds.has(selection.product_id)) {
      throw new Error(`Product ${selection.product_id} does not belong to the kit of this registration`);
    }

    const product = productMap.get(selection.product_id);
    if (!product) continue;

    // If product has variant_attributes, validate all are provided
    if (product.variant_attributes && Array.isArray(product.variant_attributes) && product.variant_attributes.length > 0) {
      const requiredAttributes = product.variant_attributes as string[];
      const providedAttributes = Object.keys(selection.attribute_selections || {});

      // Check if all required attributes are provided
      const missingAttributes = requiredAttributes.filter(
        (attr) => !providedAttributes.includes(attr)
      );

      if (missingAttributes.length > 0) {
        throw new Error(
          `Missing required attributes for product ${product.name}: ${missingAttributes.join(', ')}`
        );
      }

      // Validate attribute values are valid (exist in available variants)
      const availableVariants = await query(
        `SELECT id, name FROM product_variants WHERE product_id = $1`,
        [selection.product_id]
      );

      // Get all valid attribute values from variants
      const validAttributeValues = new Map<string, Set<string>>();
      availableVariants.rows.forEach((variant) => {
        const variantValues = variant.name.split(' - ').map((v: string) => v.trim());
        requiredAttributes.forEach((attrName, index) => {
          if (index < variantValues.length) {
            if (!validAttributeValues.has(attrName)) {
              validAttributeValues.set(attrName, new Set());
            }
            validAttributeValues.get(attrName)!.add(variantValues[index]);
          }
        });
      });

      // Validate each provided attribute value
      for (const [attrName, attrValue] of Object.entries(selection.attribute_selections || {})) {
        if (!requiredAttributes.includes(attrName)) {
          throw new Error(`Attribute "${attrName}" is not required for product ${product.name}`);
        }

        const validValues = validAttributeValues.get(attrName);
        if (validValues && !validValues.has(attrValue)) {
          throw new Error(
            `Invalid value "${attrValue}" for attribute "${attrName}" in product ${product.name}. Valid values: ${Array.from(validValues).join(', ')}`
          );
        }
      }

      // Validate variant_id if provided
      if (selection.variant_id) {
        const variantResult = await query(
          `SELECT name, product_id FROM product_variants WHERE id = $1 AND product_id = $2`,
          [selection.variant_id, selection.product_id]
        );

        if (variantResult.rows.length === 0) {
          throw new Error(`Variant ${selection.variant_id} does not belong to product ${selection.product_id}`);
        }
      }
    }
  }

  // Delete existing selections for these products (to allow updates)
  for (const selection of productSelections) {
    await query(
      `DELETE FROM registration_product_selections
       WHERE registration_id = $1 AND product_id = $2`,
      [registrationId, selection.product_id]
    );
  }

  // Save new selections
  for (const selection of productSelections) {
    if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
      for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
        await query(
          `INSERT INTO registration_product_selections 
           (registration_id, product_id, variant_id, attribute_name, attribute_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            registrationId,
            selection.product_id,
            selection.variant_id || null,
            attributeName,
            attributeValue,
          ]
        );
      }
    }
  }

  console.log(`✅ Seleções de atributos completadas para inscrição ${registrationId}`);

  return {
    success: true,
    message: 'Attribute selections saved successfully',
  };
};

/**
 * Remove attribute selections for a registration
 * This allows the runner to select attributes again
 * @param registrationId - ID of the registration
 * @param productIds - Optional array of product IDs to remove attributes from. If not provided, removes all.
 */
export const removeRegistrationAttributes = async (
  registrationId: string,
  productIds?: string[]
) => {
  // Validate registration ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(registrationId)) {
    throw new Error('Invalid registration ID format');
  }

  // Get registration to validate it exists
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Check if registration is cancelled
  if (registration.status === 'cancelled') {
    throw new Error('Cannot remove attributes for cancelled registration');
  }

  // Delete attribute selections
  if (productIds && productIds.length > 0) {
    // Validate product IDs format
    for (const productId of productIds) {
      if (!uuidRegex.test(productId)) {
        throw new Error(`Invalid product ID format: ${productId}`);
      }
    }

    // Delete selections for specific products
    await query(
      `DELETE FROM registration_product_selections
       WHERE registration_id = $1 AND product_id = ANY($2::uuid[])`,
      [registrationId, productIds]
    );
  } else {
    // Delete all selections for this registration
    await query(
      `DELETE FROM registration_product_selections
       WHERE registration_id = $1`,
      [registrationId]
    );
  }

  console.log(`✅ Atributos removidos da inscrição ${registrationId}${productIds ? ` para produtos: ${productIds.join(', ')}` : ' (todos os produtos)'}`);

  return {
    success: true,
    message: productIds && productIds.length > 0
      ? 'Attribute selections removed for specified products'
      : 'All attribute selections removed',
  };
};

// Transfer registration to another runner
export const transferRegistration = async (
  registrationId: string,
  newRunnerId: string
) => {
  // Check if registration exists
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Get old runner ID before transfer
  const oldRunnerId = registration.runner_id;

  // Update runner_id and set status to transferred
  const result = await query(
    `UPDATE registrations 
     SET runner_id = $1, status = 'transferred', updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [newRunnerId, registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Send email notifications for transfer
  try {
    const { sendNotificationSafely, getUserEmail, getUserName } = await import('./notificationService.js');
    const { getEventById } = await import('./eventsService.js');
    
    const event = await getEventById(registration.event_id);
    if (event) {
      // Get runner names and emails
      const oldRunnerEmail = await getUserEmail(oldRunnerId);
      const oldRunnerName = await getUserName(oldRunnerId);
      const newRunnerEmail = await getUserEmail(newRunnerId);
      const newRunnerName = await getUserName(newRunnerId);

      // Format event date
      const eventDate = event.event_date ? new Date(event.event_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) : 'Data não informada';

      // Format event location
      const eventLocation = event.location || `${event.city || ''}${event.city && event.state ? ' - ' : ''}${event.state || ''}`.trim() || 'Local não informado';

      // Notify old runner (who transferred)
      if (oldRunnerEmail && oldRunnerName) {
        await sendNotificationSafely({
          templateKey: 'registration_transferred',
          recipient: {
            email: oldRunnerEmail,
            name: oldRunnerName,
          },
          variables: {
            userName: oldRunnerName,
            eventTitle: event.title,
            registrationCode: registration.confirmation_code,
            newRunnerName: newRunnerName || 'Novo titular',
            eventDate: eventDate,
            eventLocation: eventLocation,
          },
        });
        console.log('✅ Notificação de transferência enviada para runner que transferiu');
      }

      // Notify new runner (who received)
      if (newRunnerEmail && newRunnerName) {
        await sendNotificationSafely({
          templateKey: 'registration_received',
          recipient: {
            email: newRunnerEmail,
            name: newRunnerName,
          },
          variables: {
            userName: newRunnerName,
            eventTitle: event.title,
            registrationCode: registration.confirmation_code,
            oldRunnerName: oldRunnerName || 'Titular anterior',
            eventDate: eventDate,
            eventLocation: eventLocation,
          },
        });
        console.log('✅ Notificação de recebimento enviada para runner que recebeu');
      }
    }
  } catch (notificationError: any) {
    // Don't fail the transfer if notification fails
    console.error('❌ Erro ao enviar notificações de transferência:', notificationError);
  }

  return result.rows[0];
};

// Cancel registration
export const cancelRegistration = async (registrationId: string) => {
  // Check if registration exists
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Check if already cancelled
  if (registration.status === 'cancelled') {
    throw new Error('Registration is already cancelled');
  }

  // Update status to cancelled
  const result = await query(
    `UPDATE registrations 
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Delete registration (hard delete - only for admin)
export const deleteRegistration = async (registrationId: string) => {
  // Delete registration (cascade will handle related records)
  // Note: The controller should verify the registration exists before calling this
  const result = await query(
    `DELETE FROM registrations 
     WHERE id = $1
     RETURNING *`,
    [registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

