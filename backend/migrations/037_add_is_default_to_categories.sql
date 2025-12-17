-- ============================================
-- Migration 037: Add is_default to categories
-- Adiciona campo is_default para marcar categoria padrão
-- ============================================

-- Adicionar campo is_default na tabela categories
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Criar índice para melhor performance nas consultas de categoria padrão
CREATE INDEX IF NOT EXISTS idx_categories_event_id_is_default 
ON public.categories(event_id, is_default) 
WHERE is_default = true;

-- Comentário na coluna
COMMENT ON COLUMN public.categories.is_default IS 'Indica se esta é a categoria padrão do evento. Apenas uma categoria por evento pode ser padrão.';
