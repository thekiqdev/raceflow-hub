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
  platform_fee: z.number().min(0).optional(),
  platform_fee_type: z.enum(['fixed', 'percentage']).optional(),
  platform_fee_min: z.number().min(0).optional(),
  withdrawal_fee: z.number().min(0).optional(),
  withdrawal_fee_type: z.enum(['fixed', 'percentage']).optional(),
  registration_edit_fee: z.number().min(0).optional(),
  // leader_commission_percentage removed - now using event-specific commissions only
  maintenance_mode: z.boolean().optional(),
  maintenance_message: z.string().optional().nullable(),
  timezone: z.string().optional(),
  date_format: z.string().optional(),
  time_format: z.string().optional(),
  currency: z.string().optional(),
  language: z.string().optional(),
  old_results_url: z.string().url().optional().nullable(),
  old_platform_url: z.string().url().optional().nullable(),
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
        platform_fee: settings.platform_fee || 0,
        platform_fee_type: settings.platform_fee_type || 'fixed',
        platform_fee_min: settings.platform_fee_min ?? 0,
        withdrawal_fee: settings.withdrawal_fee || 0,
        withdrawal_fee_type: settings.withdrawal_fee_type || 'fixed',
        old_platform_url: settings.old_platform_url || null,
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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update system settings',
      detail: error.detail || undefined,
      hint: error.hint || undefined,
    });
  }
};

/**
 * POST /api/admin/settings/test-email
 * Test email sending with current SMTP configuration
 */
export const testEmailController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Email válido é obrigatório',
      });
      return;
    }

    // Get current SMTP settings
    const settings = await getSystemSettings();

    // Check if SMTP is configured
    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
      res.status(400).json({
        success: false,
        error: 'SMTP não configurado',
        message: 'Por favor, configure as credenciais SMTP antes de testar o envio de email.',
      });
      return;
    }

    // Import sendEmail function
    const { sendEmail } = await import('../services/notificationService.js');

    // Send test email
    const fromEmail = settings.smtp_from_email || settings.contact_email || settings.smtp_user;
    const fromName = settings.smtp_from_name || settings.platform_name || 'Sistema';
    const platformName = settings.platform_name || 'Sistema';

    const testEmailSent = await sendEmail({
      to: email,
      subject: `Teste de Email - ${platformName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #4F46E5;
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 5px 5px 0 0;
            }
            .content {
              background-color: #f9fafb;
              padding: 30px;
              border: 1px solid #e5e7eb;
            }
            .success {
              background-color: #10b981;
              color: white;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              text-align: center;
            }
            .footer {
              text-align: center;
              padding: 20px;
              color: #6b7280;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Teste de Email</h1>
            </div>
            <div class="content">
              <div class="success">
                <strong>Email enviado com sucesso!</strong>
              </div>
              <p>Olá,</p>
              <p>Este é um email de teste enviado pelo sistema <strong>${platformName}</strong>.</p>
              <p>Se você recebeu este email, significa que a configuração SMTP está funcionando corretamente.</p>
              <p><strong>Detalhes da configuração:</strong></p>
              <ul>
                <li><strong>Servidor SMTP:</strong> ${settings.smtp_host}</li>
                <li><strong>Porta:</strong> ${settings.smtp_port || 587}</li>
                <li><strong>Usuário:</strong> ${settings.smtp_user}</li>
                <li><strong>Conexão Segura:</strong> ${settings.smtp_secure ? 'Sim (TLS/SSL)' : 'Não'}</li>
                <li><strong>Remetente:</strong> ${fromName} &lt;${fromEmail}&gt;</li>
              </ul>
              <p>Data e hora do envio: ${new Date().toLocaleString('pt-BR', { timeZone: settings.timezone || 'America/Sao_Paulo' })}</p>
            </div>
            <div class="footer">
              <p>Este é um email automático, por favor não responda.</p>
              <p>&copy; ${new Date().getFullYear()} ${platformName}. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      from: fromEmail,
      fromName: fromName,
    });

    if (testEmailSent) {
      res.json({
        success: true,
        message: `Email de teste enviado com sucesso para ${email}`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erro ao enviar email',
        message: 'Não foi possível enviar o email de teste. Verifique as credenciais SMTP e tente novamente.',
      });
    }
  } catch (error: any) {
    console.error('Error testing email:', error);
    
    // Provide user-friendly error message
    let errorMessage = error.userMessage || error.message || 'Erro ao testar envio de email';
    
    // Add specific guidance based on error
    if (error.message?.includes('Porta 21')) {
      errorMessage = 'Porta 21 é FTP, não SMTP! Use 587 (STARTTLS) ou 465 (SSL). Desative "Conexão Segura" para porta 587.';
    } else if (error.code === 'ESOCKET' || error.reason?.includes('wrong version number')) {
      errorMessage = `Erro de conexão SSL/TLS. Dicas:
- Porta 587: Desative "Conexão Segura" (usa STARTTLS)
- Porta 465: Ative "Conexão Segura" (usa SSL direto)
- Verifique se o servidor SMTP está correto`;
    }
    
    res.status(500).json({
      success: false,
      error: 'Erro ao enviar email',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        reason: error.reason,
        command: error.command,
      } : undefined,
    });
  }
};




