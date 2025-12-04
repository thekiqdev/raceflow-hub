-- ============================================
-- Add variant_attributes to kit_products
-- ============================================
-- This field stores the attribute names and order as JSON
-- Format: ["Cor", "Tamanho", "Material"]

ALTER TABLE public.kit_products
ADD COLUMN IF NOT EXISTS variant_attributes JSONB;

-- Add comment to explain the field
COMMENT ON COLUMN public.kit_products.variant_attributes IS 'Array of attribute names in order (ex: ["Cor", "Tamanho"])';

