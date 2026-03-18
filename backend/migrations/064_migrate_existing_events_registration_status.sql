-- Migration 064: Migrate existing events to have default registration status
-- This migration ensures backward compatibility by setting default registration_status
-- for existing events based on their current status

-- Update existing events with default registration status values
-- Only update events where registration_status is NULL (not already set)
UPDATE public.events
SET 
  registration_status = CASE
    WHEN status = 'published' OR status = 'ongoing' THEN 'open'
    WHEN status = 'finished' OR status = 'cancelled' THEN 'closed'
    ELSE NULL  -- Keep NULL for 'draft' and other statuses
  END,
  registration_auto_mode = false  -- Manual mode by default for existing events
WHERE registration_status IS NULL;

-- Log the migration results
DO $$
DECLARE
  published_count INTEGER;
  finished_count INTEGER;
  cancelled_count INTEGER;
  draft_count INTEGER;
  total_updated INTEGER;
BEGIN
  -- Count events by status after migration
  SELECT COUNT(*) INTO published_count 
  FROM public.events 
  WHERE status IN ('published', 'ongoing') AND registration_status = 'open';
  
  SELECT COUNT(*) INTO finished_count 
  FROM public.events 
  WHERE status = 'finished' AND registration_status = 'closed';
  
  SELECT COUNT(*) INTO cancelled_count 
  FROM public.events 
  WHERE status = 'cancelled' AND registration_status = 'closed';
  
  SELECT COUNT(*) INTO draft_count 
  FROM public.events 
  WHERE status = 'draft' AND registration_status IS NULL;
  
  SELECT COUNT(*) INTO total_updated 
  FROM public.events 
  WHERE registration_status IS NOT NULL;
  
  RAISE NOTICE 'Migration 064 completed:';
  RAISE NOTICE '  - Published/Ongoing events set to "open": %', published_count;
  RAISE NOTICE '  - Finished events set to "closed": %', finished_count;
  RAISE NOTICE '  - Cancelled events set to "closed": %', cancelled_count;
  RAISE NOTICE '  - Draft events kept as NULL: %', draft_count;
  RAISE NOTICE '  - Total events with registration_status: %', total_updated;
END $$;
