import { getNotificationTemplateByKey, type NotificationTemplate } from './notificationTemplatesService.js';
import { getSystemSettings } from './systemSettingsService.js';
import { query } from '../config/database.js';

export interface NotificationRecipient {
  email?: string;
  phone?: string;
  userId?: string;
  name?: string;
}

export interface SendNotificationOptions {
  templateKey: string;
  recipient: NotificationRecipient;
  variables: Record<string, any>;
  type?: 'email' | 'sms' | 'push' | 'in_app';
  forceType?: boolean; // Force specific type even if template has different type
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
}

/**
 * Render template with variables
 * Replaces {{variable}} with actual values
 */
export const renderTemplate = (template: string, variables: Record<string, any>): string => {
  let rendered = template;
  
  // Replace all {{variable}} patterns
  Object.keys(variables).forEach((key) => {
    const value = variables[key] !== null && variables[key] !== undefined 
      ? String(variables[key]) 
      : '';
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, value);
  });

  // Remove any remaining {{variable}} patterns (optional variables not provided)
  rendered = rendered.replace(/\{\{[\w]+\}\}/g, '');

  return rendered;
};

/**
 * Validate that all required variables are provided
 */
export const validateVariables = (
  template: NotificationTemplate,
  variables: Record<string, any>
): { valid: boolean; missing: string[] } => {
  const templateVars = template.variables || {};
  const requiredVars = Object.keys(templateVars);
  const providedVars = Object.keys(variables);
  
  const missing = requiredVars.filter((key) => !providedVars.includes(key));
  
  return {
    valid: missing.length === 0,
    missing,
  };
};

/**
 * Send email using SMTP configuration
 */
export const sendEmail = async (options: SendEmailOptions): Promise<boolean> => {
  try {
    const settings = await getSystemSettings();
    
    // Check if SMTP is configured
    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
      console.warn('⚠️ SMTP não configurado. Email não enviado.');
      console.log('📧 Email que seria enviado:', {
        to: options.to,
        subject: options.subject,
        from: options.from || settings.smtp_from_email || settings.contact_email,
      });
      return false;
    }

    // Import nodemailer
    const nodemailer = await import('nodemailer');
    
    // Determine port and secure settings
    const port = settings.smtp_port || 587;
    
    // Auto-detect secure based on port if not explicitly set
    // Port 465 = SSL/TLS (secure: true)
    // Port 587 = STARTTLS (secure: false, requiresTLS: true)
    // Port 25 = Usually no encryption (secure: false)
    // Other ports = Use user setting
    let secure = settings.smtp_secure;
    let requireTLS = false;
    
    if (port === 465) {
      // Port 465 always uses SSL/TLS
      secure = true;
      requireTLS = false;
    } else if (port === 587) {
      // Port 587 uses STARTTLS
      secure = false;
      requireTLS = true;
    } else if (port === 25) {
      // Port 25 usually no encryption
      secure = false;
      requireTLS = false;
    } else {
      // For other ports, use user setting but default to false
      secure = settings.smtp_secure ?? false;
      requireTLS = settings.smtp_secure ?? false;
    }
    
    // Validate port (common SMTP ports: 25, 465, 587, 2525, 8025)
    const validSmtpPorts = [25, 465, 587, 2525, 8025];
    if (!validSmtpPorts.includes(port) && port !== 21) {
      console.warn(`⚠️ Porta ${port} não é uma porta SMTP comum. Portas recomendadas: 25, 465, 587, 2525, 8025`);
    }
    
    if (port === 21) {
      console.error('❌ Porta 21 é FTP, não SMTP! Use 587 (STARTTLS) ou 465 (SSL)');
      throw new Error('Porta 21 é FTP, não SMTP. Use 587 (STARTTLS) ou 465 (SSL)');
    }
    
    console.log(`📧 Configurando SMTP: host=${settings.smtp_host}, port=${port}, secure=${secure}, requireTLS=${requireTLS}`);
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: port,
      secure: secure, // true for 465 (SSL), false for 587 (STARTTLS)
      requireTLS: requireTLS, // Force STARTTLS for port 587
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password,
      },
      // Add TLS options for better compatibility
      tls: {
        rejectUnauthorized: false, // Accept self-signed certificates
        minVersion: 'TLSv1.2', // Minimum TLS version
      },
    });

    // Verify connection (skip for test emails to avoid blocking)
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified');
    } catch (verifyError: any) {
      console.error('❌ SMTP verification failed:', verifyError);
      // For test emails, we still want to try sending even if verify fails
      // Some servers don't support verify but can still send emails
    }

    // Prepare email options
    const fromEmail = options.from || settings.smtp_from_email || settings.contact_email || settings.smtp_user;
    const fromName = options.fromName || settings.smtp_from_name || settings.platform_name || 'Sistema';
    const textContent = options.text || options.html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    // Send email
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: textContent,
    });

    console.log('✅ Email enviado com sucesso:', {
      messageId: info.messageId,
      to: options.to,
      subject: options.subject,
    });

    return true;
  } catch (error: any) {
    console.error('❌ Erro ao enviar email:', error);
    console.error('Detalhes do erro:', {
      message: error.message,
      code: error.code,
      command: error.command,
      reason: error.reason,
    });
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Erro desconhecido ao enviar email';
    
    if (error.code === 'ESOCKET' || error.reason?.includes('wrong version number')) {
      errorMessage = `Erro de conexão SSL/TLS. Verifique:
- Porta correta (587 para STARTTLS, 465 para SSL)
- Configuração "Conexão Segura" (desative para porta 587, ative para porta 465)
- Servidor SMTP correto`;
    } else if (error.code === 'EAUTH') {
      errorMessage = 'Erro de autenticação. Verifique usuário e senha SMTP';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      errorMessage = `Não foi possível conectar ao servidor SMTP. Verifique:
- Servidor SMTP correto
- Porta correta
- Firewall/proxy não está bloqueando`;
    }
    
    // Store error message for better error reporting
    error.userMessage = errorMessage;
    throw error;
  }
};

