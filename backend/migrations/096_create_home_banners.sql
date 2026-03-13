-- ============================================
-- Migration 096: Banners da Home (slider/carrossel)
-- Tabela home_banners para gestão de banners exibidos na página inicial
-- Plano: PLANO_BANNERS_HOME.md – Etapa 1
-- ============================================

CREATE TABLE IF NOT EXISTS public.home_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title VARCHAR(500) NULL,
  link_url TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.home_banners IS 'Banners/slides exibidos na home do site. Ordenados por display_order; apenas is_active = true aparecem no slider.';
COMMENT ON COLUMN public.home_banners.image_url IS 'URL da imagem do banner (obrigatório).';
COMMENT ON COLUMN public.home_banners.title IS 'Título ou legenda opcional do banner.';
COMMENT ON COLUMN public.home_banners.link_url IS 'URL de destino ao clicar no banner (opcional).';
COMMENT ON COLUMN public.home_banners.is_active IS 'Se true, o banner é exibido na home; se false, fica oculto sem excluir.';
COMMENT ON COLUMN public.home_banners.display_order IS 'Ordem de exibição no slider (menor valor = primeiro).';

-- Trigger para atualizar updated_at
CREATE TRIGGER update_home_banners_updated_at
  BEFORE UPDATE ON public.home_banners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para listagem ativa ordenada e listagem admin
CREATE INDEX IF NOT EXISTS idx_home_banners_active_order
  ON public.home_banners(is_active, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_home_banners_display_order
  ON public.home_banners(display_order);
