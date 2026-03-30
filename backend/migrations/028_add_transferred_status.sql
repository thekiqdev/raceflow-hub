-- ============================================
-- Migration 028: Add 'transferred' status to registration_status enum
-- Adiciona o status 'transferred' ao enum registration_status
-- ============================================

-- Adicionar 'transferred' ao enum registration_status
ALTER TYPE public.registration_status ADD VALUE IF NOT EXISTS 'transferred';

-- Comentário para documentação
COMMENT ON TYPE public.registration_status IS 'Status da inscrição: pending, confirmed, cancelled, refund_requested, refunded, transferred';

-- ============================================
-- Migration 028: Concluída
-- ============================================

