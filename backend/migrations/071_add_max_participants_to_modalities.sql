-- ============================================
-- Migration 071: Add max_participants to modalities
-- Adiciona campo para limitar número de inscrições por modalidade
-- ============================================

-- Adicionar coluna max_participants na tabela modalities
ALTER TABLE public.modalities
ADD COLUMN IF NOT EXISTS max_participants INTEGER NULL;

-- Adicionar constraint para garantir que max_participants seja positivo quando definido
ALTER TABLE public.modalities
ADD CONSTRAINT chk_modalities_max_participants 
CHECK (max_participants IS NULL OR max_participants > 0);

-- Comentários
COMMENT ON COLUMN public.modalities.max_participants IS 'Limite máximo de participantes para esta modalidade. NULL = sem limite';

-- Log migration completion
DO $$
DECLARE
  modalities_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO modalities_count FROM public.modalities;
  RAISE NOTICE '✅ Migration 071 concluída:';
  RAISE NOTICE '   - Coluna max_participants adicionada à tabela modalities';
  RAISE NOTICE '   - Modalidades existentes: %', modalities_count;
END $$;
