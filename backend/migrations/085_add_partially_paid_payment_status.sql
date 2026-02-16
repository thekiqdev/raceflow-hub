-- ============================================
-- Migration 085: Add 'partially_paid' to payment_status enum
-- Inscrição já paga com diferença a cobrar (edição pelo admin) → botão "Pagar diferença" no painel do corredor
-- ============================================

-- Adicionar 'partially_paid' ao enum payment_status
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partially_paid';

-- Comentário
COMMENT ON TYPE payment_status IS 'Status de pagamento: pending, paid, partially_paid, refunded, failed, convidado';
