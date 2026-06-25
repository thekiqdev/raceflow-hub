-- Migration 116: Eventos externos (link para inscrição fora da plataforma)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS external_url TEXT;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('NORMAL', 'EXTERNAL'));

COMMENT ON COLUMN public.events.event_type IS 'NORMAL = fluxo padrão; EXTERNAL = inscrição via link externo';
COMMENT ON COLUMN public.events.external_url IS 'URL de inscrição externa (obrigatória quando event_type = EXTERNAL)';
