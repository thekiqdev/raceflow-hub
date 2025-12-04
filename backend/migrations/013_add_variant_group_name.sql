-- ============================================
-- Add variant_group_name to product_variants
-- ============================================
-- This field allows grouping variants by type (Tamanho, Cor, Modelo, etc.)

ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS variant_group_name TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN public.product_variants.variant_group_name IS 'Nome do grupo de variação (ex: Tamanho, Cor, Modelo)';

