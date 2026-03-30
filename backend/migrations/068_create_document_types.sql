-- Migration 068: Create document_types table for configurable document types
-- This allows admins to create and manage document types that runners can upload

CREATE TABLE IF NOT EXISTS public.document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE, -- Unique code identifier (e.g., 'militar', 'estudante', 'rg')
  name VARCHAR(100) NOT NULL, -- Display name (e.g., 'Carteira de Reservista', 'RG')
  description TEXT, -- Optional description
  requires_expiry_date BOOLEAN NOT NULL DEFAULT false, -- Whether this document type requires an expiry date
  is_active BOOLEAN NOT NULL DEFAULT true, -- Whether this type is currently available
  display_order INTEGER NOT NULL DEFAULT 0, -- Order for display in UI
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for active types
CREATE INDEX IF NOT EXISTS idx_document_types_is_active ON public.document_types(is_active);
CREATE INDEX IF NOT EXISTS idx_document_types_display_order ON public.document_types(display_order);

-- Insert default document types (migrating from hardcoded enum)
INSERT INTO public.document_types (code, name, description, requires_expiry_date, display_order) VALUES
  ('militar', 'Carteira de Reservista/Militar', 'Documento de identificação militar ou reservista', false, 1),
  ('estudante', 'Carteirinha de Estudante', 'Documento que comprova vínculo estudantil', true, 2),
  ('pcd', 'Documento de Pessoa com Deficiência', 'Documento que comprova condição de PCD', true, 3),
  ('rg', 'RG (Registro Geral)', 'Documento de identidade', false, 4),
  ('cpf', 'CPF', 'Cadastro de Pessoa Física', false, 5),
  ('atestado_medico', 'Atestado Médico', 'Documento médico para participação em eventos', true, 6),
  ('comprovante_residencia', 'Comprovante de Residência', 'Documento que comprova endereço residencial', false, 7),
  ('outro', 'Outro', 'Outro tipo de documento não listado', false, 8)
ON CONFLICT (code) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.document_types IS 'Tipos de documentos configuráveis que podem ser enviados pelos runners';
COMMENT ON COLUMN public.document_types.code IS 'Código único identificador do tipo de documento';
COMMENT ON COLUMN public.document_types.name IS 'Nome de exibição do tipo de documento';
COMMENT ON COLUMN public.document_types.description IS 'Descrição opcional do tipo de documento';
COMMENT ON COLUMN public.document_types.requires_expiry_date IS 'Se true, este tipo de documento requer data de validade';
COMMENT ON COLUMN public.document_types.is_active IS 'Se true, este tipo está disponível para uso';
COMMENT ON COLUMN public.document_types.display_order IS 'Ordem de exibição na interface';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_document_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_document_types_updated_at
  BEFORE UPDATE ON public.document_types
  FOR EACH ROW
  EXECUTE FUNCTION update_document_types_updated_at();

-- Log migration completion
DO $$
DECLARE
  types_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO types_count FROM public.document_types;
  RAISE NOTICE '✅ Migration 068 concluída:';
  RAISE NOTICE '   - Tabela document_types criada';
  RAISE NOTICE '   - Índices criados';
  RAISE NOTICE '   - Tipos padrão inseridos';
  RAISE NOTICE '   - Trigger de updated_at configurado';
  RAISE NOTICE '   - Tipos de documentos existentes: %', types_count;
END $$;
