-- ============================================
-- Migration 078: Add slug column to events table
-- Adiciona campo slug para URLs amigáveis
-- ============================================

-- Step 1: Add slug column (allow NULL temporarily for migration)
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Step 2: Create unique index on slug (allows NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug_unique 
ON public.events(slug) 
WHERE slug IS NOT NULL;

-- Step 3: Create regular index for performance
CREATE INDEX IF NOT EXISTS idx_events_slug 
ON public.events(slug);

-- Add comment
COMMENT ON COLUMN public.events.slug IS 
'Slug único para URLs amigáveis. Gerado automaticamente a partir do título do evento. Exemplo: "corrida-de-rua-fortaleza-2024"';

-- Log migration completion
DO $$
DECLARE
  events_count INTEGER;
  events_with_slug INTEGER;
BEGIN
  SELECT COUNT(*) INTO events_count FROM public.events;
  SELECT COUNT(*) INTO events_with_slug FROM public.events WHERE slug IS NOT NULL;
  
  RAISE NOTICE '✅ Migration 078 concluída:';
  RAISE NOTICE '   - Coluna slug adicionada à tabela events';
  RAISE NOTICE '   - Índices criados (único e regular)';
  RAISE NOTICE '   - Total de eventos: %', events_count;
  RAISE NOTICE '   - Eventos com slug: %', events_with_slug;
  RAISE NOTICE '   - ⚠️  Execute o script generate-slugs-for-existing-events.ts para gerar slugs para eventos existentes';
END $$;
