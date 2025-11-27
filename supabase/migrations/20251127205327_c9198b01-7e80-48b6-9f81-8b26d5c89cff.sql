-- Create kit pickup locations table
CREATE TABLE public.kit_pickup_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id UUID NOT NULL REFERENCES public.event_kits(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  pickup_date TIMESTAMP WITH TIME ZONE NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.kit_pickup_locations ENABLE ROW LEVEL SECURITY;

-- Everyone can view pickup locations of visible kits
CREATE POLICY "Everyone can view pickup locations of visible kits"
ON public.kit_pickup_locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.event_kits
    JOIN public.events ON events.id = event_kits.event_id
    WHERE event_kits.id = kit_pickup_locations.kit_id
    AND (
      events.status = 'published'
      OR events.organizer_id = auth.uid()
      OR has_role(auth.uid(), 'admin')
    )
  )
);

-- Organizers can manage pickup locations for own kits
CREATE POLICY "Organizers can manage pickup locations for own kits"
ON public.kit_pickup_locations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.event_kits
    JOIN public.events ON events.id = event_kits.event_id
    WHERE event_kits.id = kit_pickup_locations.kit_id
    AND (
      events.organizer_id = auth.uid()
      OR has_role(auth.uid(), 'admin')
    )
  )
);