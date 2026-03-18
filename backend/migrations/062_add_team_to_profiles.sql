-- Migration 062: Add team field to profiles table
-- This migration adds a team field for runner profiles

-- Add team column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS team TEXT;

COMMENT ON COLUMN public.profiles.team IS 'Equipe do corredor';

