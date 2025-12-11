-- ============================================
-- Migration 027: Allow NULL registration_id in asaas_payments
-- Permite que pagamentos de transferência não tenham registration_id
-- ============================================

-- Alterar a coluna registration_id para permitir NULL
ALTER TABLE public.asaas_payments 
  ALTER COLUMN registration_id DROP NOT NULL;

-- Adicionar comentário explicando o uso de NULL
COMMENT ON COLUMN public.asaas_payments.registration_id IS 'ID da inscrição (FK para registrations). NULL para pagamentos de transferência.';

-- ============================================
-- Migration 027: Concluída
-- ============================================

