-- ============================================
-- Migration 070: Add payment methods configuration to events
-- Adiciona campos para configurar métodos de pagamento disponíveis por evento
-- ============================================

-- Adicionar colunas para configuração de PIX
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS pix_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS pix_disabled_at TIMESTAMP WITH TIME ZONE;

-- Adicionar colunas para configuração de Cartão de Crédito
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS credit_card_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS credit_card_disabled_at TIMESTAMP WITH TIME ZONE;

-- Comentários
COMMENT ON COLUMN public.events.pix_enabled IS 'Indica se o pagamento via PIX está habilitado para este evento';
COMMENT ON COLUMN public.events.pix_disabled_at IS 'Data/hora em que o PIX será desabilitado automaticamente (NULL = sem desabilitação automática)';
COMMENT ON COLUMN public.events.credit_card_enabled IS 'Indica se o pagamento via cartão de crédito está habilitado para este evento';
COMMENT ON COLUMN public.events.credit_card_disabled_at IS 'Data/hora em que o cartão de crédito será desabilitado automaticamente (NULL = sem desabilitação automática)';

-- Log migration completion
DO $$
DECLARE
  events_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO events_count FROM public.events;
  RAISE NOTICE '✅ Migration 070 concluída:';
  RAISE NOTICE '   - Colunas de configuração de pagamento adicionadas à tabela events';
  RAISE NOTICE '   - Eventos existentes: %', events_count;
END $$;
