-- ============================================
-- Migration 080: Add transfers_enabled column to events table
-- Adiciona campo para controlar se transferências de inscrições estão habilitadas por evento
-- ============================================

-- Adicionar coluna para controlar transferências
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS transfers_enabled BOOLEAN DEFAULT TRUE;

-- Comentário
COMMENT ON COLUMN public.events.transfers_enabled IS 'Indica se as transferências de inscrições estão habilitadas para este evento. Quando FALSE, os participantes não podem transferir suas inscrições.';

-- Log migration completion
DO $$
DECLARE
  events_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO events_count FROM public.events;
  RAISE NOTICE '✅ Migration 080 concluída:';
  RAISE NOTICE '   - Coluna transfers_enabled adicionada à tabela events';
  RAISE NOTICE '   - Valor padrão: TRUE (transferências habilitadas)';
  RAISE NOTICE '   - Total de eventos: %', events_count;
END $$;
