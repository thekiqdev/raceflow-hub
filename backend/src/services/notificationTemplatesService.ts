import { query } from '../config/database.js';

export interface NotificationTemplate {
  id: string;
  template_key: string;
  template_name: string;
  template_type: 'email' | 'sms' | 'push' | 'in_app';
  target_audience: 'admin' | 'organizer' | 'runner' | 'all';
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  variables: Record<string, any>;
  is_active: boolean;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNotificationTemplateData {
  template_key: string;
  template_name: string;
  template_type: 'email' | 'sms' | 'push' | 'in_app';
  target_audience: 'admin' | 'organizer' | 'runner' | 'all';
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  variables?: Record<string, any>;
  is_active?: boolean;
  is_system?: boolean;
}

export interface UpdateNotificationTemplateData {
  template_name?: string;
  template_type?: 'email' | 'sms' | 'push' | 'in_app';
  target_audience?: 'admin' | 'organizer' | 'runner' | 'all';
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  variables?: Record<string, any>;
  is_active?: boolean;
}

/**
 * Get all notification templates with optional filters
 */
export const getNotificationTemplates = async (filters?: {
  template_type?: 'email' | 'sms' | 'push' | 'in_app';
  target_audience?: 'admin' | 'organizer' | 'runner' | 'all';
  is_active?: boolean;
}): Promise<NotificationTemplate[]> => {
  let sql = 'SELECT * FROM notification_templates WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  if (filters?.template_type) {
    sql += ` AND template_type = $${paramCount++}`;
    params.push(filters.template_type);
  }

  if (filters?.target_audience) {
    sql += ` AND target_audience = $${paramCount++}`;
    params.push(filters.target_audience);
  }

  if (filters?.is_active !== undefined) {
    sql += ` AND is_active = $${paramCount++}`;
    params.push(filters.is_active);
  }

  sql += ' ORDER BY template_name ASC, created_at DESC';

  const result = await query(sql, params);

