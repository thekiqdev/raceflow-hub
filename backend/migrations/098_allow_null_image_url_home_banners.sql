-- ============================================
-- Migration 098: Permitir banner só desktop ou só mobile
-- image_url deixa de ser NOT NULL (pode ter só image_url_mobile)
-- ============================================

ALTER TABLE public.home_banners
ALTER COLUMN image_url DROP NOT NULL;

COMMENT ON COLUMN public.home_banners.image_url IS 'URL da imagem do banner para desktop. Se null, o banner só aparece em mobile (quando image_url_mobile estiver preenchido).';
