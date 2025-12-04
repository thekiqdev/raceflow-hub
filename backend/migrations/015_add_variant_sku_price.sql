-- ============================================
-- Add sku and price to product_variants
-- ============================================
-- These fields allow storing SKU and price per variant

ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

-- Add comments to explain the fields
COMMENT ON COLUMN public.product_variants.sku IS 'SKU/Código de barras da variação';
COMMENT ON COLUMN public.product_variants.price IS 'Preço adicional da variação (NULL = usa preço do produto)';

