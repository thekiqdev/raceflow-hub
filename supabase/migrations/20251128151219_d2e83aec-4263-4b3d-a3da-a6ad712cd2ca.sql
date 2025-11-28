-- Drop existing table and recreate with event_id instead of kit_id
DROP TABLE IF EXISTS public.kit_pickup_locations;

CREATE TABLE public.kit_pickup_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  pickup_date TIMESTAMP WITH TIME ZONE NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kit_pickup_locations ENABLE ROW LEVEL SECURITY;

-- Everyone can view pickup locations of visible events
CREATE POLICY "Everyone can view pickup locations of visible events"
ON public.kit_pickup_locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = kit_pickup_locations.event_id
    AND (
      events.status = 'published'
      OR events.organizer_id = auth.uid()
      OR has_role(auth.uid(), 'admin')
    )
  )
);

-- Organizers can manage pickup locations for own events
CREATE POLICY "Organizers can manage pickup locations for own events"
ON public.kit_pickup_locations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id = kit_pickup_locations.event_id
    AND (
      events.organizer_id = auth.uid()
      OR has_role(auth.uid(), 'admin')
    )
  )
);