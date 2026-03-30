-- ============================================
-- Migration 023: Add asaas_payment_id to registrations
-- Adiciona campo de referência rápida ao pagamento Asaas na tabela registrations
-- ============================================
-- 
-- Este campo permite uma referência rápida ao pagamento Asaas sem precisar
-- fazer JOIN com a tabela asaas_payments.
--
-- PRÉ-REQUISITO: Execute todas as migrações anteriores (001 a 022) antes deste script!
--
-- Uso:
--   psql -U postgres -d cronoteam -f 023_add_asaas_payment_id_to_registrations.sql
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
-- ADD COLUMN: asaas_payment_id
-- ============================================
-- Adiciona coluna apenas se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'registrations' 
        AND column_name = 'asaas_payment_id'
    ) THEN
        ALTER TABLE public.registrations 
        ADD COLUMN asaas_payment_id TEXT;
        
        -- Criar índice para melhor performance
        CREATE INDEX IF NOT EXISTS idx_registrations_asaas_payment_id 
        ON public.registrations(asaas_payment_id);
        
        -- Adicionar comentário
        COMMENT ON COLUMN public.registrations.asaas_payment_id IS 'ID do pagamento no Asaas (referência rápida)';
    END IF;
END $$;

-- ============================================
-- Migration 023: Concluída
-- ============================================


