-- Migration 061: Add profession and cbat fields to profiles table
-- This migration adds profession and cbat fields for runner profiles

-- Add profession column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS profession TEXT;

-- Add cbat column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cbat TEXT;

COMMENT ON COLUMN public.profiles.profession IS 'Profissão do corredor';
COMMENT ON COLUMN public.profiles.cbat IS 'CBAT (Confederação Brasileira de Atletismo) do corredor';