/**
 * Send SMS (placeholder for future implementation)
 */
export const sendSMS = async (to: string, message: string): Promise<boolean> => {
  // TODO: Implementar envio de SMS
  console.log('📱 SMS que seria enviado:', { to, message: message.substring(0, 50) + '...' });
  return false;
};

/**
 * Send push notification (placeholder for future implementation)
 */
export const sendPushNotification = async (userId: string, title: string, body: string): Promise<boolean> => {
  // TODO: Implementar push notifications
  console.log('🔔 Push que seria enviado:', { userId, title, body });
  return false;
};

/**
 * Send in-app notification (using announcements table)
 */
export const sendInAppNotification = async (
  userId: string,
  title: string,
  content: string
): Promise<boolean> => {
  try {
    const { query } = await import('../config/database.js');
    
    const result = await query(
      `INSERT INTO announcements (title, content, target_audience, status, published_at, created_by)
       VALUES ($1, $2, 'runners', 'published', NOW(), $3)
       RETURNING id`,
      [title, content, userId]
    );

    // Mark as unread for the user
    if (result.rows[0]?.id) {
      await query(
        `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
         VALUES ($1, $2, NULL)
         ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = NULL`,
        [result.rows[0].id, userId]
      );
    }

    return true;
  } catch (error: any) {
    console.error('❌ Erro ao criar notificação in-app:', error);
    return false;
  }
};

/**
 * Get user email by user ID
 */
export const getUserEmail = async (userId: string): Promise<string | null> => {
  try {
    const result = await query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      console.warn(`⚠️ Usuário não encontrado: ${userId}`);
      return null;
    }

    return result.rows[0].email || null;
  } catch (error: any) {
    console.error(`❌ Erro ao buscar email do usuário ${userId}:`, error);
    return null;
  }
};

/**
 * Get admin email from system settings
 */
