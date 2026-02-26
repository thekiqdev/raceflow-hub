-- Migration 060: Add max_age field to categories table
-- This migration adds a max_age field to complement the existing min_age field

-- Add max_age column
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS max_age INTEGER NULL;

-- Add constraint to ensure max_age is valid if provided
ALTER TABLE public.categories
ADD CONSTRAINT chk_max_age CHECK (max_age IS NULL OR max_age >= 0);

-- Add constraint to ensure max_age >= min_age if both are provided
ALTER TABLE public.categories
ADD CONSTRAINT chk_age_range CHECK (
  min_age IS NULL OR 
  max_age IS NULL OR 
  max_age >= min_age
);

COMMENT ON COLUMN public.categories.max_age IS 'Idade máxima para a categoria (NULL = sem restrição)';

