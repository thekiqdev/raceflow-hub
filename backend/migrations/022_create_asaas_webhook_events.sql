-- ============================================
-- Migration 022: Create Asaas Webhook Events Table
-- Cria tabela para armazenar eventos recebidos via webhook do Asaas
-- ============================================
-- 
-- Esta tabela armazena todos os eventos recebidos via webhook do Asaas para:
-- - Auditoria e debug
-- - Reprocessamento de eventos falhados
-- - Rastreamento de mudanças de status
--
-- PRÉ-REQUISITO: Execute todas as migrações anteriores (001 a 021) antes deste script!
--
-- Uso:
--   psql -U postgres -d cronoteam -f 022_create_asaas_webhook_events.sql
-- ============================================

-- ============================================
-- VERIFICAÇÃO DE PRÉ-REQUISITOS
-- ============================================
DO $$
BEGIN
    -- Verificar se a tabela registrations existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'registrations'
    ) THEN
        RAISE EXCEPTION 'Tabela registrations não existe. Execute a migration 001_initial_schema.sql primeiro!';
    END IF;
END $$;

-- ============================================
-- CREATE TABLE: asaas_webhook_events
-- ============================================
CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  asaas_payment_id TEXT,
  registration_id UUID REFERENCES public.registrations(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_payment_id ON public.asaas_webhook_events(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_registration_id ON public.asaas_webhook_events(registration_id);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_processed ON public.asaas_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_event_type ON public.asaas_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_created_at ON public.asaas_webhook_events(created_at);

-- ============================================
-- COMENTÁRIOS NAS COLUNAS
-- ============================================
COMMENT ON TABLE public.asaas_webhook_events IS 'Armazena eventos recebidos via webhook do Asaas para auditoria e reprocessamento';
COMMENT ON COLUMN public.asaas_webhook_events.id IS 'ID único do evento';
COMMENT ON COLUMN public.asaas_webhook_events.event_type IS 'Tipo do evento: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, etc.';
COMMENT ON COLUMN public.asaas_webhook_events.asaas_payment_id IS 'ID do pagamento no Asaas';
COMMENT ON COLUMN public.asaas_webhook_events.registration_id IS 'ID da inscrição relacionada (FK para registrations)';
COMMENT ON COLUMN public.asaas_webhook_events.payload IS 'Payload completo do webhook em formato JSON';
COMMENT ON COLUMN public.asaas_webhook_events.processed IS 'Indica se o evento foi processado com sucesso';
COMMENT ON COLUMN public.asaas_webhook_events.error_message IS 'Mensagem de erro (se houver) durante o processamento';
COMMENT ON COLUMN public.asaas_webhook_events.created_at IS 'Data de recebimento do evento';

-- ============================================
-- Migration 022: Concluída
-- ============================================


