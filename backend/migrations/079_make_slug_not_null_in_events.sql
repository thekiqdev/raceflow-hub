-- ============================================
-- Migration 079: Make slug column NOT NULL in events table
-- Torna o campo slug obrigatório após geração de slugs para eventos existentes
-- ============================================
-- 
-- ⚠️  IMPORTANTE: Execute o script generate-slugs-for-existing-events.ts ANTES desta migration
-- 

-- Step 1: Verificar se há eventos sem slug
DO $$
DECLARE
  events_without_slug INTEGER;
BEGIN
  SELECT COUNT(*) INTO events_without_slug 
  FROM public.events 
  WHERE slug IS NULL OR slug = '';
  
  IF events_without_slug > 0 THEN
    RAISE EXCEPTION 'Existem % eventos sem slug. Execute o script generate-slugs-for-existing-events.ts primeiro!', events_without_slug;
  END IF;
  
  RAISE NOTICE '✅ Todos os eventos têm slug. Prosseguindo com a migration...';
END $$;

-- Step 2: Tornar slug NOT NULL
ALTER TABLE public.events
ALTER COLUMN slug SET NOT NULL;

-- Step 3: Adicionar constraint UNIQUE (já temos índice único, mas constraint é mais explícita)
-- Nota: O índice único já garante unicidade, mas a constraint UNIQUE é mais explícita
DO $$
BEGIN
  -- Verificar se a constraint já existe
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'events_slug_unique' 
    AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
    ADD CONSTRAINT events_slug_unique UNIQUE (slug);
    
    RAISE NOTICE '✅ Constraint UNIQUE adicionada ao campo slug';
  ELSE
    RAISE NOTICE 'ℹ️  Constraint UNIQUE já existe no campo slug';
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.events.slug IS 
'Slug único para URLs amigáveis. Gerado automaticamente a partir do título do evento. Exemplo: "corrida-de-rua-fortaleza-2024". Campo obrigatório.';

-- Log migration completion
DO $$
DECLARE
  events_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO events_count FROM public.events;
  
  RAISE NOTICE '✅ Migration 079 concluída:';
  RAISE NOTICE '   - Campo slug agora é NOT NULL';
  RAISE NOTICE '   - Constraint UNIQUE adicionada';
  RAISE NOTICE '   - Total de eventos: %', events_count;
END $$;
