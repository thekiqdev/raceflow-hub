-- ============================================
-- Migration 048: Add display_order to categories
-- Adicionar campo display_order na tabela categories para permitir ordenação customizada
-- ============================================

-- 1. Adicionar coluna display_order
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

-- 2. Inicializar display_order com base na ordem atual (name ASC)
UPDATE public.categories c
SET display_order = sub.row_num
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY name ASC) as row_num
  FROM public.categories
) sub
WHERE c.id = sub.id;

-- 3. Tornar a coluna NOT NULL após inicialização
ALTER TABLE public.categories 
ALTER COLUMN display_order SET NOT NULL;

-- 4. Criar índice composto
CREATE INDEX IF NOT EXISTS idx_categories_event_display_order 
ON public.categories(event_id, display_order);

-- 5. Adicionar comentário
COMMENT ON COLUMN public.categories.display_order IS 'Ordem de exibição da categoria no evento. Valores menores aparecem primeiro.';


