import { query } from '../config/database.js';

export interface SystemSettings {
  id: string;
  platform_name: string;
  platform_logo_url?: string;
  platform_favicon_url?: string;
  contact_email?: string;
  contact_phone?: string;
  support_email?: string;
  support_phone?: string;
  company_address?: string;
  company_city?: string;
  company_state?: string;
  company_zip?: string;
  company_country: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  smtp_secure: boolean;
  payment_gateway: string;
  payment_test_mode: boolean;
  payment_public_key?: string;
  payment_secret_key?: string;
  enabled_modules: Record<string, boolean>;
  transfer_fee?: number;
  maintenance_mode: boolean;
  maintenance_message?: string;
  timezone: string;
  date_format: string;
  time_format: string;
  currency: string;
  language: string;
  created_at: string;
  updated_at: string;
}

const SETTINGS_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';

/**
 * Get system settings
 */
export const getSystemSettings = async (): Promise<SystemSettings> => {
  const result = await query(
    'SELECT * FROM system_settings WHERE id = $1',
    [SETTINGS_ID]
  );

  if (result.rows.length === 0) {
    // Return default settings if not found
    return {
      id: SETTINGS_ID,
      platform_name: 'RaceFlow',
      company_country: 'Brasil',
      smtp_secure: true,
      payment_gateway: 'stripe',
      payment_test_mode: true,
      enabled_modules: {
        notifications: true,
        analytics: true,
        reports: true,
      },
      transfer_fee: 0,
      maintenance_mode: false,
      timezone: 'America/Sao_Paulo',
      date_format: 'DD/MM/YYYY',
      time_format: 'HH:mm',
      currency: 'BRL',
      language: 'pt-BR',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const row = result.rows[0];
  
  // Parse JSONB modules if it's a string
  let enabledModules = row.enabled_modules;
  if (typeof enabledModules === 'string') {
    try {
      enabledModules = JSON.parse(enabledModules);
    } catch {
      enabledModules = {
        notifications: true,
        analytics: true,
        reports: true,
      };
    }
  }

  return {
    ...row,
    enabled_modules: enabledModules || {
      notifications: true,
      analytics: true,
      reports: true,
    },
    smtp_port: row.smtp_port ? parseInt(row.smtp_port) : undefined,
    transfer_fee: row.transfer_fee ? parseFloat(row.transfer_fee) : undefined,
  } as SystemSettings;
};

/**
 * Update system settings
 */
export const updateSystemSettings = async (
  data: Partial<SystemSettings>
): Promise<SystemSettings> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Build update query dynamically
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') {
      return; // Skip these fields
    }

    if (value !== undefined) {
      if (key === 'enabled_modules' && typeof value === 'object') {
        // Convert object to JSON string for JSONB
        fields.push(`${key} = $${paramIndex}::jsonb`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    }
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  fields.push('updated_at = NOW()');
  values.push(SETTINGS_ID);

  const result = await query(
    `UPDATE system_settings 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Settings not found');
  }

  const row = result.rows[0];
  
  // Parse JSONB modules
  let enabledModules = row.enabled_modules;
  if (typeof enabledModules === 'string') {
    try {
      enabledModules = JSON.parse(enabledModules);
    } catch {
      enabledModules = {
        notifications: true,
        analytics: true,
        reports: true,
      };
    }
  }

  return {
    ...row,
    enabled_modules: enabledModules || {
      notifications: true,
      analytics: true,
      reports: true,
    },
    smtp_port: row.smtp_port ? parseInt(row.smtp_port) : undefined,
    transfer_fee: row.transfer_fee ? parseFloat(row.transfer_fee) : undefined,
  } as SystemSettings;
};




