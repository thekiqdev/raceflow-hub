-- ============================================
-- Add available_quantity to product_variants
-- ============================================
-- This field stores the available quantity for each variant

ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.product_variants.available_quantity IS 'Quantidade disponível desta variação (NULL = ilimitado)';

