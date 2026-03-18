-- Migration 063: Add registration status fields to events table
-- This migration adds fields to control registration status (manual and automatic modes)

-- Add registration_status column
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_status TEXT 
CHECK (registration_status IS NULL OR registration_status IN ('not_open', 'open', 'closed'));

-- Add registration_start_date column
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_start_date TIMESTAMP WITH TIME ZONE;

-- Add registration_end_date column
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_end_date TIMESTAMP WITH TIME ZONE;

-- Add registration_auto_mode column
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS registration_auto_mode BOOLEAN DEFAULT false;

-- Add constraint to validate that end_date >= start_date (when both are not NULL)
ALTER TABLE public.events
ADD CONSTRAINT chk_registration_dates 
CHECK (
  registration_start_date IS NULL OR 
  registration_end_date IS NULL OR 
  registration_end_date >= registration_start_date
);

-- Add comments to explain the columns
COMMENT ON COLUMN public.events.registration_status IS 
'Status das inscrições: not_open (em breve), open (abertas), closed (encerradas). NULL usa lógica padrão baseada no status do evento.';

COMMENT ON COLUMN public.events.registration_start_date IS 
'Data/hora de abertura das inscrições. Usado para cálculo automático do status quando registration_auto_mode = true.';

COMMENT ON COLUMN public.events.registration_end_date IS 
'Data/hora de encerramento das inscrições. Usado para cálculo automático do status quando registration_auto_mode = true.';

COMMENT ON COLUMN public.events.registration_auto_mode IS 
'Se true, o status de inscrições é calculado automaticamente baseado nas datas. Se false, usa o valor manual de registration_status.';

-- Create indexes for performance in queries of events with open registrations
CREATE INDEX IF NOT EXISTS idx_events_registration_dates 
ON public.events(registration_start_date, registration_end_date) 
WHERE registration_auto_mode = true;

CREATE INDEX IF NOT EXISTS idx_events_registration_status 
ON public.events(registration_status) 
WHERE registration_status IS NOT NULL;
