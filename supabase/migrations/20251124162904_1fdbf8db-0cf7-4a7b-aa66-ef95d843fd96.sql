-- Create table for home page customization
CREATE TABLE IF NOT EXISTS public.home_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title TEXT NOT NULL DEFAULT 'Agende seu Próximo Evento Esportivo',
  hero_subtitle TEXT DEFAULT 'Gestão completa de cronometragem e inscrições para corridas e eventos esportivos',
  hero_image_url TEXT,
  whatsapp_number TEXT DEFAULT '+5511999999999',
  whatsapp_text TEXT DEFAULT 'Entre em contato via WhatsApp',
  consultoria_title TEXT DEFAULT 'Consultoria Especializada em Eventos Esportivos',
  consultoria_description TEXT DEFAULT 'Nossa equipe oferece consultoria completa para organização de eventos esportivos',
  stats_events TEXT DEFAULT '500+',
  stats_events_label TEXT DEFAULT 'Eventos Realizados',
  stats_runners TEXT DEFAULT '50k+',
  stats_runners_label TEXT DEFAULT 'Corredores Atendidos',
  stats_cities TEXT DEFAULT '100+',
  stats_cities_label TEXT DEFAULT 'Cidades',
  stats_years TEXT DEFAULT '10+',
  stats_years_label TEXT DEFAULT 'Anos de Experiência',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.home_page_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view settings
CREATE POLICY "Everyone can view home page settings"
  ON public.home_page_settings
  FOR SELECT
  USING (true);

-- Policy: Only admins can update settings
CREATE POLICY "Admins can update home page settings"
  ON public.home_page_settings
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Only admins can insert settings
CREATE POLICY "Admins can insert home page settings"
  ON public.home_page_settings
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.home_page_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER update_home_page_settings_updated_at
  BEFORE UPDATE ON public.home_page_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();