export const getAdminEmail = async (): Promise<string | null> => {
  try {
    const settings = await getSystemSettings();
    
    // Try support_email first, then contact_email
    const adminEmail = settings.support_email || settings.contact_email;
    
    if (!adminEmail) {
      console.warn('⚠️ Email do admin não configurado nas configurações do sistema');
      return null;
    }

    return adminEmail;
  } catch (error: any) {
    console.error('❌ Erro ao buscar email do admin:', error);
    return null;
  }
};

/**
 * Get organizer email by organizer ID
 * Tries profile.contact_email first, then users.email
 */
export const getOrganizerEmail = async (organizerId: string): Promise<string | null> => {
  try {
    // First try to get contact_email from profile
    const profileResult = await query(
      'SELECT contact_email FROM profiles WHERE id = $1',
      [organizerId]
    );

    if (profileResult.rows.length > 0 && profileResult.rows[0].contact_email) {
      return profileResult.rows[0].contact_email;
    }

    // Fallback to users.email
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [organizerId]
    );

    if (userResult.rows.length === 0) {
      console.warn(`⚠️ Organizador não encontrado: ${organizerId}`);
      return null;
    }

    return userResult.rows[0].email || null;
  } catch (error: any) {
    console.error(`❌ Erro ao buscar email do organizador ${organizerId}:`, error);
    return null;
  }
};

/**
 * Get user name by user ID
 */
