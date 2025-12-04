-- ============================================
-- Migration 018: Allow NULL in valid_from
-- Permite que valid_from seja NULL em category_batches
-- ============================================

-- Alterar coluna valid_from para permitir NULL
ALTER TABLE public.category_batches
ALTER COLUMN valid_from DROP NOT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.category_batches.valid_from IS 'Data e hora de início do lote (NULL = sem data específica)';

