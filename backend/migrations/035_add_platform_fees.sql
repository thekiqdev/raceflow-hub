-- ============================================
-- Migration 035: Add platform fees to system_settings
-- Adiciona campos para configuração de taxas da plataforma
-- ============================================

-- Adicionar campos de taxas da plataforma
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS platform_fee_type VARCHAR(20) DEFAULT 'fixed' CHECK (platform_fee_type IN ('fixed', 'percentage'));

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS withdrawal_fee DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS withdrawal_fee_type VARCHAR(20) DEFAULT 'fixed' CHECK (withdrawal_fee_type IN ('fixed', 'percentage'));

-- Comentários nas colunas
COMMENT ON COLUMN public.system_settings.platform_fee IS 'Taxa da plataforma cobrada dos corredores (valor fixo ou percentual)';
COMMENT ON COLUMN public.system_settings.platform_fee_type IS 'Tipo da taxa da plataforma: fixed (valor fixo) ou percentage (percentual)';
COMMENT ON COLUMN public.system_settings.withdrawal_fee IS 'Taxa de saque cobrada dos organizadores ao realizar saques';
COMMENT ON COLUMN public.system_settings.withdrawal_fee_type IS 'Tipo da taxa de saque: fixed (valor fixo) ou percentage (percentual)';

