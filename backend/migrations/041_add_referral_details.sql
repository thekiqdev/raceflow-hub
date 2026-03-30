-- Migration 041: Add event_id, coupon_code, and registration_id to user_referrals
-- This allows tracking which event the referral was used for and if it was via coupon

-- Add new columns to user_referrals table
ALTER TABLE public.user_referrals
ADD COLUMN IF NOT EXISTS event_id UUID,
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS registration_id UUID;

-- Add foreign key constraints
ALTER TABLE public.user_referrals
ADD CONSTRAINT fk_user_referrals_event 
    FOREIGN KEY (event_id) 
    REFERENCES public.events(id) 
    ON DELETE SET NULL;

ALTER TABLE public.user_referrals
ADD CONSTRAINT fk_user_referrals_registration 
    FOREIGN KEY (registration_id) 
    REFERENCES public.registrations(id) 
    ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_referrals_event_id ON public.user_referrals(event_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_registration_id ON public.user_referrals(registration_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_coupon_code ON public.user_referrals(coupon_code);

-- Add comments
COMMENT ON COLUMN public.user_referrals.event_id IS 'ID do evento onde a referência foi usada';
COMMENT ON COLUMN public.user_referrals.coupon_code IS 'Código do cupom usado (se aplicável)';
COMMENT ON COLUMN public.user_referrals.registration_id IS 'ID da inscrição que gerou a referência';

-- ============================================
-- Migration 041: Concluída
-- ============================================

