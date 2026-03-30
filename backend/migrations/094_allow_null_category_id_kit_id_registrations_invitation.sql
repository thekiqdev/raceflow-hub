-- ============================================
-- Migration 094: Allow NULL category_id (and kit_id if constrained) in registrations
-- Necessário para convite "deixar o corredor escolher": a inscrição fica sem categoria
-- até o corredor completar no painel. Inscrições normais continuam com category_id preenchido.
-- ============================================

-- category_id: permitir NULL para inscrições por convite pendentes de escolha do corredor
ALTER TABLE public.registrations
  ALTER COLUMN category_id DROP NOT NULL;

COMMENT ON COLUMN public.registrations.category_id IS 'ID da categoria. NULL quando convite com "corredor escolhe" ainda não foi completado.';
