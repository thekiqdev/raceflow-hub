import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getSystemSettings, updateSystemSettings } from '../services/systemSettingsService.js';
import { z } from 'zod';

// Validation schema for system settings update
const updateSystemSettingsSchema = z.object({
  platform_name: z.string().min(1).optional(),
  platform_logo_url: z.string().url().optional().nullable(),
  platform_favicon_url: z.string().url().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  support_email: z.string().email().optional().nullable(),
  support_phone: z.string().optional().nullable(),
  company_address: z.string().optional().nullable(),
  company_city: z.string().optional().nullable(),
  company_state: z.string().optional().nullable(),
  company_zip: z.string().optional().nullable(),
  company_country: z.string().optional(),
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.number().int().min(1).max(65535).optional().nullable(),
  smtp_user: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
  smtp_from_email: z.string().email().optional().nullable(),
  smtp_from_name: z.string().optional().nullable(),
  smtp_secure: z.boolean().optional(),
  payment_gateway: z.string().optional(),
  payment_test_mode: z.boolean().optional(),
  payment_public_key: z.string().optional().nullable(),
  payment_secret_key: z.string().optional().nullable(),
  enabled_modules: z.record(z.boolean()).optional(),
  transfer_fee: z.number().min(0).optional(),
  maintenance_mode: z.boolean().optional(),
  maintenance_message: z.string().optional().nullable(),
  timezone: z.string().optional(),
  date_format: z.string().optional(),
  time_format: z.string().optional(),
  currency: z.string().optional(),
  language: z.string().optional(),
});

/**
 * GET /api/admin/settings
 * Get system settings
 */
export const getSystemSettingsController = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const settings = await getSystemSettings();

    res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch system settings',
    });
  }
};

/**
 * GET /api/settings/modules
 * Get enabled modules and transfer fee (public endpoint for runners)
 */
export const getEnabledModulesController = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const settings = await getSystemSettings();

    res.json({
      success: true,
      data: {
        enabled_modules: settings.enabled_modules || {},
        transfer_fee: settings.transfer_fee || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching enabled modules:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch enabled modules',
    });
  }
};

/**
 * PUT /api/admin/settings
 * Update system settings
 */
export const updateSystemSettingsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = updateSystemSettingsSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    // Convert null values to undefined for optional fields
    const cleanedData: any = {};
    Object.entries(validation.data).forEach(([key, value]) => {
      cleanedData[key] = value === null ? undefined : value;
    });
    const settings = await updateSystemSettings(cleanedData);

    res.json({
      success: true,
      data: settings,
      message: 'System settings updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update system settings',
    });
  }
};




