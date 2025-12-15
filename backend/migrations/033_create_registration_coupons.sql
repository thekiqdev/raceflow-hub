-- ============================================
-- Migration 033: Create registration_coupons table
-- Cria tabela para rastrear cupons aplicados em inscrições
-- ============================================

-- Criar tabela registration_coupons (Cupons Aplicados em Inscrições)
CREATE TABLE IF NOT EXISTS public.registration_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL,
    coupon_id UUID NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_registration_coupons_registration FOREIGN KEY (registration_id) 
        REFERENCES public.registrations(id) ON DELETE CASCADE,
    CONSTRAINT fk_registration_coupons_coupon FOREIGN KEY (coupon_id) 
        REFERENCES public.coupons(id) ON DELETE CASCADE,
    CONSTRAINT uq_registration_coupons UNIQUE (registration_id, coupon_id)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_registration_coupons_registration_id ON public.registration_coupons(registration_id);
CREATE INDEX IF NOT EXISTS idx_registration_coupons_coupon_id ON public.registration_coupons(coupon_id);

-- Comentários nas colunas
COMMENT ON TABLE public.registration_coupons IS 'Tabela que rastreia quais cupons foram aplicados em cada inscrição';
COMMENT ON COLUMN public.registration_coupons.registration_id IS 'ID da inscrição';
COMMENT ON COLUMN public.registration_coupons.coupon_id IS 'ID do cupom aplicado';
COMMENT ON COLUMN public.registration_coupons.discount_amount IS 'Valor do desconto aplicado (calculado no momento da aplicação)';

