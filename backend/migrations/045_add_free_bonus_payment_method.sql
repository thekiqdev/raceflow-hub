-- ============================================
-- Migration 045: Add 'free_bonus' to payment_method enum
-- Adiciona o valor 'free_bonus' ao enum payment_method para suportar inscrições grátis de bônus
-- ============================================

-- Adicionar 'free_bonus' ao enum payment_method
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'free_bonus';

-- Comentário
COMMENT ON TYPE payment_method IS 'Métodos de pagamento: pix, credit_card, boleto, free_bonus (inscrição grátis por bônus)';

