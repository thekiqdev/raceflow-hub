-- ============================================
-- Migration 056: Create notification_templates table
-- Cria a tabela para armazenar modelos de notificações (emails, SMS, push, in-app)
-- ============================================

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('email', 'sms', 'push', 'in_app')),
  target_audience TEXT NOT NULL CHECK (target_audience IN ('admin', 'organizer', 'runner', 'all')),
  subject TEXT, -- Assunto do email (se aplicável)
  body_html TEXT, -- Corpo HTML do template
  body_text TEXT, -- Corpo texto simples (fallback)
  variables JSONB DEFAULT '{}'::jsonb, -- Variáveis disponíveis no template
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- Templates do sistema não podem ser deletados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_notification_templates_template_key ON notification_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_notification_templates_target_audience ON notification_templates(target_audience);
CREATE INDEX IF NOT EXISTS idx_notification_templates_template_type ON notification_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active ON notification_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_system ON notification_templates(is_system);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_templates_updated_at();

-- Comentários
COMMENT ON TABLE notification_templates IS 'Tabela para armazenar modelos de notificações (emails, SMS, push, in-app)';
COMMENT ON COLUMN notification_templates.template_key IS 'Chave única do template (ex: registration_confirmed, payment_received)';
COMMENT ON COLUMN notification_templates.template_name IS 'Nome amigável do template para exibição';
COMMENT ON COLUMN notification_templates.template_type IS 'Tipo de notificação: email, sms, push, in_app';
COMMENT ON COLUMN notification_templates.target_audience IS 'Público-alvo: admin, organizer, runner, all';
COMMENT ON COLUMN notification_templates.subject IS 'Assunto do email (aplicável apenas para tipo email)';
COMMENT ON COLUMN notification_templates.body_html IS 'Corpo HTML do template com variáveis {{variavel}}';
COMMENT ON COLUMN notification_templates.body_text IS 'Corpo texto simples (fallback para clientes que não suportam HTML)';
COMMENT ON COLUMN notification_templates.variables IS 'JSON com descrição das variáveis disponíveis no template';
COMMENT ON COLUMN notification_templates.is_active IS 'Se o template está ativo e pode ser usado';
COMMENT ON COLUMN notification_templates.is_system IS 'Se é um template do sistema (não pode ser deletado)';

