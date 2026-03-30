-- Migration: Add route_image_url to modalities table
-- Description: Allows storing an optional route image URL for each modality

ALTER TABLE public.modalities
ADD COLUMN IF NOT EXISTS route_image_url TEXT NULL;

COMMENT ON COLUMN public.modalities.route_image_url IS 'URL da imagem do percurso da modalidade (opcional)';