  return result.rows.map((row) => ({
    id: row.id,
    template_key: row.template_key,
    template_name: row.template_name,
    template_type: row.template_type,
    target_audience: row.target_audience,
    subject: row.subject,
    body_html: row.body_html,
    body_text: row.body_text,
    variables: row.variables || {},
    is_active: row.is_active,
    is_system: row.is_system,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Get notification template by ID
 */
export const getNotificationTemplateById = async (id: string): Promise<NotificationTemplate | null> => {
  const result = await query('SELECT * FROM notification_templates WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    template_key: row.template_key,
    template_name: row.template_name,
    template_type: row.template_type,
    target_audience: row.target_audience,
    subject: row.subject,
    body_html: row.body_html,
    body_text: row.body_text,
    variables: row.variables || {},
    is_active: row.is_active,
    is_system: row.is_system,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Get notification template by key
 */
export const getNotificationTemplateByKey = async (templateKey: string): Promise<NotificationTemplate | null> => {
  const result = await query('SELECT * FROM notification_templates WHERE template_key = $1', [templateKey]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    template_key: row.template_key,
    template_name: row.template_name,
    template_type: row.template_type,
    target_audience: row.target_audience,
    subject: row.subject,
    body_html: row.body_html,
    body_text: row.body_text,
    variables: row.variables || {},
    is_active: row.is_active,
    is_system: row.is_system,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Create a new notification template
 */
export const createNotificationTemplate = async (data: CreateNotificationTemplateData): Promise<NotificationTemplate> => {
  const result = await query(
    `INSERT INTO notification_templates (
      template_key, template_name, template_type, target_audience,
      subject, body_html, body_text, variables, is_active, is_system
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      data.template_key,
      data.template_name,
      data.template_type,
      data.target_audience,
      data.subject || null,
      data.body_html || null,
      data.body_text || null,
      JSON.stringify(data.variables || {}),
      data.is_active !== undefined ? data.is_active : true,
      data.is_system !== undefined ? data.is_system : false,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    template_key: row.template_key,
    template_name: row.template_name,
    template_type: row.template_type,
    target_audience: row.target_audience,
    subject: row.subject,
    body_html: row.body_html,
    body_text: row.body_text,
    variables: row.variables || {},
    is_active: row.is_active,
    is_system: row.is_system,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Update notification template
 */
export const updateNotificationTemplate = async (
  id: string,
  data: UpdateNotificationTemplateData
): Promise<NotificationTemplate> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.template_name !== undefined) {
    updates.push(`template_name = $${paramCount++}`);
    values.push(data.template_name);
  }

  if (data.template_type !== undefined) {
    updates.push(`template_type = $${paramCount++}`);
    values.push(data.template_type);
  }

  if (data.target_audience !== undefined) {
    updates.push(`target_audience = $${paramCount++}`);
    values.push(data.target_audience);
  }

  if (data.subject !== undefined) {
    updates.push(`subject = $${paramCount++}`);
    values.push(data.subject);
  }

  if (data.body_html !== undefined) {
    updates.push(`body_html = $${paramCount++}`);
    values.push(data.body_html);
  }

  if (data.body_text !== undefined) {
    updates.push(`body_text = $${paramCount++}`);
    values.push(data.body_text);
  }

  if (data.variables !== undefined) {
    updates.push(`variables = $${paramCount++}`);
    values.push(JSON.stringify(data.variables));
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.is_active);
  }

  if (updates.length === 0) {
    // No updates, return existing template
    const existing = await getNotificationTemplateById(id);
    if (!existing) {
      throw new Error('Template not found');
    }
    return existing;
  }

  values.push(id);
  const sql = `UPDATE notification_templates SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

  const result = await query(sql, values);

  if (result.rows.length === 0) {
    throw new Error('Template not found');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    template_key: row.template_key,
    template_name: row.template_name,
    template_type: row.template_type,
    target_audience: row.target_audience,
    subject: row.subject,
    body_html: row.body_html,
    body_text: row.body_text,
    variables: row.variables || {},
    is_active: row.is_active,
    is_system: row.is_system,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Delete notification template
 */
export const deleteNotificationTemplate = async (id: string): Promise<void> => {
  // Check if it's a system template
  const template = await getNotificationTemplateById(id);
  if (!template) {
    throw new Error('Template not found');
  }

  if (template.is_system) {
    throw new Error('Cannot delete system templates');
  }

  await query('DELETE FROM notification_templates WHERE id = $1', [id]);
};

/**
 * Initialize default notification templates
 */
export const initializeDefaultTemplates = async (): Promise<void> => {
  // Get existing template keys to avoid duplicates
  const existingResult = await query('SELECT template_key FROM notification_templates WHERE is_system = true', []);
  const existingKeys = new Set(existingResult.rows.map(row => row.template_key));

  const defaultTemplates: CreateNotificationTemplateData[] = [
    // Registration templates
    {
      template_key: 'registration_confirmed',
      template_name: 'Inscrição Confirmada',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Inscrição Confirmada - {{eventTitle}}',
      body_html: '<h1>Inscrição Confirmada!</h1><p>Olá {{userName}},</p><p>Sua inscrição no evento <strong>{{eventTitle}}</strong> foi confirmada com sucesso!</p><p><strong>Código da Inscrição:</strong> {{registrationCode}}</p><p><strong>Data do Evento:</strong> {{eventDate}}</p><p><strong>Local:</strong> {{eventLocation}}</p><p>Obrigado por participar!</p>',
      body_text: 'Inscrição Confirmada!\n\nOlá {{userName}},\n\nSua inscrição no evento {{eventTitle}} foi confirmada com sucesso!\n\nCódigo da Inscrição: {{registrationCode}}\nData do Evento: {{eventDate}}\nLocal: {{eventLocation}}\n\nObrigado por participar!',
      variables: {
        userName: 'Nome do usuário',
        eventTitle: 'Título do evento',
        registrationCode: 'Código da inscrição',
        eventDate: 'Data do evento',
        eventLocation: 'Local do evento',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'registration_pending',
      template_name: 'Inscrição Pendente',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Inscrição Pendente - {{eventTitle}}',
      body_html: '<h1>Inscrição Pendente</h1><p>Olá {{userName}},</p><p>Sua inscrição no evento <strong>{{eventTitle}}</strong> está pendente de pagamento.</p><p>Por favor, complete o pagamento para confirmar sua participação.</p>',
      body_text: 'Inscrição Pendente\n\nOlá {{userName}},\n\nSua inscrição no evento {{eventTitle}} está pendente de pagamento.\n\nPor favor, complete o pagamento para confirmar sua participação.',
      variables: {
        userName: 'Nome do usuário',
        eventTitle: 'Título do evento',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'new_registration',
      template_name: 'Nova Inscrição Recebida',
      template_type: 'email',
      target_audience: 'organizer',
      subject: 'Nova Inscrição - {{eventTitle}}',
      body_html: '<h1>Nova Inscrição Recebida</h1><p>Olá {{organizerName}},</p><p>Uma nova inscrição foi recebida para o evento <strong>{{eventTitle}}</strong>.</p><p><strong>Atleta:</strong> {{athleteName}}</p><p><strong>Código:</strong> {{registrationCode}}</p>',
      body_text: 'Nova Inscrição Recebida\n\nOlá {{organizerName}},\n\nUma nova inscrição foi recebida para o evento {{eventTitle}}.\n\nAtleta: {{athleteName}}\nCódigo: {{registrationCode}}',
      variables: {
        organizerName: 'Nome do organizador',
        eventTitle: 'Título do evento',
        athleteName: 'Nome do atleta',
        registrationCode: 'Código da inscrição',
      },
      is_active: true,
      is_system: true,
    },
    // Payment templates
    {
      template_key: 'payment_received',
      template_name: 'Pagamento Recebido',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Pagamento Recebido - {{eventTitle}}',
      body_html: '<h1>Pagamento Recebido!</h1><p>Olá {{userName}},</p><p>Seu pagamento de <strong>{{amount}}</strong> para o evento <strong>{{eventTitle}}</strong> foi recebido com sucesso.</p><p><strong>Método:</strong> {{paymentMethod}}</p>',
      body_text: 'Pagamento Recebido!\n\nOlá {{userName}},\n\nSeu pagamento de {{amount}} para o evento {{eventTitle}} foi recebido com sucesso.\n\nMétodo: {{paymentMethod}}',
      variables: {
        userName: 'Nome do usuário',
        amount: 'Valor pago',
        eventTitle: 'Título do evento',
        paymentMethod: 'Método de pagamento',
      },
      is_active: true,
      is_system: true,
    },
    // Transfer templates
    {
      template_key: 'transfer_approved',
      template_name: 'Transferência Aprovada',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Transferência Aprovada - {{eventTitle}}',
      body_html: '<h1>Transferência Aprovada</h1><p>Olá {{userName}},</p><p>Sua transferência de inscrição para o evento <strong>{{eventTitle}}</strong> foi aprovada.</p><p><strong>Novo Titular:</strong> {{newRunnerName}}</p>',
      body_text: 'Transferência Aprovada\n\nOlá {{userName}},\n\nSua transferência de inscrição para o evento {{eventTitle}} foi aprovada.\n\nNovo Titular: {{newRunnerName}}',
      variables: {
        userName: 'Nome do usuário',
        eventTitle: 'Título do evento',
        newRunnerName: 'Nome do novo titular',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'registration_transferred',
      template_name: 'Inscrição Transferida',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Inscrição Transferida - {{eventTitle}}',
      body_html: '<h1>Inscrição Transferida com Sucesso</h1><p>Olá {{userName}},</p><p>Sua inscrição no evento <strong>{{eventTitle}}</strong> foi transferida com sucesso.</p><p><strong>Código da Inscrição:</strong> {{registrationCode}}</p><p><strong>Novo Titular:</strong> {{newRunnerName}}</p><p><strong>Data do Evento:</strong> {{eventDate}}</p><p><strong>Local:</strong> {{eventLocation}}</p><p>A inscrição agora pertence a {{newRunnerName}} e você não terá mais acesso a ela.</p>',
      body_text: 'Inscrição Transferida com Sucesso\n\nOlá {{userName}},\n\nSua inscrição no evento {{eventTitle}} foi transferida com sucesso.\n\nCódigo da Inscrição: {{registrationCode}}\nNovo Titular: {{newRunnerName}}\nData do Evento: {{eventDate}}\nLocal: {{eventLocation}}\n\nA inscrição agora pertence a {{newRunnerName}} e você não terá mais acesso a ela.',
      variables: {
        userName: 'Nome do usuário que transferiu',
        eventTitle: 'Título do evento',
        registrationCode: 'Código da inscrição',
        newRunnerName: 'Nome do novo titular',
        eventDate: 'Data do evento',
        eventLocation: 'Local do evento',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'registration_received',
      template_name: 'Inscrição Recebida por Transferência',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Você Recebeu uma Inscrição - {{eventTitle}}',
      body_html: '<h1>Inscrição Recebida por Transferência</h1><p>Olá {{userName}},</p><p>Você recebeu uma inscrição transferida para o evento <strong>{{eventTitle}}</strong>.</p><p><strong>Código da Inscrição:</strong> {{registrationCode}}</p><p><strong>Transferida por:</strong> {{oldRunnerName}}</p><p><strong>Data do Evento:</strong> {{eventDate}}</p><p><strong>Local:</strong> {{eventLocation}}</p><p>A inscrição foi confirmada e está ativa em sua conta. Você pode visualizá-la em "Minhas Inscrições".</p>',
      body_text: 'Inscrição Recebida por Transferência\n\nOlá {{userName}},\n\nVocê recebeu uma inscrição transferida para o evento {{eventTitle}}.\n\nCódigo da Inscrição: {{registrationCode}}\nTransferida por: {{oldRunnerName}}\nData do Evento: {{eventDate}}\nLocal: {{eventLocation}}\n\nA inscrição foi confirmada e está ativa em sua conta. Você pode visualizá-la em "Minhas Inscrições".',
      variables: {
        userName: 'Nome do usuário que recebeu',
        eventTitle: 'Título do evento',
        registrationCode: 'Código da inscrição',
        oldRunnerName: 'Nome de quem transferiu',
        eventDate: 'Data do evento',
        eventLocation: 'Local do evento',
      },
      is_active: true,
      is_system: true,
    },
    // Invitation templates
    {
      template_key: 'invitation_received',
      template_name: 'Convite Recebido do Líder',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Você Recebeu um Convite - {{eventTitle}}',
      body_html: '<h1>Convite Recebido!</h1><p>Olá {{userName}},</p><p>Você recebeu um convite do líder de grupo <strong>{{leaderName}}</strong> para participar do evento <strong>{{eventTitle}}</strong>.</p><p><strong>Data do Evento:</strong> {{eventDate}}</p><p><strong>Local:</strong> {{eventLocation}}</p><p>Sua inscrição foi confirmada automaticamente e você pode visualizá-la em "Minhas Inscrições".</p><p>Este é um convite gratuito oferecido pelo líder de grupo.</p>',
      body_text: 'Convite Recebido!\n\nOlá {{userName}},\n\nVocê recebeu um convite do líder de grupo {{leaderName}} para participar do evento {{eventTitle}}.\n\nData do Evento: {{eventDate}}\nLocal: {{eventLocation}}\n\nSua inscrição foi confirmada automaticamente e você pode visualizá-la em "Minhas Inscrições".\n\nEste é um convite gratuito oferecido pelo líder de grupo.',
      variables: {
        userName: 'Nome do runner',
        leaderName: 'Nome do líder de grupo',
        eventTitle: 'Título do evento',
        eventDate: 'Data do evento',
        eventLocation: 'Local do evento',
      },
      is_active: true,
      is_system: true,
    },
    // Admin templates
    {
      template_key: 'new_quote_received',
      template_name: 'Novo Orçamento Recebido',
      template_type: 'email',
      target_audience: 'admin',
      subject: 'Novo Orçamento Recebido',
      body_html: '<h1>Novo Orçamento Recebido</h1><p>Um novo orçamento foi recebido no sistema.</p><p><strong>Nome:</strong> {{quoteName}}</p><p><strong>Email:</strong> {{quoteEmail}}</p><p><strong>Local:</strong> {{quoteLocation}}</p>',
      body_text: 'Novo Orçamento Recebido\n\nUm novo orçamento foi recebido no sistema.\n\nNome: {{quoteName}}\nEmail: {{quoteEmail}}\nLocal: {{quoteLocation}}',
      variables: {
        quoteName: 'Nome do solicitante',
        quoteEmail: 'Email do solicitante',
        quoteLocation: 'Local do evento',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'new_contact_message_platform',
      template_name: 'Nova Mensagem de Contato - Plataforma',
      template_type: 'email',
      target_audience: 'admin',
      subject: 'Nova Mensagem de Contato - {{subject}}',
      body_html: '<h1>Nova Mensagem de Contato</h1><p>Uma nova mensagem de contato sobre a plataforma foi recebida.</p><p><strong>Nome:</strong> {{senderName}}</p><p><strong>Email:</strong> {{senderEmail}}</p><p><strong>Telefone:</strong> {{senderPhone}}</p><p><strong>Assunto:</strong> {{subject}}</p><p><strong>Mensagem:</strong></p><p>{{message}}</p>',
      body_text: 'Nova Mensagem de Contato\n\nUma nova mensagem de contato sobre a plataforma foi recebida.\n\nNome: {{senderName}}\nEmail: {{senderEmail}}\nTelefone: {{senderPhone}}\nAssunto: {{subject}}\n\nMensagem:\n{{message}}',
      variables: {
        senderName: 'Nome do remetente',
        senderEmail: 'Email do remetente',
        senderPhone: 'Telefone do remetente',
        subject: 'Assunto da mensagem',
        message: 'Conteúdo da mensagem',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'new_contact_message_event',
      template_name: 'Nova Mensagem de Contato - Evento',
      template_type: 'email',
      target_audience: 'organizer',
      subject: 'Nova Mensagem sobre {{eventTitle}} - {{subject}}',
      body_html: '<h1>Nova Mensagem de Contato</h1><p>Uma nova mensagem de contato sobre seu evento foi recebida.</p><p><strong>Evento:</strong> {{eventTitle}}</p><p><strong>Nome:</strong> {{senderName}}</p><p><strong>Email:</strong> {{senderEmail}}</p><p><strong>Telefone:</strong> {{senderPhone}}</p><p><strong>Assunto:</strong> {{subject}}</p><p><strong>Mensagem:</strong></p><p>{{message}}</p>',
      body_text: 'Nova Mensagem de Contato\n\nUma nova mensagem de contato sobre seu evento foi recebida.\n\nEvento: {{eventTitle}}\nNome: {{senderName}}\nEmail: {{senderEmail}}\nTelefone: {{senderPhone}}\nAssunto: {{subject}}\n\nMensagem:\n{{message}}',
      variables: {
        eventTitle: 'Título do evento',
        senderName: 'Nome do remetente',
        senderEmail: 'Email do remetente',
        senderPhone: 'Telefone do remetente',
        subject: 'Assunto da mensagem',
        message: 'Conteúdo da mensagem',
      },
      is_active: true,
      is_system: true,
    },
    // Password reset templates
    {
      template_key: 'password_reset_request',
      template_name: 'Solicitação de Recuperação de Senha',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Recuperação de Senha - Cronoteam',
      body_html: '<h1>Recuperação de Senha</h1><p>Olá {{userName}},</p><p>Você solicitou a recuperação de senha da sua conta.</p><p>Clique no link abaixo para redefinir sua senha:</p><p><a href="{{resetUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 4px; margin: 16px 0;">Redefinir Senha</a></p><p>Ou copie e cole o link abaixo no seu navegador:</p><p style="word-break: break-all; color: #666;">{{resetUrl}}</p><p><strong>Este link expira em {{expiresIn}}.</strong></p><p>Se você não solicitou esta recuperação de senha, ignore este e-mail.</p>',
      body_text: 'Recuperação de Senha\n\nOlá {{userName}},\n\nVocê solicitou a recuperação de senha da sua conta.\n\nClique no link abaixo para redefinir sua senha:\n{{resetUrl}}\n\nEste link expira em {{expiresIn}}.\n\nSe você não solicitou esta recuperação de senha, ignore este e-mail.',
      variables: {
        userName: 'Nome do usuário',
        resetUrl: 'URL para redefinir senha',
        expiresIn: 'Tempo de expiração do link (1 dia)',
      },
      is_active: true,
      is_system: true,
    },
    {
      template_key: 'password_reset_success',
      template_name: 'Senha Redefinida com Sucesso',
      template_type: 'email',
      target_audience: 'runner',
      subject: 'Senha Redefinida com Sucesso - Cronoteam',
      body_html: '<h1>Senha Redefinida com Sucesso</h1><p>Olá {{userName}},</p><p>Sua senha foi redefinida com sucesso!</p><p>Você já pode fazer login com sua nova senha.</p><p>Se você não realizou esta alteração, entre em contato conosco imediatamente.</p>',
      body_text: 'Senha Redefinida com Sucesso\n\nOlá {{userName}},\n\nSua senha foi redefinida com sucesso!\n\nVocê já pode fazer login com sua nova senha.\n\nSe você não realizou esta alteração, entre em contato conosco imediatamente.',
      variables: {
        userName: 'Nome do usuário',
      },
      is_active: true,
      is_system: true,
    },
  ];

  // Insert all default templates (only if they don't exist)
  for (const template of defaultTemplates) {
    // Skip if template already exists
    if (existingKeys.has(template.template_key)) {
      console.log(`ℹ️ Template ${template.template_key} já existe, pulando...`);
      continue;
    }
    
    try {
      await createNotificationTemplate(template);
      console.log(`✅ Template ${template.template_key} criado com sucesso`);
    } catch (error: any) {
      // Ignore duplicate key errors (template might already exist)
      if (!error.message?.includes('duplicate key')) {
        console.error(`❌ Erro ao criar template ${template.template_key}:`, error);
      }
    }
  }
};

