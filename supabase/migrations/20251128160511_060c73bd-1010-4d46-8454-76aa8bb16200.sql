-- Create table for category batches (lotes)
CREATE TABLE public.category_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.event_categories(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT positive_price CHECK (price >= 0)
);

-- Enable RLS
ALTER TABLE public.category_batches ENABLE ROW LEVEL SECURITY;

-- Everyone can view batches of visible events
CREATE POLICY "Everyone can view batches of visible events"
  ON public.category_batches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_categories
      JOIN public.events ON events.id = event_categories.event_id
      WHERE event_categories.id = category_batches.category_id
      AND (
        events.status = 'published'
        OR events.organizer_id = auth.uid()
        OR has_role(auth.uid(), 'admin')
      )
    )
  );

-- Organizers can manage batches for own event categories
CREATE POLICY "Organizers can manage batches for own categories"
  ON public.category_batches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.event_categories
      JOIN public.events ON events.id = event_categories.event_id
      WHERE event_categories.id = category_batches.category_id
      AND (
        events.organizer_id = auth.uid()
        OR has_role(auth.uid(), 'admin')
      )
    )
  );

-- Create index for faster queries
CREATE INDEX idx_category_batches_category_id ON public.category_batches(category_id);
CREATE INDEX idx_category_batches_valid_from ON public.category_batches(valid_from);