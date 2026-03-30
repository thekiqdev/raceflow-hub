-- ============================================
-- Migration 033: Create coupon_events relation table
-- Cria tabela de relacionamento many-to-many entre cupons e eventos
-- ============================================

-- Criar tabela coupon_events (Relacionamento Cupom-Evento)
CREATE TABLE IF NOT EXISTS public.coupon_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL,
    event_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_coupon_events_coupon FOREIGN KEY (coupon_id) 
        REFERENCES public.coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_events_event FOREIGN KEY (event_id) 
        REFERENCES public.events(id) ON DELETE CASCADE,
    CONSTRAINT uq_coupon_events UNIQUE (coupon_id, event_id)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_coupon_events_coupon_id ON public.coupon_events(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_events_event_id ON public.coupon_events(event_id);

-- Comentários
COMMENT ON TABLE public.coupon_events IS 'Tabela de relacionamento many-to-many entre cupons e eventos';
COMMENT ON COLUMN public.coupon_events.coupon_id IS 'ID do cupom';
COMMENT ON COLUMN public.coupon_events.event_id IS 'ID do evento';

-- Migrar dados existentes da coluna event_id para a nova tabela
-- (apenas se event_id não for NULL)
INSERT INTO public.coupon_events (coupon_id, event_id)
SELECT id, event_id
FROM public.coupons
WHERE event_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- A coluna event_id na tabela coupons pode ser mantida para compatibilidade
-- ou removida posteriormente se não for mais necessária

