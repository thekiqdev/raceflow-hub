-- ============================================
-- Migration 008: System Settings Table
-- Tabela para configurações globais do sistema
-- ============================================

-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', -- Fixed UUID for single row
  platform_name TEXT DEFAULT 'RaceFlow',
  platform_logo_url TEXT,
  platform_favicon_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  support_email TEXT,
  support_phone TEXT,
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  company_country TEXT DEFAULT 'Brasil',
  
  -- Email settings
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_from_email TEXT,
  smtp_from_name TEXT,
  smtp_secure BOOLEAN DEFAULT true,
  
  -- Payment settings
  payment_gateway TEXT DEFAULT 'stripe',
  payment_test_mode BOOLEAN DEFAULT true,
  payment_public_key TEXT,
  payment_secret_key TEXT,
  
  -- Module settings (JSONB for flexibility)
  enabled_modules JSONB DEFAULT '{"notifications": true, "analytics": true, "reports": true}'::jsonb,
  
  -- Maintenance mode
  maintenance_mode BOOLEAN DEFAULT false,
  maintenance_message TEXT,
  
  -- Other settings
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  time_format TEXT DEFAULT 'HH:mm',
  currency TEXT DEFAULT 'BRL',
  language TEXT DEFAULT 'pt-BR',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO system_settings (
  id,
  platform_name,
  contact_email,
  support_email,
  company_country,
  timezone,
  date_format,
  time_format,
  currency,
  language
)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'RaceFlow',
  'contato@raceflow.com',
  'suporte@raceflow.com',
  'Brasil',
  'America/Sao_Paulo',
  'DD/MM/YYYY',
  'HH:mm',
  'BRL',
  'pt-BR'
)
ON CONFLICT (id) DO NOTHING;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();

-- Comentários para documentação
COMMENT ON TABLE system_settings IS 'Configurações globais do sistema';
COMMENT ON COLUMN system_settings.enabled_modules IS 'Módulos habilitados no sistema (JSON)';




