-- ============================================
-- Migration 091: Taxa mínima da plataforma (inscrição)
-- Quando a taxa é percentual, aplica no mínimo este valor (R$) se o percentual for menor.
-- ============================================

ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS platform_fee_min DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN public.system_settings.platform_fee_min IS 'Taxa mínima (R$) aplicada na inscrição quando o tipo é percentual. Se o % sobre o valor for menor que este valor, usa este mínimo.';
