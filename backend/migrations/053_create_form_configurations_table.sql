-- ============================================
-- Migration 053: Create form_configurations table
-- Cria a tabela para armazenar configurações dos formulários (orçamento e contato)
-- ============================================

CREATE TABLE IF NOT EXISTS form_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL CHECK (form_type IN ('quote', 'contact')),
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'email', 'tel', 'textarea', 'select', 'date', 'number')),
  field_placeholder TEXT,
  field_required BOOLEAN DEFAULT true,
  field_order INTEGER NOT NULL DEFAULT 0,
  field_options JSONB, -- Para campos select, armazena as opções
  field_validation JSONB, -- Regras de validação (min, max, pattern, etc)
  field_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(form_type, field_key)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_form_configurations_form_type ON form_configurations(form_type);
CREATE INDEX IF NOT EXISTS idx_form_configurations_field_order ON form_configurations(form_type, field_order);
CREATE INDEX IF NOT EXISTS idx_form_configurations_field_enabled ON form_configurations(form_type, field_enabled);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_form_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_form_configurations_updated_at
  BEFORE UPDATE ON form_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_form_configurations_updated_at();

-- Comentários
COMMENT ON TABLE form_configurations IS 'Configurações dos campos dos formulários de orçamento e contato';
COMMENT ON COLUMN form_configurations.form_type IS 'Tipo de formulário: quote (orçamento) ou contact (contato)';
COMMENT ON COLUMN form_configurations.field_key IS 'Chave única do campo (ex: fullName, email, etc)';
COMMENT ON COLUMN form_configurations.field_options IS 'Opções para campos select (JSON array)';
COMMENT ON COLUMN form_configurations.field_validation IS 'Regras de validação (JSON: min, max, pattern, etc)';

