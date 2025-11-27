-- Create kit_products table
CREATE TABLE public.kit_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id UUID NOT NULL REFERENCES public.event_kits(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('variable', 'unique')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create product_variants table (for variable products)
CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.kit_products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kit_products
CREATE POLICY "Everyone can view products of visible kits"
ON public.kit_products FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM event_kits
    JOIN events ON events.id = event_kits.event_id
    WHERE event_kits.id = kit_products.kit_id
    AND (events.status = 'published' OR events.organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Organizers can manage products for own kits"
ON public.kit_products FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM event_kits
    JOIN events ON events.id = event_kits.event_id
    WHERE event_kits.id = kit_products.kit_id
    AND (events.organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

-- RLS Policies for product_variants
CREATE POLICY "Everyone can view variants of visible products"
ON public.product_variants FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM kit_products
    JOIN event_kits ON event_kits.id = kit_products.kit_id
    JOIN events ON events.id = event_kits.event_id
    WHERE kit_products.id = product_variants.product_id
    AND (events.status = 'published' OR events.organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Organizers can manage variants for own products"
ON public.product_variants FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM kit_products
    JOIN event_kits ON event_kits.id = kit_products.kit_id
    JOIN events ON events.id = event_kits.event_id
    WHERE kit_products.id = product_variants.product_id
    AND (events.organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);