-- ============================================
-- Migration 074: Create registration_product_selections table
-- Armazena as seleções de produtos e variações feitas durante a inscrição
-- Permite rastrear quais atributos foram escolhidos em cada inscrição
-- ============================================

-- Criar tabela registration_product_selections
CREATE TABLE IF NOT EXISTS public.registration_product_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.kit_products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  attribute_name TEXT NOT NULL,
  attribute_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_registration_product_selections_registration 
    FOREIGN KEY (registration_id) 
    REFERENCES public.registrations(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_registration_product_selections_product 
    FOREIGN KEY (product_id) 
    REFERENCES public.kit_products(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_registration_product_selections_variant 
    FOREIGN KEY (variant_id) 
    REFERENCES public.product_variants(id) 
    ON DELETE SET NULL
);

-- Criar índices para melhorar performance das consultas
CREATE INDEX IF NOT EXISTS idx_registration_product_selections_registration_id 
  ON public.registration_product_selections(registration_id);

CREATE INDEX IF NOT EXISTS idx_registration_product_selections_product_id 
  ON public.registration_product_selections(product_id);

CREATE INDEX IF NOT EXISTS idx_registration_product_selections_variant_id 
  ON public.registration_product_selections(variant_id);

CREATE INDEX IF NOT EXISTS idx_registration_product_selections_attribute 
  ON public.registration_product_selections(attribute_name, attribute_value);

-- Comentários
COMMENT ON TABLE public.registration_product_selections IS 'Armazena as seleções de produtos e variações feitas durante a inscrição. Permite rastrear quais atributos foram escolhidos.';
COMMENT ON COLUMN public.registration_product_selections.registration_id IS 'ID da inscrição (referencia registrations.id)';
COMMENT ON COLUMN public.registration_product_selections.product_id IS 'ID do produto selecionado (referencia kit_products.id)';
COMMENT ON COLUMN public.registration_product_selections.variant_id IS 'ID da variação selecionada (referencia product_variants.id, pode ser NULL para produtos únicos)';
COMMENT ON COLUMN public.registration_product_selections.attribute_name IS 'Nome do atributo (ex: "Tamanho", "Cor")';
COMMENT ON COLUMN public.registration_product_selections.attribute_value IS 'Valor do atributo selecionado (ex: "P", "Azul")';

-- Log migration completion
DO $$
DECLARE
  registrations_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO registrations_count FROM public.registrations;
  
  RAISE NOTICE '✅ Migration 074 concluída:';
  RAISE NOTICE '   - Tabela registration_product_selections criada';
  RAISE NOTICE '   - Índices criados para otimização';
  RAISE NOTICE '   - Inscrições existentes: %', registrations_count;
  RAISE NOTICE '   - Inscrições antigas não terão seleções armazenadas (compatibilidade retroativa)';
END $$;
