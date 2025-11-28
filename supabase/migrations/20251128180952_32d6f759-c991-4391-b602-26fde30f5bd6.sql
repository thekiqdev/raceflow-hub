-- Add result_url column to events table
ALTER TABLE public.events 
ADD COLUMN result_url TEXT;

COMMENT ON COLUMN public.events.result_url IS 'URL to event results page';