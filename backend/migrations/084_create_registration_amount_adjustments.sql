-- ============================================
-- Migration 084: Create registration_amount_adjustments
-- Registra alterações de valor na edição (reembolso manual pendente, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS public.registration_amount_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  old_total DECIMAL(10, 2) NOT NULL,
  new_total DECIMAL(10, 2) NOT NULL,
  adjustment_type TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_amount_adjustments_registration_id
  ON public.registration_amount_adjustments(registration_id);
CREATE INDEX IF NOT EXISTS idx_registration_amount_adjustments_adjustment_type
  ON public.registration_amount_adjustments(adjustment_type);

COMMENT ON TABLE public.registration_amount_adjustments IS 'Ajustes de valor em inscrições (ex.: reembolso manual pendente após edição que reduziu o total)';
COMMENT ON COLUMN public.registration_amount_adjustments.adjustment_type IS 'Ex.: refund_pending (reembolso manual pendente)';
