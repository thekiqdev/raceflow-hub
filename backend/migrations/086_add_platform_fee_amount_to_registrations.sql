-- ============================================
-- Migration 086: Add platform_fee_amount and registration_edit_fee_amount to registrations
-- OK Etapa 1 - Persistir taxas por inscrição (taxa inicial e taxa de atualização)
-- ============================================

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS platform_fee_amount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS registration_edit_fee_amount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS platform_fee_backfilled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.registrations.platform_fee_amount IS 'Taxa da plataforma aplicada na inscrição inicial (R$). Preenchida na criação ou por backfill em inscrições antigas.';
COMMENT ON COLUMN public.registrations.registration_edit_fee_amount IS 'Taxa de atualização aplicada na edição quando o valor muda (R$).';
COMMENT ON COLUMN public.registrations.platform_fee_backfilled IS 'TRUE se platform_fee_amount foi preenchido por script de backfill (inscrições antigas).';
