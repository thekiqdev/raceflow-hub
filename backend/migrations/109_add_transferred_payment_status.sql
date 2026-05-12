-- ============================================
-- Migration 109: Add 'transferred' to payment_status enum
-- ============================================

ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'transferred';

COMMENT ON TYPE public.payment_status IS 'Status de pagamento: pending, paid, partially_paid, refunded, failed, convidado, transferred';
