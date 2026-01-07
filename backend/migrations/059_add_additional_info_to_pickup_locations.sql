-- Migration 059: Add additional_info field to pickup locations
-- This migration adds an additional_info field for extra information about the pickup location

-- Add additional_info column
ALTER TABLE public.kit_pickup_locations 
ADD COLUMN IF NOT EXISTS additional_info TEXT;

COMMENT ON COLUMN public.kit_pickup_locations.additional_info IS 'Informações adicionais sobre o local de retirada (ex: estacionamento, acessibilidade, etc.)';

