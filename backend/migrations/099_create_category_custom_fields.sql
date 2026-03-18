-- ============================================
-- Migration 099: Campos personalizados por categoria
-- Tabelas para definição de campos por categoria e valores na inscrição
-- Plano: PLANO_CAMPOS_PERSONALIZADOS_CATEGORIA.md – Etapa 1
-- ============================================

-- 1. Tabela de definição dos campos (por categoria)
CREATE TABLE IF NOT EXISTS public.category_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL,
  label VARCHAR(255) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_category_custom_fields_category
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT chk_category_custom_fields_field_type
    CHECK (field_type IN ('text', 'number'))
);

COMMENT ON TABLE public.category_custom_fields IS 'Campos personalizados configurados por categoria (ex.: número da camisa). Exibidos na inscrição quando o corredor escolhe a categoria.';
COMMENT ON COLUMN public.category_custom_fields.category_id IS 'Categoria a que o campo pertence.';
COMMENT ON COLUMN public.category_custom_fields.label IS 'Nome do campo exibido ao usuário (ex.: Número da camisa).';
COMMENT ON COLUMN public.category_custom_fields.field_type IS 'Tipo do campo: text ou number.';
COMMENT ON COLUMN public.category_custom_fields.display_order IS 'Ordem de exibição na tela (menor valor = primeiro).';

CREATE INDEX IF NOT EXISTS idx_category_custom_fields_category_id
  ON public.category_custom_fields(category_id);

-- Trigger updated_at
CREATE TRIGGER update_category_custom_fields_updated_at
  BEFORE UPDATE ON public.category_custom_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Tabela de valores na inscrição
CREATE TABLE IF NOT EXISTS public.registration_custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL,
  category_custom_field_id UUID NOT NULL,
  value TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_registration_custom_field_values_registration
    FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_custom_field_values_field
    FOREIGN KEY (category_custom_field_id) REFERENCES public.category_custom_fields(id) ON DELETE CASCADE,
  CONSTRAINT uq_registration_custom_field_values_reg_field
    UNIQUE (registration_id, category_custom_field_id)
);

COMMENT ON TABLE public.registration_custom_field_values IS 'Valores dos campos personalizados preenchidos na inscrição. Um valor por campo por inscrição.';
COMMENT ON COLUMN public.registration_custom_field_values.registration_id IS 'Inscrição.';
COMMENT ON COLUMN public.registration_custom_field_values.category_custom_field_id IS 'Campo da categoria.';
COMMENT ON COLUMN public.registration_custom_field_values.value IS 'Valor informado (texto ou número armazenado como texto).';

CREATE INDEX IF NOT EXISTS idx_registration_custom_field_values_registration_id
  ON public.registration_custom_field_values(registration_id);

CREATE INDEX IF NOT EXISTS idx_registration_custom_field_values_field_id
  ON public.registration_custom_field_values(category_custom_field_id);

-- Trigger updated_at
CREATE TRIGGER update_registration_custom_field_values_updated_at
  BEFORE UPDATE ON public.registration_custom_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
