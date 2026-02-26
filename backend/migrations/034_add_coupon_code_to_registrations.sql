-- ============================================
-- Migration 034: Add coupon_code to registrations
-- Adiciona campo coupon_code para rastrear qual cupom foi usado na inscrição
-- ============================================

-- Adicionar coluna coupon_code na tabela registrations
ALTER TABLE public.registrations 
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50) NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_registrations_coupon_code ON public.registrations(coupon_code);

-- Comentário na coluna
COMMENT ON COLUMN public.registrations.coupon_code IS 'Código do cupom de desconto aplicado nesta inscrição';

