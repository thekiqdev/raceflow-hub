-- ============================================
-- Migration 097: Banner mobile (imagem específica para celular)
-- Coluna opcional para banner com proporção/tamanho diferente no mobile
-- ============================================

ALTER TABLE public.home_banners
ADD COLUMN IF NOT EXISTS image_url_mobile TEXT NULL;

COMMENT ON COLUMN public.home_banners.image_url_mobile IS 'URL da imagem do banner para exibição em mobile (opcional). Se null, usa image_url na home.';
