-- ============================================
-- Migration 032: Add event_id to coupons
-- Adiciona campo event_id para associar cupons a eventos específicos
-- ============================================

-- Adicionar coluna event_id na tabela coupons
ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS event_id UUID NULL;

-- Adicionar foreign key constraint
ALTER TABLE public.coupons
ADD CONSTRAINT fk_coupons_event 
FOREIGN KEY (event_id) 
REFERENCES public.events(id) 
ON DELETE CASCADE;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_coupons_event_id ON public.coupons(event_id);

-- Comentário na coluna
COMMENT ON COLUMN public.coupons.event_id IS 'ID do evento ao qual o cupom se aplica (NULL = aplicável a todos os eventos do organizador)';

