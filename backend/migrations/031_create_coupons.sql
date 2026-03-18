-- ============================================
-- Migration 031: Create Coupons System
-- Cria sistema de cupons de desconto para organizadores
-- ============================================

-- Criar tabela coupons (Cupons de Desconto)
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    expiration_date TIMESTAMP WITH TIME ZONE NULL,
    max_uses INTEGER NULL, -- NULL = uso infinito
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_coupons_organizer FOREIGN KEY (organizer_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT uq_coupons_code_organizer UNIQUE (code, organizer_id),
    CONSTRAINT chk_discount_value CHECK (discount_value > 0),
    CONSTRAINT chk_max_uses CHECK (max_uses IS NULL OR max_uses > 0),
    CONSTRAINT chk_current_uses CHECK (current_uses >= 0)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_coupons_organizer_id ON public.coupons(organizer_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON public.coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_expiration_date ON public.coupons(expiration_date);

-- Comentários nas colunas
COMMENT ON TABLE public.coupons IS 'Tabela de cupons de desconto criados por organizadores';
COMMENT ON COLUMN public.coupons.organizer_id IS 'ID do organizador que criou o cupom';
COMMENT ON COLUMN public.coupons.code IS 'Código único do cupom (único por organizador)';
COMMENT ON COLUMN public.coupons.name IS 'Nome descritivo do cupom';
COMMENT ON COLUMN public.coupons.type IS 'Tipo de desconto: percentage (porcentagem) ou fixed (valor fixo)';
COMMENT ON COLUMN public.coupons.discount_value IS 'Valor do desconto (percentual ou valor fixo)';
COMMENT ON COLUMN public.coupons.expiration_date IS 'Data de expiração do cupom (NULL = sem expiração)';
COMMENT ON COLUMN public.coupons.max_uses IS 'Quantidade máxima de uso (NULL = uso infinito)';
COMMENT ON COLUMN public.coupons.current_uses IS 'Quantidade atual de uso do cupom';
COMMENT ON COLUMN public.coupons.is_active IS 'Indica se o cupom está ativo ou não';

