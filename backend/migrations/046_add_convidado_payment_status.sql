-- ============================================
-- Migration 046: Add 'convidado' to payment_status enum
-- Adiciona o valor 'convidado' ao enum payment_status para inscrições grátis por convite
-- ============================================

-- Adicionar 'convidado' ao enum payment_status
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'convidado';

-- Comentário
COMMENT ON TYPE payment_status IS 'Status de pagamento: pending, paid, refunded, failed, convidado (inscrição grátis por convite)';

