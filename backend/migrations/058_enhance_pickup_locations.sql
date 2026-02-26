-- Migration 058: Enhance pickup locations with name and multiple dates/times
-- This migration adds:
-- 1. name field for the pickup location
-- 2. pickup_schedule JSONB field to store multiple dates and time slots

-- Add name column
ALTER TABLE public.kit_pickup_locations 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add pickup_schedule JSONB column to store multiple dates and time slots
-- Structure: [{"date": "YYYY-MM-DD", "time_slots": [{"start_time": "HH:MM", "end_time": "HH:MM"}, ...]}, ...]
ALTER TABLE public.kit_pickup_locations 
ADD COLUMN IF NOT EXISTS pickup_schedule JSONB DEFAULT '[]'::jsonb;

-- Create index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_kit_pickup_locations_schedule 
ON public.kit_pickup_locations USING GIN (pickup_schedule);

-- Update existing records: migrate pickup_date to pickup_schedule format
-- For existing records, create a schedule with a single date/time slot
UPDATE public.kit_pickup_locations
SET pickup_schedule = jsonb_build_array(
  jsonb_build_object(
    'date', to_char(pickup_date, 'YYYY-MM-DD'),
    'time_slots', jsonb_build_array(
      jsonb_build_object(
        'start_time', to_char(pickup_date, 'HH24:MI'),
        'end_time', to_char(pickup_date + interval '4 hours', 'HH24:MI')
      )
    )
  )
)
WHERE pickup_schedule = '[]'::jsonb OR pickup_schedule IS NULL;

-- Make name NOT NULL for new records (but allow NULL for existing ones)
-- We'll handle this in the application layer for now

COMMENT ON COLUMN public.kit_pickup_locations.name IS 'Nome do local de retirada';
COMMENT ON COLUMN public.kit_pickup_locations.pickup_schedule IS 'Array de datas e horários de retirada. Formato: [{"date": "YYYY-MM-DD", "time_slots": [{"start_time": "HH:MM", "end_time": "HH:MM"}]}]';

