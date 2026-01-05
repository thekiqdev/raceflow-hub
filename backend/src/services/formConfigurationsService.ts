import { query } from '../config/database.js';

export interface FormFieldConfiguration {
  id: string;
  form_type: 'quote' | 'contact';
  field_key: string;
  field_label: string;
  field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required: boolean;
  field_order: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any; // JSON array for select fields
  field_validation?: any; // JSON object with validation rules
  field_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFormFieldConfigurationData {
  form_type: 'quote' | 'contact';
  field_key: string;
  field_label: string;
  field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required?: boolean;
  field_order?: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any;
  field_validation?: any;
  field_enabled?: boolean;
}

export interface UpdateFormFieldConfigurationData {
  field_label?: string;
  field_type?: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
  field_placeholder?: string;
  field_required?: boolean;
  field_order?: number;
  field_width?: '100%' | '50%' | '33%';
  field_options?: any;
  field_validation?: any;
  field_enabled?: boolean;
}

/**
 * Initialize default form configurations if they don't exist
 */
export const initializeDefaultFormConfigurations = async (formType: 'quote' | 'contact'): Promise<void> => {
  // Check if configurations already exist (without initializing)
  const result = await query(
    `SELECT COUNT(*) as count FROM form_configurations WHERE form_type = $1`,
    [formType]
  );
  
  if (parseInt(result.rows[0].count) > 0) {
    return; // Already initialized
  }

  if (formType === 'quote') {
    const defaultFields: CreateFormFieldConfigurationData[] = [
      { form_type: 'quote', field_key: 'fullName', field_label: 'Nome completo', field_type: 'text', field_required: true, field_order: 0, field_width: '100%', field_enabled: true },
      { form_type: 'quote', field_key: 'phone', field_label: 'Telefone para contato (whatsapp)', field_type: 'tel', field_placeholder: 'Telefone com DDD somente números', field_required: true, field_order: 1, field_width: '50%', field_enabled: true },
      { form_type: 'quote', field_key: 'email', field_label: 'E-mail', field_type: 'email', field_required: true, field_order: 2, field_width: '50%', field_enabled: true },
      { form_type: 'quote', field_key: 'eventLocation', field_label: 'Local da prova', field_type: 'text', field_required: true, field_order: 3, field_enabled: true },
      { form_type: 'quote', field_key: 'athletesCount', field_label: 'Quantidade de atletas', field_type: 'text', field_required: true, field_order: 4, field_enabled: true },
      { form_type: 'quote', field_key: 'sameStartFinish', field_label: 'Largada e chegada no mesmo local?', field_type: 'select', field_options: ['Sim', 'Não'], field_required: true, field_order: 5, field_enabled: true },
      { form_type: 'quote', field_key: 'electricPower', field_label: 'Energia elétrica disponível?', field_type: 'select', field_options: ['Sim', 'Não'], field_required: true, field_order: 6, field_enabled: true },
      { form_type: 'quote', field_key: 'additionalPoints', field_label: 'Pontos adicionais', field_type: 'textarea', field_required: false, field_order: 7, field_enabled: true },
      { form_type: 'quote', field_key: 'chestNumbers', field_label: 'Números de peito', field_type: 'text', field_required: true, field_order: 8, field_enabled: true },
      { form_type: 'quote', field_key: 'distances', field_label: 'Distâncias', field_type: 'text', field_required: true, field_order: 9, field_enabled: true },
      { form_type: 'quote', field_key: 'timingGate', field_label: 'Portão de cronometragem', field_type: 'select', field_options: ['Sim', 'Não'], field_required: true, field_order: 10, field_enabled: true },
      { form_type: 'quote', field_key: 'cronoteamRegistration', field_label: 'Inscrições via Cronoteam', field_type: 'select', field_options: ['Sim', 'Não'], field_required: true, field_order: 11, field_enabled: true },
      { form_type: 'quote', field_key: 'eventDate', field_label: 'Data da prova', field_type: 'date', field_required: true, field_order: 12, field_enabled: true },
      { form_type: 'quote', field_key: 'description', field_label: 'Descrição', field_type: 'textarea', field_required: true, field_order: 13, field_enabled: true },
    ];

    for (const field of defaultFields) {
      await createFormFieldConfiguration(field);
    }
  } else if (formType === 'contact') {
    const defaultFields: CreateFormFieldConfigurationData[] = [
      { form_type: 'contact', field_key: 'name', field_label: 'Nome', field_type: 'text', field_required: true, field_order: 0, field_width: '100%', field_enabled: true },
      { form_type: 'contact', field_key: 'email', field_label: 'E-mail', field_type: 'email', field_required: true, field_order: 1, field_width: '50%', field_enabled: true },
      { form_type: 'contact', field_key: 'phone', field_label: 'Telefone', field_type: 'tel', field_required: false, field_order: 2, field_width: '50%', field_enabled: true },
      { form_type: 'contact', field_key: 'subject', field_label: 'Assunto', field_type: 'text', field_required: true, field_order: 3, field_width: '100%', field_enabled: true },
      { form_type: 'contact', field_key: 'message', field_label: 'Mensagem', field_type: 'textarea', field_required: true, field_order: 4, field_width: '100%', field_enabled: true },
    ];

    for (const field of defaultFields) {
      await createFormFieldConfiguration(field);
    }
  }
};

/**
 * Get all form field configurations for a specific form type
 */
export const getFormConfigurations = async (formType: 'quote' | 'contact', initializeIfEmpty: boolean = true): Promise<FormFieldConfiguration[]> => {
  try {
    const result = await query(
      `SELECT * FROM form_configurations 
       WHERE form_type = $1 
       ORDER BY field_order ASC, field_key ASC`,
      [formType]
    );

    const configurations = result.rows.map((row) => ({
      id: row.id,
      form_type: row.form_type,
      field_key: row.field_key,
      field_label: row.field_label,
      field_type: row.field_type,
      field_placeholder: row.field_placeholder,
      field_required: row.field_required,
      field_order: row.field_order,
      field_width: row.field_width || '100%',
      field_options: row.field_options,
      field_validation: row.field_validation,
      field_enabled: row.field_enabled,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    // If no configurations exist and we should initialize, create defaults
    if (configurations.length === 0 && initializeIfEmpty) {
      try {
        await initializeDefaultFormConfigurations(formType);
        // Fetch again after initialization (but don't initialize again to avoid infinite loop)
        return getFormConfigurations(formType, false);
      } catch (initError) {
        console.error(`Error initializing default form configurations for ${formType}:`, initError);
        // Return empty array if initialization fails
        return [];
      }
    }

    return configurations;
  } catch (error) {
    console.error(`Error getting form configurations for ${formType}:`, error);
    throw error;
  }
};

/**
 * Get a single form field configuration by ID
 */
export const getFormFieldConfigurationById = async (id: string): Promise<FormFieldConfiguration | null> => {
  const result = await query(
    'SELECT * FROM form_configurations WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    form_type: row.form_type,
    field_key: row.field_key,
    field_label: row.field_label,
    field_type: row.field_type,
    field_placeholder: row.field_placeholder,
    field_required: row.field_required,
    field_order: row.field_order,
    field_options: row.field_options,
    field_validation: row.field_validation,
    field_enabled: row.field_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Create a new form field configuration
 */
export const createFormFieldConfiguration = async (
  data: CreateFormFieldConfigurationData
): Promise<FormFieldConfiguration> => {
  const result = await query(
    `INSERT INTO form_configurations (
      form_type, field_key, field_label, field_type, field_placeholder,
      field_required, field_order, field_width, field_options, field_validation, field_enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      data.form_type,
      data.field_key,
      data.field_label,
      data.field_type,
      data.field_placeholder || null,
      data.field_required !== undefined ? data.field_required : true,
      data.field_order !== undefined ? data.field_order : 0,
      data.field_width || '100%',
      data.field_options ? JSON.stringify(data.field_options) : null,
      data.field_validation ? JSON.stringify(data.field_validation) : null,
      data.field_enabled !== undefined ? data.field_enabled : true,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    form_type: row.form_type,
    field_key: row.field_key,
    field_label: row.field_label,
    field_type: row.field_type,
    field_placeholder: row.field_placeholder,
    field_required: row.field_required,
    field_order: row.field_order,
    field_width: row.field_width || '100%',
    field_options: row.field_options,
    field_validation: row.field_validation,
    field_enabled: row.field_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Update a form field configuration
 */
export const updateFormFieldConfiguration = async (
  id: string,
  data: UpdateFormFieldConfigurationData
): Promise<FormFieldConfiguration> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.field_label !== undefined) {
    updates.push(`field_label = $${paramCount++}`);
    values.push(data.field_label);
  }
  if (data.field_type !== undefined) {
    updates.push(`field_type = $${paramCount++}`);
    values.push(data.field_type);
  }
  if (data.field_placeholder !== undefined) {
    updates.push(`field_placeholder = $${paramCount++}`);
    values.push(data.field_placeholder);
  }
  if (data.field_required !== undefined) {
    updates.push(`field_required = $${paramCount++}`);
    values.push(data.field_required);
  }
  if (data.field_order !== undefined) {
    updates.push(`field_order = $${paramCount++}`);
    values.push(data.field_order);
  }
  if (data.field_width !== undefined) {
    updates.push(`field_width = $${paramCount++}`);
    values.push(data.field_width);
  }
  if (data.field_options !== undefined) {
    updates.push(`field_options = $${paramCount++}`);
    values.push(data.field_options ? JSON.stringify(data.field_options) : null);
  }
  if (data.field_validation !== undefined) {
    updates.push(`field_validation = $${paramCount++}`);
    values.push(data.field_validation ? JSON.stringify(data.field_validation) : null);
  }
  if (data.field_enabled !== undefined) {
    updates.push(`field_enabled = $${paramCount++}`);
    values.push(data.field_enabled);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE form_configurations 
     SET ${updates.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Form field configuration not found');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    form_type: row.form_type,
    field_key: row.field_key,
    field_label: row.field_label,
    field_type: row.field_type,
    field_placeholder: row.field_placeholder,
    field_required: row.field_required,
    field_order: row.field_order,
    field_width: row.field_width || '100%',
    field_options: row.field_options,
    field_validation: row.field_validation,
    field_enabled: row.field_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Delete a form field configuration
 */
export const deleteFormFieldConfiguration = async (id: string): Promise<void> => {
  const result = await query(
    'DELETE FROM form_configurations WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error('Form field configuration not found');
  }
};

/**
 * Reorder form field configurations
 */
export const reorderFormFields = async (
  formType: 'quote' | 'contact',
  fieldOrders: Array<{ id: string; order: number }>
): Promise<void> => {
  // Use a transaction to update all orders at once
  await query('BEGIN');
  try {
    for (const { id, order } of fieldOrders) {
      await query(
        'UPDATE form_configurations SET field_order = $1, updated_at = NOW() WHERE id = $2 AND form_type = $3',
        [order, id, formType]
      );
    }
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
};

/**
 * Bulk update form field configurations
 */
export const bulkUpdateFormConfigurations = async (
  formType: 'quote' | 'contact',
  configurations: Array<{
    id?: string;
    field_key: string;
    field_label: string;
    field_type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'number';
    field_placeholder?: string;
    field_required: boolean;
    field_order: number;
    field_options?: any;
    field_validation?: any;
    field_enabled: boolean;
  }>
): Promise<FormFieldConfiguration[]> => {
  await query('BEGIN');
  try {
    // Delete existing configurations for this form type
    await query('DELETE FROM form_configurations WHERE form_type = $1', [formType]);

    // Insert new configurations
    const results: FormFieldConfiguration[] = [];
    for (const config of configurations) {
      const result = await query(
        `INSERT INTO form_configurations (
          form_type, field_key, field_label, field_type, field_placeholder,
          field_required, field_order, field_width, field_options, field_validation, field_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          formType,
          config.field_key,
          config.field_label,
          config.field_type,
          config.field_placeholder || null,
          config.field_required,
          config.field_order,
          config.field_width || '100%',
          config.field_options ? JSON.stringify(config.field_options) : null,
          config.field_validation ? JSON.stringify(config.field_validation) : null,
          config.field_enabled,
        ]
      );

      const row = result.rows[0];
      results.push({
        id: row.id,
        form_type: row.form_type,
        field_key: row.field_key,
        field_label: row.field_label,
        field_type: row.field_type,
        field_placeholder: row.field_placeholder,
        field_required: row.field_required,
        field_order: row.field_order,
        field_width: row.field_width || '100%',
        field_options: row.field_options,
        field_validation: row.field_validation,
        field_enabled: row.field_enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }

    await query('COMMIT');
    return results;
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
};
