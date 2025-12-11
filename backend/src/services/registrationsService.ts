import { query } from '../config/database.js';
import { RegistrationStatus, PaymentStatus, PaymentMethod } from '../types/index.js';

export interface CreateRegistrationData {
  event_id: string;
  runner_id: string;
  registered_by: string;
  category_id: string;
  kit_id?: string;
  payment_method?: PaymentMethod;
  total_amount: number;
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
    SELECT 
      r.*,
      e.title as event_title,
      e.event_date,
      e.organizer_id as event_organizer_id,
      ec.name as category_name,
      ec.distance as category_distance,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      ek.name as kit_name,
      -- Se a inscrição foi transferida e o runner_id atual é diferente do registered_by,
      -- mostrar como 'confirmed' para o novo titular, senão manter o status original
      CASE 
        WHEN r.status = 'transferred' AND r.runner_id != r.registered_by THEN 'confirmed'
        ELSE r.status
      END as display_status
    FROM registrations r
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN event_categories ec ON r.category_id = ec.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN event_kits ek ON r.kit_id = ek.id
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.event_id) {
    conditions.push(`r.event_id = $${params.length + 1}`);
    params.push(filters.event_id);
  }

  if (filters?.runner_id) {
    conditions.push(`r.runner_id = $${params.length + 1}`);
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

  queryText += ' ORDER BY r.created_at DESC';

  const result = await query(queryText, params);
  
  // Replace status with display_status in the results
  return result.rows.map(row => ({
    ...row,
    status: row.display_status || row.status,
  }));
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
      ec.name as category_name,
      ec.distance as category_distance,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      p.phone as runner_phone,
      u.email as runner_email,
      ek.name as kit_name,
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
    LEFT JOIN event_categories ec ON r.category_id = ec.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN event_kits ek ON r.kit_id = ek.id
    WHERE r.id = $1`,
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
  // Generate confirmation code
  const confirmationCode = `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  const result = await query(
    `INSERT INTO registrations (
      event_id, runner_id, registered_by, category_id, kit_id,
      payment_method, total_amount, confirmation_code, status, payment_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'pending')
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
    ]
  );

  return result.rows[0];
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