export const getUserName = async (userId: string): Promise<string | null> => {
  try {
    const result = await query(
      'SELECT full_name FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].full_name || null;
  } catch (error: any) {
    console.error(`❌ Erro ao buscar nome do usuário ${userId}:`, error);
    return null;
  }
};

/**
 * Send notification safely (wrapper that doesn't break the main flow)
 * This function catches all errors and logs them, but never throws
 */
export const sendNotificationSafely = async (options: SendNotificationOptions): Promise<void> => {
  try {
    const success = await sendNotification(options);
    if (success) {
      console.log(`✅ Notificação enviada com sucesso: ${options.templateKey} para ${options.recipient.email || options.recipient.userId}`);
    } else {
      console.warn(`⚠️ Falha ao enviar notificação: ${options.templateKey} para ${options.recipient.email || options.recipient.userId}`);
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to break the main flow
    console.error(`❌ Erro ao enviar notificação ${options.templateKey}:`, error);
    console.error('Stack trace:', error.stack);
  }
};

/**
 * Send notification using template
 */
export const sendNotification = async (options: SendNotificationOptions): Promise<boolean> => {
  try {
    // Get template
    let template = await getNotificationTemplateByKey(options.templateKey);
    
    // If template doesn't exist, try to initialize default templates
    if (!template) {
      console.log(`ℹ️ Template ${options.templateKey} não encontrado, tentando inicializar templates padrão...`);
      const { initializeDefaultTemplates } = await import('./notificationTemplatesService.js');
      try {
        await initializeDefaultTemplates();
        // Try to get template again after initialization
        template = await getNotificationTemplateByKey(options.templateKey);
      } catch (initError: any) {
        console.error(`❌ Erro ao inicializar templates padrão:`, initError);
      }
    }
    
    if (!template) {
      console.error(`❌ Template não encontrado: ${options.templateKey}`);
      return false;
    }

    if (!template.is_active) {
      console.warn(`⚠️ Template inativo: ${options.templateKey}`);
      return false;
    }

    // Validate variables
    const validation = validateVariables(template, options.variables);
    if (!validation.valid) {
      console.error(`❌ Variáveis faltando no template ${options.templateKey}:`, validation.missing);
      return false;
    }

    // Determine notification type
    const notificationType = options.forceType || options.type || template.template_type;

    // Render templates
    const renderedSubject = template.subject ? renderTemplate(template.subject, options.variables) : '';
    let renderedHtml = template.body_html ? renderTemplate(template.body_html, options.variables) : '';
    let renderedText = template.body_text ? renderTemplate(template.body_text, options.variables) : '';

    const siteUrl = (process.env.FRONTEND_URL || 'https://cronoteam.com.br').replace(/\/$/, '');

    if (notificationType === 'email') {
      // Header: logo (from admin config) + site name + link
      let platformName = 'Cronoteam';
      let logoUrl: string | null = null;
      try {
        const settings = await getSystemSettings();
        if (settings.platform_name) platformName = settings.platform_name;
        if (settings.platform_logo_url && settings.platform_logo_url.trim()) {
          // URL absoluta (http/https) ou data URL (base64) – ambos válidos para img em email
          if (settings.platform_logo_url.startsWith('http') || settings.platform_logo_url.startsWith('data:')) {
            logoUrl = settings.platform_logo_url;
          } else {
            const baseUrl = (process.env.BACKEND_URL || process.env.API_URL || process.env.FRONTEND_URL || siteUrl).replace(/\/$/, '');
            logoUrl = settings.platform_logo_url.startsWith('/') ? `${baseUrl}${settings.platform_logo_url}` : `${baseUrl}/${settings.platform_logo_url}`;
          }
        }
      } catch (_e) {
        // keep defaults
      }
      const emailHeaderHtml = `
<div style="background-color: #f8f9fa; padding: 20px 24px; margin: 0 -8px 24px -8px; border-bottom: 1px solid #eee; text-align: center;">
  <a href="${siteUrl}" style="text-decoration: none; color: #333;">
${logoUrl ? `    <img src="${logoUrl}" alt="${platformName}" style="max-width: 180px; max-height: 60px; height: auto; display: inline-block; vertical-align: middle;" />` : ''}
${logoUrl ? '    <br style="line-height: 12px;" />' : ''}
    <span style="font-size: 18px; font-weight: 600; ${logoUrl ? 'margin-top: 8px; display: inline-block;' : ''}">${platformName}</span>
  </a>
</div>
`;
      const emailHeaderText = `
${platformName}
${siteUrl}
---
`;
      renderedHtml = emailHeaderHtml + renderedHtml;
      renderedText = emailHeaderText + renderedText;

      // Footer: site name + link
      const emailFooterHtml = `
<hr style="margin-top: 24px; border: none; border-top: 1px solid #eee;" />
<p style="margin-top: 16px; font-size: 12px; color: #666; text-align: center;">
  Este email foi enviado por <a href="${siteUrl}" style="color: #007bff; text-decoration: none;">${platformName}</a> · <a href="${siteUrl}" style="color: #007bff; text-decoration: none;">${siteUrl}</a>
</p>
`;
      const emailFooterText = `

---
Este email foi enviado por ${platformName}.
Acesse: ${siteUrl}
`;
      renderedHtml = renderedHtml + emailFooterHtml;
      renderedText = renderedText + emailFooterText;
    }

    // Send based on type
    switch (notificationType) {
      case 'email':
        if (!options.recipient.email) {
          console.error('❌ Email não fornecido para envio');
          return false;
        }
        return await sendEmail({
          to: options.recipient.email,
          subject: renderedSubject,
          html: renderedHtml,
          text: renderedText,
        });

      case 'sms':
        if (!options.recipient.phone) {
          console.error('❌ Telefone não fornecido para envio');
          return false;
        }
        return await sendSMS(options.recipient.phone, renderedText || renderedHtml.replace(/<[^>]*>/g, ''));

      case 'push':
        if (!options.recipient.userId) {
          console.error('❌ UserId não fornecido para push notification');
          return false;
        }
        return await sendPushNotification(options.recipient.userId, renderedSubject, renderedText || renderedHtml.replace(/<[^>]*>/g, ''));

      case 'in_app':
        if (!options.recipient.userId) {
          console.error('❌ UserId não fornecido para notificação in-app');
          return false;
        }
        return await sendInAppNotification(options.recipient.userId, renderedSubject, renderedText || renderedHtml.replace(/<[^>]*>/g, ''));

      default:
        console.error(`❌ Tipo de notificação não suportado: ${notificationType}`);
        return false;
    }
  } catch (error: any) {
    console.error('❌ Erro ao enviar notificação:', error);
    return false;
  }
};

